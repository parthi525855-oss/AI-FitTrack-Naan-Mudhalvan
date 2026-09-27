/**
 * Phase 3 reliability tests for the Gemini service (node:test).
 *
 * Gemini is MOCKED via setClientOverride and retry delays are injected through
 * setRetryOverrides, so these tests make no real API calls and never sleep for
 * real. They cover bounded retries with exponential backoff, Retry-After
 * handling, non-retryable failures (bad key, unknown model, malformed payload)
 * and the standardized error shape (code / statusCode / attempts).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key-for-retry-suite';

const gemini = require('../services/geminiService');

const VALID_PLAN = {
  workoutPlan: 'Bounded retry plan.',
  weeklySchedule: [{ day: 'Monday', focus: 'Cardio', exercises: [{ name: 'Brisk walk' }] }],
  experienceRecommendations: 'Progress gradually.',
  trainingTips: ['Warm up'],
  restAndRecovery: 'Sleep 7-9 hours.',
  safetyGuidance: 'Stop on pain.',
  motivation: 'Keep going.',
};

const request = () => ({ age: 30, fitnessGoal: 'Weight Loss', experienceLevel: 'Beginner' });
const generate = () => gemini.generateWorkoutRecommendation(request());

const planResponse = () => ({ text: JSON.stringify(VALID_PLAN) });

function httpError(status, message, headers) {
  const error = new Error(message);
  error.status = status;
  if (headers) error.response = { headers };
  return error;
}

/** Mock client that returns (or throws) a scripted response per attempt. */
function clientSequence(handlers) {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      models: {
        generateContent: async () => {
          const handler = handlers[Math.min(calls, handlers.length - 1)];
          calls += 1;
          return handler();
        },
      },
    },
  };
}

/** Deterministic retry policy: no jitter, recorded sleeps, tiny delays. */
function useRetryPolicy(overrides = {}) {
  const sleeps = [];
  gemini.setRetryOverrides({
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    jitterRatio: 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...overrides,
  });
  return sleeps;
}

test.afterEach(() => {
  gemini.setClientOverride(null);
  gemini.setRetryOverrides(null);
});

test('retries a transient 503 (high demand) and succeeds on the next attempt', async () => {
  const sleeps = useRetryPolicy();
  const seq = clientSequence([
    () => {
      throw httpError(503, 'The model is overloaded. Please try again later.');
    },
    planResponse,
  ]);
  gemini.setClientOverride(seq.client);

  const plan = await generate();

  assert.equal(seq.calls(), 2);
  assert.deepEqual(sleeps, [100]); // one exponential backoff step
  assert.equal(plan.workoutPlan, VALID_PLAN.workoutPlan);
});

test('does not retry when the first attempt succeeds', async () => {
  const sleeps = useRetryPolicy();
  const seq = clientSequence([planResponse]);
  gemini.setClientOverride(seq.client);

  await generate();

  assert.equal(seq.calls(), 1);
  assert.deepEqual(sleeps, []);
});

test('gives up after the bounded number of attempts and reports attempts + backoff', async () => {
  const sleeps = useRetryPolicy();
  const seq = clientSequence([
    () => {
      throw httpError(503, 'Service Unavailable: high demand');
    },
  ]);
  gemini.setClientOverride(seq.client);

  await assert.rejects(generate(), (error) => {
    assert.equal(error.code, 'GEMINI_REQUEST_FAILED');
    assert.equal(error.statusCode, 503);
    assert.equal(error.attempts, 3);
    return true;
  });

  assert.equal(seq.calls(), 3);
  assert.deepEqual(sleeps, [100, 200]); // exponential, bounded by maxAttempts
});

test('backoff is capped by maxDelayMs', async () => {
  const sleeps = useRetryPolicy({ maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 1500 });
  const seq = clientSequence([
    () => {
      throw httpError(503, 'high demand');
    },
  ]);
  gemini.setClientOverride(seq.client);

  await assert.rejects(generate());

  assert.equal(seq.calls(), 4);
  assert.deepEqual(sleeps, [1000, 1500, 1500]);
});

test('honors a Retry-After header in seconds instead of the backoff estimate', async () => {
  // maxDelayMs must be at least as large as the advertised Retry-After,
  // otherwise the service deliberately fails fast instead of waiting.
  const sleeps = useRetryPolicy({ maxDelayMs: 5000 });
  const seq = clientSequence([
    () => {
      throw httpError(429, 'Quota exceeded', { 'retry-after': '2' });
    },
    planResponse,
  ]);
  gemini.setClientOverride(seq.client);

  await generate();

  assert.equal(seq.calls(), 2);
  assert.deepEqual(sleeps, [2000]);
});

test('fails fast (no sleep, single attempt) when Retry-After exceeds the delay cap', async () => {
  const sleeps = useRetryPolicy({ maxDelayMs: 1000 });
  const seq = clientSequence([
    () => {
      throw httpError(503, 'high demand', { 'retry-after': '30' });
    },
  ]);
  gemini.setClientOverride(seq.client);

  await assert.rejects(generate(), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.attempts, 1);
    assert.equal(error.retryAfterSeconds, 30);
    return true;
  });

  assert.equal(seq.calls(), 1);
  assert.deepEqual(sleeps, []);
});

