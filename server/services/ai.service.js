/**
 * AI Summarization Service
 *
 * SDK: @google/genai v2.x — targets the v1 GA endpoint.
 *
 * Retry strategy
 * ──────────────
 * Transient HTTP errors (408, 429, 500, 502, 503, 504) are retried with
 * jittered exponential backoff: up to MAX_RETRIES (3) additional attempts
 * after the initial call, with base delays of ~1 s, ~2 s, ~4 s.
 *
 * Permanent errors (400, 401, 403, 404) surface immediately — no retry.
 *
 * Model cascade (fallback only on transient exhaustion)
 * ──────────────────────────────────────────────────────
 *   Primary : models/gemini-3.6-flash
 *   Fallback: models/gemini-3.5-flash
 *     (models/gemini-2.5-flash returns 404 on this API key; gemini-3.5-flash
 *      is the closest confirmed-working stable Flash alternative.)
 *
 * The fallback is only attempted when the primary exhausts all retries on a
 * transient error (503 or 429). Auth / validation / other permanent errors on
 * the primary propagate immediately without touching the fallback.
 *
 * Response format is unchanged: { summary, key_points, sentiment, word_count }
 */
const { GoogleGenAI, ApiError } = require('@google/genai');

// ── Models ────────────────────────────────────────────────────────────────────
const PRIMARY_MODEL  = 'models/gemini-3.6-flash';
const FALLBACK_MODEL = 'models/gemini-3.5-flash';

// ── Retry config ──────────────────────────────────────────────────────────────
const MAX_RETRIES = 3;                      // retries after the initial attempt
const BASE_DELAYS = [1000, 2000, 4000];     // ~1 s, ~2 s, ~4 s

// Transient errors worth retrying
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// Permanent errors — never retry these
const PERMANENT_STATUSES = new Set([400, 401, 403, 404]);

// ── Client (lazy init) ────────────────────────────────────────────────────────
let ai = null;

const getClient = () => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        throw new Error('GEMINI_API_KEY is not set. Add it to server/.env to enable AI summarization.');
    }
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return ai;
};

// ── Retry helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the numeric HTTP status from a caught error.
 * ApiError carries err.status; plain errors may embed the code in the message.
 * Returns undefined if not determinable.
 */
const httpStatus = (err) => {
    if (err instanceof ApiError && typeof err.status === 'number') return err.status;
    // Try parsing from message text as a last resort
    const m = (err.message || '').match(/\b(4\d{2}|5\d{2})\b/);
    return m ? parseInt(m[1], 10) : undefined;
};

/** True for transient errors we should retry. */
const isRetryable = (err) => {
    const s = httpStatus(err);
    if (s !== undefined) return RETRYABLE_STATUSES.has(s);
    // No status code found — check message text for known transient keywords
    const msg = (err.message || '').toLowerCase();
    return msg.includes('unavailable') || msg.includes('overloaded') ||
           msg.includes('resource_exhausted') || msg.includes('rate limit') ||
           msg.includes('timeout') || msg.includes('bad gateway');
};

/** True for permanent errors we should never retry. */
const isPermanent = (err) => {
    const s = httpStatus(err);
    return s !== undefined && PERMANENT_STATUSES.has(s);
};

/** Sleep for ms milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Backoff with small random jitter: base ± up to 20 %.
 * @param {number} attempt  0-based retry index (0 = first retry)
 */
const jitteredDelay = (attempt) => {
    const base   = BASE_DELAYS[attempt] ?? BASE_DELAYS[BASE_DELAYS.length - 1];
    const jitter = Math.floor(base * 0.2 * Math.random()); // 0–20 % of base
    return base + jitter;
};

// ── Core API call ─────────────────────────────────────────────────────────────

/** Single generateContent call. Throws on any error. */
const callModel = async (client, model, prompt) => {
    const result = await client.models.generateContent({ model, contents: prompt });
    return (result.text || '').trim();
};

/**
 * Call a single model with up to MAX_RETRIES retries for transient errors.
 * Permanent errors surface immediately. Returns raw text on success.
 *
 * @param {object} client  GoogleGenAI instance
 * @param {string} model   Full model path, e.g. 'models/gemini-3.6-flash'
 * @param {string} prompt  Prompt string
 */
