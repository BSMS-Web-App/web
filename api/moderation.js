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

const OPENAI_CATEGORY_LABELS = Object.freeze({
  harassment: 'Harassment or abusive targeting',
  'harassment/threatening': 'Threatening harassment',
  hate: 'Hateful or discriminatory content',
  'hate/threatening': 'Threats based on hate or discrimination',
  illicit: 'Potentially illicit activity',
  'illicit/violent': 'Violent illicit activity',
  'self-harm': 'Self-harm related content',
  'self-harm/intent': 'Self-harm intent',
  'self-harm/instructions': 'Instructions related to self-harm',
  sexual: 'Sexual content',
  'sexual/minors': 'Sexual content involving minors',
  violence: 'Violence or threats of violence',
  'violence/graphic': 'Graphic violence'
});

function runGlinModeration(input) {
  const result = glinCheckProfanity(input, GLIN_OPTIONS);
  if (!result || typeof result.containsProfanity !== 'boolean') {
    throw new Error('Glin Profanity returned an invalid result');
  }

  return {
    flagged: result.containsProfanity,
    details: result
  };
}

async function runOpenAIModeration(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { available: false, flagged: false, reasons: [] };
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

    const categories = result.categories && typeof result.categories === 'object'
      ? result.categories
      : {};
    const reasons = Object.entries(categories)
      .filter(([, flagged]) => flagged === true)
      .map(([category]) => OPENAI_CATEGORY_LABELS[category] || category.replace(/[\/_-]+/g, ' '));

    return {
      available: true,
      flagged: result.flagged,
      reasons: result.flagged
        ? (reasons.length ? reasons : ['OpenAI content safety moderation flagged this content'])
        : [],
      categories: result.flagged ? Object.keys(categories).filter(category => categories[category] === true) : []
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns a structured moderation result so the UI can explain why content
 * was rejected without exposing raw provider responses or flagged word lists.
 *
 * Policy:
 * - Reject if either available system flags content.
 * - If one system fails, use the working system's result.
 * - If both systems are unavailable, reject (fail closed).
 */
export async function moderateContent(value) {
  if (typeof value !== 'string') {
    return {
      flagged: true,
      reason: 'This content could not be checked because it was not valid text.',
      reasons: ['Invalid text input'],
      sources: []
    };
  }

  const input = value.trim();
  if (!input) return { flagged: false, reason: '', reasons: [], sources: [] };
  if (input.length > 10000) {
    return {
      flagged: true,
      reason: 'This content is too long to be checked. Please shorten it and try again.',
      reasons: ['Text exceeds the 10,000-character moderation limit'],
      sources: []
    };
  }

  let glinAvailable = false;
  let glinFlagged = false;
  try {
    const glin = runGlinModeration(input);
    glinAvailable = true;
    glinFlagged = glin.flagged;
  } catch (error) {
    console.warn('[BSMS Web] Glin Profanity check failed:', error?.message || 'Unknown error');
  }

  let openAIAvailable = false;
  let openAIFlagged = false;
  let openAIReasons = [];
  let openAICategories = [];
  try {
    const openAI = await runOpenAIModeration(input);
    openAIAvailable = openAI.available;
    openAIFlagged = openAI.flagged;
    openAIReasons = openAI.reasons || [];
    openAICategories = openAI.categories || [];
  } catch (error) {
    console.warn('[BSMS Web] OpenAI moderation request failed:', error?.message || 'Unknown error');
  }

  const sources = [];
  const reasons = [];

  if (glinAvailable) sources.push('glin-profanity');
  if (openAIAvailable) sources.push('openai');

  if (glinFlagged) {
    reasons.push('Profanity or an obfuscated profane term was detected by the profanity filter.');
  }
  if (openAIFlagged) {
    reasons.push(...openAIReasons);
  }

  if (glinFlagged || openAIFlagged) {
    const uniqueReasons = [...new Set(reasons)];
    return {
      flagged: true,
      reason: uniqueReasons.join('. ') + (uniqueReasons.length ? '.' : 'Content was flagged by moderation.'),
      reasons: uniqueReasons,
      sources,
      categories: openAICategories
    };
  }

  if (glinAvailable || openAIAvailable) {
    return { flagged: false, reason: '', reasons: [], sources };
  }

  console.error('[BSMS Web] Both moderation systems failed; rejecting content.');
  return {
    flagged: true,
    reason: 'Content could not be checked because the moderation services are temporarily unavailable. Please try again shortly.',
    reasons: ['All moderation services unavailable'],
    sources: []
  };
}

export async function isContentFlagged(value) {
  const result = await moderateContent(value);
  return result.flagged;
}
