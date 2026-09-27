const { GoogleGenAI, Type } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 30000;

function getModel() {
  const configured = String(process.env.GEMINI_MODEL || '').trim();
  return configured || DEFAULT_MODEL;
}

function getTimeoutMs() {
  const parsed = Number(process.env.GEMINI_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 120000);
  return DEFAULT_TIMEOUT_MS;
}

function isConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

let clientOverride = null;

function setClientOverride(client) {
  clientOverride = client || null;
}

function getClient() {
  if (clientOverride) return clientOverride;
  if (!isConfigured()) {
    const error = new Error(
      'Gemini API key is not configured. Set GEMINI_API_KEY in server/.env (see server/.env.example).'
    );
    error.code = 'GEMINI_MISSING_KEY';
    error.statusCode = 503;
    throw error;
  }
  return new GoogleGenAI({ apiKey: String(process.env.GEMINI_API_KEY).trim() });
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Gemini request timed out after ${timeoutMs} ms. Please try again.`);
      error.code = 'GEMINI_TIMEOUT';
      error.statusCode = 504;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Bounded retry policy for transient Gemini failures. */
const RETRY_DEFAULTS = {
  maxAttempts: 3, // 1 initial attempt + up to 2 retries
  maxAttemptsLimit: 5,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  jitterRatio: 0.25,
};

/** Failures that can plausibly succeed when the same request is sent again. */
const RETRYABLE_CODES = new Set(['GEMINI_TIMEOUT', 'GEMINI_RATE_LIMIT', 'GEMINI_UNAVAILABLE']);
/** Failures that will never succeed on a retry: retrying only burns quota. */
const NON_RETRYABLE_CODES = new Set([
  'GEMINI_AUTH_ERROR',
  'GEMINI_MISSING_KEY',
  'GEMINI_MODEL_NOT_FOUND',
  'GEMINI_EMPTY_RESPONSE',
  'GEMINI_MALFORMED_RESPONSE',
  'GEMINI_INVALID_RESPONSE',
]);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_HINT = /UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|try again later/i;

/**
 * Decide whether a normalized Gemini error is worth another attempt.
 * Client-side problems (bad key, unknown model, malformed payload) are final.
 */
function isRetryable(error) {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  if (NON_RETRYABLE_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  const status = Number(error.statusCode || error.status);
  if (Number.isFinite(status) && status >= 400 && !RETRYABLE_STATUS.has(status)) return false;
  if (Number.isFinite(status) && RETRYABLE_STATUS.has(status)) return true;
  return RETRYABLE_HINT.test(String(error.message || ''));
}

/** Read a header from either a fetch Headers instance or a plain object. */
function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    const viaGetter = headers.get(name);
    return viaGetter === undefined ? null : viaGetter;
  }
  if (typeof headers === 'object') {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    return key ? headers[key] : null;
  }
  return null;
}

/**
 * Retry-After in milliseconds, taken from whichever shape the upstream/SDK
 * exposes (`retryAfterMs`, `retryAfterSeconds`, or a `retry-after` header that
 * may be either seconds or an HTTP date). Returns null when absent.
 */
function getRetryAfterMs(error) {
  if (!error) return null;
  if (Number.isFinite(error.retryAfterMs)) return Math.max(0, Number(error.retryAfterMs));
  if (Number.isFinite(error.retryAfterSeconds)) return Math.max(0, Number(error.retryAfterSeconds) * 1000);
  for (const source of [error.response, error, error.error, error.rawResponse]) {
    const raw = readHeader(source && source.headers, 'retry-after');
    if (raw === null || raw === undefined || raw === '') continue;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const when = Date.parse(String(raw));
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  }
  return null;
}

let retryOverrides = null;

/** Test hook: inject attempt/delay settings and a deterministic sleep. */
function setRetryOverrides(overrides) {
  retryOverrides = overrides || null;
}

/** Resolve the retry policy from test overrides, then env vars, then defaults. */
function getRetryConfig() {
  const envNumber = (name, fallback, min, max) => {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return Math.min(parsed, max);
  };
  return {
    maxAttempts:
      retryOverrides?.maxAttempts ??
      envNumber('GEMINI_MAX_ATTEMPTS', RETRY_DEFAULTS.maxAttempts, 1, RETRY_DEFAULTS.maxAttemptsLimit),
    baseDelayMs:
      retryOverrides?.baseDelayMs ?? envNumber('GEMINI_RETRY_BASE_MS', RETRY_DEFAULTS.baseDelayMs, 0, 10000),
    maxDelayMs:
      retryOverrides?.maxDelayMs ?? envNumber('GEMINI_RETRY_MAX_DELAY_MS', RETRY_DEFAULTS.maxDelayMs, 0, 60000),
    jitterRatio: retryOverrides?.jitterRatio ?? RETRY_DEFAULTS.jitterRatio,
    sleep: retryOverrides?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

/** Exponential backoff (bounded by maxDelayMs) plus optional jitter. */
function backoffDelayMs(attempt, config) {
  const capped = Math.min(config.baseDelayMs * 2 ** (attempt - 1), config.maxDelayMs);
  return Math.round(capped + capped * config.jitterRatio * Math.random());
}

/**
 * Run an operation with bounded retries for retryable Gemini failures only.
 *
 * - exponential backoff with jitter, capped by GEMINI_RETRY_MAX_DELAY_MS
 * - honors Retry-After; when it exceeds the cap the call fails fast instead of
 *   holding a request open (and spending quota) on a long sleep
 * - deterministic upper bound: at most GEMINI_MAX_ATTEMPTS calls
 * - the thrown error carries `attempts` (and `retryAfterSeconds` when known)
 */
async function withRetry(operation) {
  const config = getRetryConfig();
  let lastError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retryAfterMs = getRetryAfterMs(error);
      const normalized =
        error && typeof error.code === 'string' && error.code.startsWith('GEMINI_')
          ? error
          : normalizeGeminiError(error);
      normalized.attempts = attempt;
      if (retryAfterMs !== null) {
        normalized.retryAfterMs = retryAfterMs;
        normalized.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      }
      lastError = normalized;

      if (attempt >= config.maxAttempts || !isRetryable(normalized)) throw normalized;
      if (retryAfterMs !== null && retryAfterMs > config.maxDelayMs) throw normalized;

      await config.sleep(retryAfterMs !== null ? retryAfterMs : backoffDelayMs(attempt, config));
    }
  }

  throw lastError;
}

function extractJsonPayload(rawText) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    const error = new Error('Gemini returned an empty response. Please try again.');
    error.code = 'GEMINI_EMPTY_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  let text = rawText.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    const error = new Error('Gemini returned a malformed response (no JSON object found). Please try again.');
    error.code = 'GEMINI_MALFORMED_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    const error = new Error('Gemini returned a malformed response (invalid JSON). Please try again.');
    error.code = 'GEMINI_MALFORMED_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
}

function normalizeGeminiError(error) {
  if (error && typeof error.code === 'string' && error.code.startsWith('GEMINI_')) {
    return error;
  }
  const status = error && (error.status || error.statusCode);
  const message = String((error && error.message) || '');
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(message)) {
    const err = new Error('Gemini API key is invalid. Check GEMINI_API_KEY in server/.env.');
    err.code = 'GEMINI_AUTH_ERROR';
    err.statusCode = 503;
    return err;
  }
  // Unknown / retired model (Google answers 404 NOT_FOUND for these).
  if (
    status === 404 ||
    /not found|NOT_FOUND|no longer available|not supported|unsupported model|does not exist/i.test(message)
  ) {
    const err = new Error(
      'The configured Gemini model is unavailable or not supported for this API key. Check GEMINI_MODEL in server/.env.'
    );
    err.code = 'GEMINI_MODEL_NOT_FOUND';
    err.statusCode = 404;
    return err;
  }
  if (/quota|rate ?limit|429|RESOURCE_EXHAUSTED/i.test(message)) {
    const err = new Error('Gemini rate limit reached. Please wait a moment and try again.');
    err.code = 'GEMINI_RATE_LIMIT';
    err.statusCode = 429;
    return err;
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(message)) {
    const err = new Error('Could not reach the Gemini service. Please try again.');
    err.code = 'GEMINI_UNAVAILABLE';
    err.statusCode = 502;
    return err;
  }
  const err = new Error('Gemini request failed. Please try again later.');
  err.code = 'GEMINI_REQUEST_FAILED';
  err.statusCode = typeof status === 'number' && status >= 400 && status < 600 ? status : 502;
  return err;
}

async function generateStructured(prompt, responseSchema, options = {}) {
  const timeoutMs = options.timeoutMs || getTimeoutMs();
  const model = getModel();
  let response;
  try {
    // Bounded retries for transient upstream failures only (503 / 429 /
    // timeouts). Non-retryable problems (bad key, retired model) fail at once.
    response = await withRetry(async () => {
      const client = getClient();
      const attempt = client.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema, temperature: 0.7 },
      });
      return withTimeout(attempt, timeoutMs); // per-attempt timeout
    });
  } catch (error) {
    throw normalizeGeminiError(error);
  }
  const text = typeof response.text === 'function' ? response.text() : response.text;
  try {
    return extractJsonPayload(text);
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}

function buildRecommendationPrompt({ age, fitnessGoal, experienceLevel }) {
  return [
    'You are a certified fitness coach creating a personalized workout recommendation.',
    `User profile: age ${age}, fitness goal "${fitnessGoal}", experience level "${experienceLevel}".`,
    'Create a balanced weekly workout schedule (3-5 training days plus rest days) with specific',
    'exercise names and, where appropriate, sets x reps or durations in minutes.',
    'The response must include: a personalized workout plan overview, the weekly exercise schedule,',
    'exercise recommendations suited to the experience level, practical training tips, rest and',
    'recovery recommendations, general safety guidance, and short motivational guidance.',
    'Rules: do NOT assume the user has any medical condition. Recommend only general, moderate,',
    'widely-practiced exercises - no extreme, high-risk or potentially unsafe programming.',
    'Advise the user to stop and consult a professional if they feel pain or dizziness.',
    'Respond with JSON ONLY, matching the provided schema. No markdown fences, no extra prose.',
  ].join('\n');
}

function buildInsightsPrompt({ stats, source }) {
  const origin = source === 'database'
    ? "These statistics were computed from the user's verified workout records in MongoDB."
    : 'These statistics were submitted by the user (self-reported, not verified against the database).';
  return [
    'You are a fitness analyst summarizing training progress.',
    origin,
    `Statistics: total workouts ${stats.totalWorkouts}, average workout duration ${stats.averageWorkoutDuration} minutes,`,
    `total calories burned ${stats.totalCaloriesBurned}.`,
    'Write: a fitness performance summary, observations about workout consistency, general suggestions',
    'for improvement, motivational advice, and an overall progress summary.',
    'Rules: do NOT invent workout history beyond the statistics given. Keep advice general and safe;',
    'do not assume medical conditions and do not prescribe extreme training.',
    'Respond with JSON ONLY, matching the provided schema. No markdown fences, no extra prose.',
  ].join('\n');
}

const recommendationSchema = {
  type: Type.OBJECT,
  properties: {
    workoutPlan: { type: Type.STRING, description: 'Personalized workout plan overview' },
    weeklySchedule: {
      type: Type.ARRAY,
      description: 'One entry per training day',
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING },
          focus: { type: Type.STRING },
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                detail: { type: Type.STRING, description: 'Sets x reps or duration' },
              },
              required: ['name'],
            },
          },
          durationMinutes: { type: Type.NUMBER },
        },
        required: ['day', 'focus', 'exercises'],
      },
    },
    experienceRecommendations: { type: Type.STRING },
    trainingTips: { type: Type.ARRAY, items: { type: Type.STRING } },
    restAndRecovery: { type: Type.STRING },
    safetyGuidance: { type: Type.STRING },
    motivation: { type: Type.STRING },
  },
  required: [
    'workoutPlan', 'weeklySchedule', 'experienceRecommendations',
    'trainingTips', 'restAndRecovery', 'safetyGuidance', 'motivation',
  ],
};

const insightsSchema = {
  type: Type.OBJECT,
  properties: {
    performanceSummary: { type: Type.STRING },
    consistencyObservations: { type: Type.STRING },
    improvementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
    motivationalAdvice: { type: Type.STRING },
    progressSummary: { type: Type.STRING },
  },
  required: [
    'performanceSummary', 'consistencyObservations', 'improvementSuggestions',
    'motivationalAdvice', 'progressSummary',
  ],
};

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRecommendation(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('Gemini returned an incomplete recommendation. Please try again.');
    error.code = 'GEMINI_INVALID_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  const missing = recommendationSchema.required.filter((field) => {
    const value = data[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (!Array.isArray(data.weeklySchedule) || data.weeklySchedule.length === 0) {
    if (!missing.includes('weeklySchedule')) missing.push('weeklySchedule');
  }
  if (missing.length > 0) {
    const error = new Error(
      `Gemini returned an incomplete recommendation (missing: ${missing.join(', ')}). Please try again.`
    );
    error.code = 'GEMINI_INVALID_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  return {
    workoutPlan: String(data.workoutPlan).trim(),
    weeklySchedule: data.weeklySchedule,
    experienceRecommendations: String(data.experienceRecommendations).trim(),
    trainingTips: Array.isArray(data.trainingTips) ? data.trainingTips.map(String) : [String(data.trainingTips)],
    restAndRecovery: String(data.restAndRecovery).trim(),
    safetyGuidance: String(data.safetyGuidance).trim(),
    motivation: String(data.motivation).trim(),
  };
}

function validateInsights(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('Gemini returned incomplete insights. Please try again.');
    error.code = 'GEMINI_INVALID_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  const missing = insightsSchema.required.filter((field) => {
    const value = data[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    const error = new Error(
      `Gemini returned incomplete insights (missing: ${missing.join(', ')}). Please try again.`
    );
    error.code = 'GEMINI_INVALID_RESPONSE';
    error.statusCode = 502;
    throw error;
  }
  return {
    performanceSummary: String(data.performanceSummary).trim(),
    consistencyObservations: String(data.consistencyObservations).trim(),
    improvementSuggestions: Array.isArray(data.improvementSuggestions)
      ? data.improvementSuggestions.map(String)
      : [String(data.improvementSuggestions)],
    motivationalAdvice: String(data.motivationalAdvice).trim(),
    progressSummary: String(data.progressSummary).trim(),
  };
}

async function generateWorkoutRecommendation({ age, fitnessGoal, experienceLevel }) {
  const prompt = buildRecommendationPrompt({ age, fitnessGoal, experienceLevel });
  const parsed = await generateStructured(prompt, recommendationSchema);
  return validateRecommendation(parsed);
}

async function generateFitnessInsights({ stats, source }) {
  const prompt = buildInsightsPrompt({ stats, source });
  const parsed = await generateStructured(prompt, insightsSchema);
  return validateInsights(parsed);
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  getModel,
  getTimeoutMs,
  isConfigured,
  getClient,
  setClientOverride,
  withTimeout,
  RETRY_DEFAULTS,
  getRetryConfig,
  setRetryOverrides,
  isRetryable,
  getRetryAfterMs,
  backoffDelayMs,
  withRetry,
  extractJsonPayload,
  normalizeGeminiError,
  generateStructured,
  buildRecommendationPrompt,
  buildInsightsPrompt,
  recommendationSchema,
  insightsSchema,
  validateRecommendation,
  validateInsights,
  generateWorkoutRecommendation,
  generateFitnessInsights,
};