const callWithRetry = async (client, model, prompt) => {
    let lastErr;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await callModel(client, model, prompt);
        } catch (err) {
            // Permanent error — surface immediately, no retry
            if (isPermanent(err)) throw err;

            // Non-retryable and non-permanent — also surface immediately
            if (!isRetryable(err)) throw err;

            lastErr = err;

            // Log every retry (not the initial attempt itself)
            if (attempt < MAX_RETRIES) {
                const delay  = jitteredDelay(attempt);
                const status = httpStatus(err) ?? '?';
                console.warn(
                    `[Gemini] ⚠️  HTTP ${status} on ${model} — ` +
                    `retry ${attempt + 1}/${MAX_RETRIES} in ${delay} ms…`
                );
                await sleep(delay);
            }
        }
    }

    throw lastErr; // all retries exhausted — re-throw last transient error
};

// ── Prompt ────────────────────────────────────────────────────────────────────

/**
 * Build a structured prompt for document summarization.
 * Instructs the model to respond with strict JSON so we can parse it reliably.
 */
const buildPrompt = (text) => `
You are an expert document analyst. Analyze the following extracted document text and respond with ONLY a valid JSON object — no markdown, no code fences, no extra commentary.

The JSON must follow this exact schema:
{
  "summary": "A clear, concise paragraph summary of the document (3-5 sentences).",
  "key_points": [
    "Key point 1",
    "Key point 2",
    "Key point 3"
  ],
  "sentiment": "positive" | "negative" | "neutral",
  "word_count": <integer count of words in the summary>
}

Rules:
- summary: 3–5 sentences, plain language, no jargon
- key_points: 3–7 bullet points, each a single concise sentence
- sentiment: overall tone of the ORIGINAL document (not your summary)
- word_count: word count of your summary field only

Document text:
---
${text.slice(0, 12000)}
---
`.trim();

// ── Response parsing ──────────────────────────────────────────────────────────

/**
 * Parse and validate the raw JSON string returned by the model.
 * Returns the normalized result object.
 */
const parseResponse = (raw) => {
    if (!raw) throw new Error('Gemini returned an empty response. Please try again.');

    // Strip markdown code fences if the model adds them despite instructions
    const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        console.error('❌ Gemini returned non-JSON response:', raw.slice(0, 300));
        throw new Error('AI returned an invalid response format. Please try again.');
    }

    const summary   = String(parsed.summary    || '').trim();
    const keyPoints = Array.isArray(parsed.key_points) ? parsed.key_points.map(String) : [];
    const validSentiments = ['positive', 'negative', 'neutral'];
    const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
    const wordCount = summary.split(/\s+/).filter(Boolean).length;

    if (!summary) throw new Error('AI returned an empty summary. Please try again.');

    return { summary, key_points: keyPoints, sentiment, word_count: wordCount };
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Summarize document text using Gemini.
 * Retries transient errors and falls back to a secondary model if needed.
 *
 * @param {string} text - Raw OCR or extracted text
 * @returns {{ summary: string, key_points: string[], sentiment: string, word_count: number }}
 */
const summarize = async (text) => {
    if (!text || text.trim().length < 20) {
        throw new Error('Document text is too short to summarize (minimum 20 characters).');
    }

    const client = getClient();
    const prompt  = buildPrompt(text);

    // ── Attempt primary model ─────────────────────────────────────────────────
    console.log(`[Gemini] 🤖 Attempting with primary model: ${PRIMARY_MODEL}`);
    try {
        const raw = await callWithRetry(client, PRIMARY_MODEL, prompt);
        return parseResponse(raw);
    } catch (primaryErr) {
        // Only fall through to the fallback on transient errors.
        // Permanent errors (auth, 404, bad request) propagate immediately.
        if (!isRetryable(primaryErr)) {
            throw new Error(`Gemini API call failed: ${primaryErr.message}`);
        }
        const status = httpStatus(primaryErr) ?? '?';
        console.warn(
            `[Gemini] ⚠️  Primary model exhausted all retries (last HTTP ${status}). ` +
            `Switching to fallback: ${FALLBACK_MODEL}`
        );
    }

    // ── Attempt fallback model ────────────────────────────────────────────────
    console.log(`[Gemini] 🔄 Attempting with fallback model: ${FALLBACK_MODEL}`);
    try {
        const raw = await callWithRetry(client, FALLBACK_MODEL, prompt);
        console.log(`[Gemini] ✅ Fallback model succeeded: ${FALLBACK_MODEL}`);
        return parseResponse(raw);
    } catch (fallbackErr) {
        // Both models failed — preserve the "Gemini API call failed: …" format
        // that the controller and frontend already handle.
        throw new Error(`Gemini API call failed: ${fallbackErr.message}`);
    }
};

module.exports = { summarize };
