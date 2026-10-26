/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

const BLOCKED_TERMS = [
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'asshole', 'cunt',
  'nigger', 'nigga', 'faggot', 'fag', 'cock', 'pussy', 'whore',
  'slut', 'bastard', 'retard'
];

function localModeration(input) {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[.,\/#!$%^&*;:{}=\-_\x60~()]/g, '')
    .replace(/\s+/g, '')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .toLowerCase();

  return BLOCKED_TERMS.some(term => normalized.includes(term));
}

async function openAIModeration(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { available: false, flagged: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

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
 * Returns true when content should be rejected.
 * If one moderation system fails, use the result from the working system.
 * If both systems fail, reject the content (fail closed).
 */
export async function isContentFlagged(value) {
  if (typeof value !== 'string') return true;
  const input = value.trim();
  if (!input) return false;
  if (input.length > 10000) return true;

  let localAvailable = false;
  let localFlagged = false;
  try {
    localFlagged = localModeration(input);
    localAvailable = true;
  } catch (error) {
    console.warn('[BSMS Web] Local moderation check failed.');
  }

  let openAIAvailable = false;
  let openAIFlagged = false;
  try {
    const result = await openAIModeration(input);
    openAIAvailable = result.available;
    openAIFlagged = result.flagged;
  } catch (error) {
    console.warn('[BSMS Web] OpenAI moderation request failed.');
  }

  if (localAvailable && localFlagged) return true;
  if (openAIAvailable && openAIFlagged) return true;

  if (localAvailable || openAIAvailable) return false;

  console.error('[BSMS Web] All moderation checks failed; rejecting content.');
  return true;
}
