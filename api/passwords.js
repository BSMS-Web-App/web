/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashPassword(password) {
    if (typeof password !== 'string' || !password) throw new TypeError('Password must be a non-empty string.');
    const salt = crypto.randomBytes(16).toString('hex');
    const key = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024 });
    return '$scrypt$' + COST + '$' + BLOCK_SIZE + '$' + PARALLELIZATION + '$' + salt + '$' + key.toString('hex');
}

export function needsPasswordRehash(storedHash) {
    return typeof storedHash !== 'string' || !storedHash.startsWith('$scrypt$');
}

export async function verifyPassword(password, storedHash) {
    if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
    if (/^[a-f0-9]{64}$/i.test(storedHash)) {
        const actual = crypto.createHash('sha256').update(password).digest();
        const expected = Buffer.from(storedHash, 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
    }
    const match = storedHash.match(/^\$scrypt\$(\d+)\$(\d+)\$(\d+)\$([a-f0-9]{32})\$([a-f0-9]{128})$/i);
    if (!match) return false;
    const [, n, r, p, salt, expectedHex] = match;
    if (Number(n) !== COST || Number(r) !== BLOCK_SIZE || Number(p) !== PARALLELIZATION) return false;
    const actual = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024 });
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
