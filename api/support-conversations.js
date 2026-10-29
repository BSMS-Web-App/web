/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import { db } from './db.js';
import { moderateContent } from './moderation.js';

const ROOT = '/support_conversations';
const MAX_SUBJECT = 100;
const MAX_MESSAGE = 3000;
const SEND_COOLDOWN_MS = 2500;
const recentCreates = new Map();

function clean(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function hash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
function validId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}
async function moderate(text) {
    const result = await moderateContent(text);
    return !result.flagged;
}
function publicConversation(conversation) {
    return {
        id: conversation.id,
        subject: conversation.subject,
        status: conversation.status || 'open',
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: Object.values(conversation.messages || {}).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
    };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!db) return res.status(503).json({ error: 'Support is temporarily unavailable.' });

    const payload = req.body || {};
    const action = payload.action;
    const now = Date.now();

    try {
        if (action === 'create') {
            const forwarded = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
            const rateKey = hash(forwarded || 'unknown');
            const lastCreate = recentCreates.get(rateKey) || 0;
            if (now - lastCreate < 15000) return res.status(429).json({ error: 'Please wait a few seconds before starting another conversation.' });
            recentCreates.set(rateKey, now);
            if (recentCreates.size > 2000) {
                for (const [key, timestamp] of recentCreates) if (now - timestamp > 60000) recentCreates.delete(key);
            }
            const subject = clean(payload.subject, MAX_SUBJECT);
            const message = clean(payload.message, MAX_MESSAGE);
            if (subject.length < 4) return res.status(400).json({ error: 'Please enter a subject with at least 4 characters.' });
            if (message.length < 10) return res.status(400).json({ error: 'Please enter a message with at least 10 characters.' });
            if (payload.subject?.length > MAX_SUBJECT || payload.message?.length > MAX_MESSAGE) return res.status(400).json({ error: 'Your message is too long.' });
            if (!(await moderate(subject + '\n' + message))) return res.status(400).json({ error: 'This message could not be accepted by the content filter.' });

            const accessKey = crypto.randomBytes(32).toString('base64url');
            const ref = db.ref(ROOT).push();
            const id = ref.key;
            const conversation = {
                id,
                subject,
                accessKeyHash: hash(accessKey),
                status: 'open',
                createdAt: now,
                updatedAt: now,
                lastMessageAt: now,
                lastMessageBy: 'visitor',
                messages: {
                    first: { id: 'first', sender: 'visitor', body: message, createdAt: now }
                }
            };
            await ref.set(conversation);
            return res.status(201).json({ success: true, conversation: publicConversation(conversation), accessKey });
        }

        const conversationId = payload.conversationId;
        const accessKey = clean(payload.accessKey, 100);
        if (!validId(conversationId) || accessKey.length < 32 || accessKey.length > 100) {
            return res.status(400).json({ error: 'Enter a valid conversation reference and access key.' });
        }
        const ref = db.ref(ROOT + '/' + conversationId);
        const snapshot = await ref.once('value');
        const conversation = snapshot.val();
        if (!conversation || !safeEqual(conversation.accessKeyHash, hash(accessKey))) {
            return res.status(404).json({ error: 'We could not find that conversation. Check your reference and access key.' });
        }

        if (action === 'get') {
            return res.status(200).json({ conversation: publicConversation(conversation) });
        }

        if (action === 'send') {
            const message = clean(payload.message, MAX_MESSAGE);
            if (message.length < 1) return res.status(400).json({ error: 'Write a message before sending.' });
            if (payload.message?.length > MAX_MESSAGE) return res.status(400).json({ error: 'Messages must be 3,000 characters or fewer.' });
            if (conversation.status === 'closed') return res.status(409).json({ error: 'This conversation has been closed by the support team.' });
            const lastVisitorMessage = Number(conversation.lastVisitorMessageAt || 0);
            if (now - lastVisitorMessage < SEND_COOLDOWN_MS) return res.status(429).json({ error: 'Please wait a moment before sending another message.' });
            if (!(await moderate(message))) return res.status(400).json({ error: 'This message could not be accepted by the content filter.' });

            const messageId = 'm_' + crypto.randomBytes(10).toString('hex');
            await db.ref(ROOT + '/' + conversationId + '/messages/' + messageId).set({ id: messageId, sender: 'visitor', body: message, createdAt: now });
            await ref.update({ updatedAt: now, lastMessageAt: now, lastMessageBy: 'visitor', lastVisitorMessageAt: now });
            const refreshed = await ref.once('value');
            return res.status(200).json({ success: true, conversation: publicConversation(refreshed.val()) });
        }

        return res.status(400).json({ error: 'Unknown support action.' });
    } catch (error) {
        console.error('[BSMS Web :: Support Conversations] Error:', error?.message || error);
        return res.status(500).json({ error: 'Your support request could not be completed. Please try again later.' });
    }
}