test('retries timeouts and then reports GEMINI_UNAVAILABLE', async () => {
  const sleeps = useRetryPolicy({ maxAttempts: 2 });
  const seq = clientSequence([
    () => {
      throw httpError(504, 'The request timed out (deadline exceeded).');
    },
  ]);
  gemini.setClientOverride(seq.client);

  await assert.rejects(generate(), (error) => {
    assert.equal(error.code, 'GEMINI_UNAVAILABLE');
    assert.equal(error.statusCode, 502);
    assert.equal(error.attempts, 2);
    return true;
  });

  assert.equal(seq.calls(), 2);
  assert.deepEqual(sleeps, [100]);
});

test('never retries non-retryable failures (bad key, retired model, bad request)', async () => {
  const cases = [
    {
      name: 'invalid API key',
      error: () => {
        const e = new Error('API key not valid. Please pass a valid API key.');
        e.status = 400;
        return e;
      },
      code: 'GEMINI_AUTH_ERROR',
      status: 503,
    },
    {
      name: 'retired model',
      error: () => httpError(404, 'models/gemini-2.5-flash is no longer available to new users.'),
      code: 'GEMINI_MODEL_NOT_FOUND',
      status: 404,
    },
    {
      name: 'bad request payload',
      error: () => httpError(400, 'Invalid JSON payload received. Unknown name "temperature".'),
      code: 'GEMINI_REQUEST_FAILED',
      status: 400,
    },
  ];

  for (const scenario of cases) {
    const sleeps = useRetryPolicy();
    const seq = clientSequence([
      () => {
        throw scenario.error();
      },
    ]);
    gemini.setClientOverride(seq.client);

    await assert.rejects(generate(), (error) => {
      assert.equal(error.code, scenario.code, scenario.name);
      assert.equal(error.statusCode, scenario.status, scenario.name);
      assert.equal(error.attempts, 1, scenario.name);
      return true;
    });

    assert.equal(seq.calls(), 1, `${scenario.name} must not be retried`);
    assert.deepEqual(sleeps, [], scenario.name);
  }
});

test('a missing API key is not retried (GEMINI_MISSING_KEY)', async () => {
  const sleeps = useRetryPolicy();
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  gemini.setClientOverride(null);

  try {
    await assert.rejects(generate(), (error) => {
      assert.equal(error.code, 'GEMINI_MISSING_KEY');
      assert.equal(error.statusCode, 503);
      assert.equal(error.attempts, 1);
      return true;
    });
  } finally {
    process.env.GEMINI_API_KEY = previousKey;
  }

  assert.deepEqual(sleeps, []);
});

test('malformed model output is a deterministic failure (not retried)', async () => {
  const sleeps = useRetryPolicy();
  const seq = clientSequence([() => ({ text: 'definitely not JSON {{{' })]);
  gemini.setClientOverride(seq.client);

  await assert.rejects(generate(), (error) => {
    assert.equal(error.code, 'GEMINI_MALFORMED_RESPONSE');
    return true;
  });

  assert.equal(seq.calls(), 1);
  assert.deepEqual(sleeps, []);
});

test('retry configuration clamps unsafe env values to bounded limits', () => {
  const saved = {
    attempts: process.env.GEMINI_MAX_ATTEMPTS,
    base: process.env.GEMINI_RETRY_BASE_MS,
    max: process.env.GEMINI_RETRY_MAX_DELAY_MS,
  };
  const restore = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  try {
    process.env.GEMINI_MAX_ATTEMPTS = '99';
    process.env.GEMINI_RETRY_BASE_MS = '1';
    process.env.GEMINI_RETRY_MAX_DELAY_MS = '900000';
    gemini.setRetryOverrides(null);

    const config = gemini.getRetryConfig();
    assert.equal(config.maxAttempts, 5); // capped: never unbounded retries
    assert.equal(config.baseDelayMs, 1);
    assert.equal(config.maxDelayMs, 60000); // capped: never endless sleeps
  } finally {
    restore('GEMINI_MAX_ATTEMPTS', saved.attempts);
    restore('GEMINI_RETRY_BASE_MS', saved.base);
    restore('GEMINI_RETRY_MAX_DELAY_MS', saved.max);
  }
});

test('getRetryAfterMs understands seconds, HTTP dates and millisecond fields', () => {
  assert.equal(gemini.getRetryAfterMs(httpError(429, 'x', { 'Retry-After': '3' })), 3000);
  assert.equal(gemini.getRetryAfterMs({ retryAfterSeconds: 2 }), 2000);
  assert.equal(gemini.getRetryAfterMs({ retryAfterMs: 250 }), 250);

  const when = new Date(Date.now() + 4000).toUTCString();
  const parsed = gemini.getRetryAfterMs(httpError(503, 'x', { 'retry-after': when }));
  assert.ok(parsed >= 2500 && parsed <= 5000, `unexpected Retry-After parse: ${parsed}`);

  assert.equal(gemini.getRetryAfterMs(new Error('no headers')), null);
  assert.equal(gemini.getRetryAfterMs(null), null);
});

test('isRetryable classifies transient failures only', () => {
  assert.equal(gemini.isRetryable({ code: 'GEMINI_TIMEOUT', statusCode: 504 }), true);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_RATE_LIMIT', statusCode: 429 }), true);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_REQUEST_FAILED', statusCode: 503 }), true);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_REQUEST_FAILED', statusCode: 400 }), false);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_AUTH_ERROR', statusCode: 503 }), false);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_MODEL_NOT_FOUND', statusCode: 404 }), false);
  assert.equal(gemini.isRetryable({ code: 'GEMINI_INVALID_RESPONSE', statusCode: 502 }), false);
  assert.equal(gemini.isRetryable({ message: 'The model is overloaded (high demand)' }), true);
  assert.equal(gemini.isRetryable(null), false);
});
