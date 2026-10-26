/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { checkProfanity as glinCheckProfanity } from 'glin-profanity';

const GLIN_OPTIONS = Object.freeze({
  allLanguages: true,
  detectLeetspeak: true,
  leetspeakLevel: 'aggressive',
  normalizeUnicode: true,
  severityLevels: true,
  cacheResults: true,
  maxCacheSize: 1000
});

function runGlinModeration(input) {
  const result = glinCheckProfanity(input, GLIN_OPTIONS);
  if (!result || typeof result.containsProfanity !== 'boolean') {
    throw new Error('Glin Profanity returned an invalid result');
  }
  return result.containsProfanity;
}

async function runOpenAIModeration(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { available: false, flagged: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI moderation returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const result = data?.results?.[0];
    if (!result || typeof result.flagged !== 'boolean') {
      throw new Error('OpenAI moderation returned an invalid result');
    }

    return { available: true, flagged: result.flagged };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check user-generated text with both Glin Profanity and OpenAI Moderation.
 *
 * Policy:
 * - Reject if either system flags the content.
 * - If one system fails, use the working system's result.
 * - If both systems fail, reject (fail closed).
 */
export async function isContentFlagged(value) {
  if (typeof value !== 'string') return true;

  const input = value.trim();
  if (!input) return false;
  if (input.length > 10000) return true;

  let glinAvailable = false;
  let glinFlagged = false;
  try {
    glinFlagged = runGlinModeration(input);
    glinAvailable = true;
  } catch {
    console.warn('[BSMS Web] Glin Profanity check failed.');
  }

  let openAIAvailable = false;
  let openAIFlagged = false;
  try {
    const result = await runOpenAIModeration(input);
    openAIAvailable = result.available;
    openAIFlagged = result.flagged;
  } catch {
    console.warn('[BSMS Web] OpenAI moderation request failed.');
  }

  if (glinAvailable && glinFlagged) return true;
  if (openAIAvailable && openAIFlagged) return true;

  if (glinAvailable || openAIAvailable) return false;

  console.error('[BSMS Web] Both moderation systems failed; rejecting content.');
  return true;
}
