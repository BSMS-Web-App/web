/*
 * BSMS Web - Chess API
 * Handles Game State, Realtime Moves, Clock Timers, Spectator Presence, and Elo Ratings.
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.js';

// Standard Chess FEN start position
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Elo Calculation Helper (Standard FIDE / USCF K=32)
function calculateNewElos(whiteElo, blackElo, result) {
    // result: 1 = white win, 0 = black win, 0.5 = draw
    const K = 32;
    const expectedWhite = 1 / (1 + Math.pow(10, (blackElo - whiteElo) / 400));
    const expectedBlack = 1 / (1 + Math.pow(10, (whiteElo - blackElo) / 400));

    const newWhiteElo = Math.round(whiteElo + K * (result - expectedWhite));
    const newBlackElo = Math.round(blackElo + K * ((1 - result) - expectedBlack));

    return {
        whiteElo: Math.max(100, newWhiteElo),
        blackElo: Math.max(100, newBlackElo),
        whiteChange: Math.round(K * (result - expectedWhite)),
        blackChange: Math.round(K * ((1 - result) - expectedBlack))
    };
}

async function getUserAccount(uid) {
    if (!uid) return null;
    const snap = await db.ref(`/accounts/${uid}`).once('value');
    return snap.val() || null;
}

async function updateUserEloAndStats(uid, newElo, result) {
    if (!uid) return;
    const snap = await db.ref(`/accounts/${uid}`).once('value');
    const acc = snap.val() || {};

    const updates = { chessElo: newElo };
    if (result === 'win') {
        updates.chessWins = (acc.chessWins || 0) + 1;
    } else if (result === 'loss') {
        updates.chessLosses = (acc.chessLosses || 0) + 1;
    } else if (result === 'draw') {
        updates.chessDraws = (acc.chessDraws || 0) + 1;
    }
    updates.chessGamesCount = (acc.chessGamesCount || 0) + 1;

    await db.ref(`/accounts/${uid}`).update(updates);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const payload = req.method === 'POST' ? (req.body || {}) : {};
    const action = req.query.action || payload.action;
    const sessionId = req.headers['x-session-id'] || req.query.sessionId || payload.sessionId;

    // Resolve user by sessionId if provided
    let currentUser = null;
    if (sessionId) {
        const snap = await db.ref('/accounts').once('value');
        const allAccs = snap.val() || {};
        for (const [id, acc] of Object.entries(allAccs)) {
            if (acc.sessions && acc.sessions[sessionId]) {
                currentUser = {
                    uid: id,
                    username: acc.username,
                    displayName: acc.displayName || acc.username,
                    avatar: acc.avatar || '',
                    chessElo: acc.chessElo || 1200,
                    nameColor: acc.nameColor || acc.chatColor || '#ef4444'
                };
                break;
            }
        }
    }

    try {
        switch (action) {
            // Create a new Chess Game
            case 'createGame': {
                const {
                    color = 'random',
                    timeControl = '10m',
                    rated = true,
                    isBot = false,
                    botDifficulty = 'intermediate',
                    targetUid = null
                } = payload;

                const challengerUid = currentUser?.uid || 'guest_' + Math.random().toString(36).slice(2, 8);
                const challengerName = currentUser?.displayName || currentUser?.username || 'Challenger';
                const challengerElo = currentUser?.chessElo || 1200;

                const gameId = 'chess_' + Math.random().toString(36).slice(2, 10);
                let whitePlayer = null;
                let blackPlayer = null;

                let chosenColor = color;
                if (chosenColor === 'random') {
                    chosenColor = Math.random() < 0.5 ? 'white' : 'black';
                }

                if (chosenColor === 'white') {
                    whitePlayer = { uid: challengerUid, name: challengerName, elo: challengerElo, avatar: currentUser?.avatar || '', color: 'w' };
                } else {
                    blackPlayer = { uid: challengerUid, name: challengerName, elo: challengerElo, avatar: currentUser?.avatar || '', color: 'b' };
                }

                if (isBot) {
                    const botElos = { novice: 800, intermediate: 1300, master: 1850 };
                    const botElo = botElos[botDifficulty] || 1300;
                    const botObj = {
                        uid: 'bot_' + botDifficulty,
                        name: `BSMS Bot (${botDifficulty.charAt(0).toUpperCase() + botDifficulty.slice(1)})`,
                        elo: botElo,
                        isBot: true,
                        difficulty: botDifficulty,
                        avatar: ''
                    };
                    if (chosenColor === 'white') blackPlayer = { ...botObj, color: 'b' };
                    else whitePlayer = { ...botObj, color: 'w' };
                }

                let timeSeconds = 600;
                if (timeControl === '3m') timeSeconds = 180;
                else if (timeControl === '5m') timeSeconds = 300;
                else if (timeControl === '15m') timeSeconds = 900;
                else if (timeControl === 'unlimited') timeSeconds = 999999;

                const newGame = {
                    id: gameId,
                    status: isBot ? 'active' : 'waiting',
                    fen: START_FEN,
                    history: [],
                    turn: 'w',
                    white: whitePlayer,
                    black: blackPlayer,
                    timeControl,
                    initialTime: timeSeconds,
                    whiteTime: timeSeconds,
                    blackTime: timeSeconds,
                    lastMoveTime: isBot ? Date.now() : null,
                    rated: Boolean(rated) && !isBot,
                    targetUid: targetUid || null,
                    isBot: Boolean(isBot),
                    botDifficulty: botDifficulty || null,
                    winner: null,
                    winReason: null,
                    spectators: {},
                    chat: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                await db.ref(`/chess/games/${gameId}`).set(newGame);
                return res.status(200).json({ success: true, game: newGame, gameId });
            }

            // Join an existing game
            case 'joinGame': {
                const { gameId } = payload;
                if (!gameId) return res.status(400).json({ error: "Missing game ID" });

                const gSnap = await db.ref(`/chess/games/${gameId}`).once('value');
                const game = gSnap.val();
                if (!game) return res.status(404).json({ error: "Game not found" });

                const joinUid = currentUser?.uid || 'guest_' + Math.random().toString(36).slice(2, 8);
                const joinName = currentUser?.displayName || currentUser?.username || 'Challenger';
                const joinElo = currentUser?.chessElo || 1200;

                if (game.white?.uid === joinUid) return res.status(200).json({ success: true, game, role: 'white' });
                if (game.black?.uid === joinUid) return res.status(200).json({ success: true, game, role: 'black' });
                if (game.status !== 'waiting') return res.status(200).json({ success: true, game, role: 'spectator' });
                if (game.targetUid && game.targetUid !== joinUid) {
                    return res.status(403).json({ error: "This game is a direct challenge for another player." });
                }

                const playerObj = { uid: joinUid, name: joinName, elo: joinElo, avatar: currentUser?.avatar || '', color: game.white ? 'b' : 'w' };
                const updates = { status: 'active', lastMoveTime: Date.now(), updatedAt: Date.now() };

                if (!game.white) { updates.white = playerObj; game.white = playerObj; }
                else { updates.black = playerObj; game.black = playerObj; }
                game.status = 'active';

                await db.ref(`/chess/games/${gameId}`).update(updates);
                return res.status(200).json({ success: true, game, role: playerObj.color === 'w' ? 'white' : 'black' });
            }

            // Get game state & update clock
            case 'getGame': {
                const gameId = req.query.gameId || payload.gameId;
                if (!gameId) return res.status(400).json({ error: "Missing game ID" });

                const gSnap = await db.ref(`/chess/games/${gameId}`).once('value');
                const game = gSnap.val();
                if (!game) return res.status(404).json({ error: "Game not found" });

                if (game.status === 'active' && game.lastMoveTime && game.timeControl !== 'unlimited') {
                    const elapsed = Math.floor((Date.now() - game.lastMoveTime) / 1000);
                    if (game.turn === 'w') {
                        game.whiteTime = Math.max(0, game.whiteTime - elapsed);
                        if (game.whiteTime <= 0) {
                            game.status = 'completed';
                            game.winner = 'b';
                            game.winReason = 'timeout';
                            await handleGameEnd(game);
                        }
                    } else {
                        game.blackTime = Math.max(0, game.blackTime - elapsed);
                        if (game.blackTime <= 0) {
                            game.status = 'completed';
                            game.winner = 'w';
                            game.winReason = 'timeout';
                            await handleGameEnd(game);
                        }
                    }
                }

                // Spectator tracking
                const viewerUid = currentUser?.uid || payload.viewerUid;
                if (viewerUid && viewerUid !== game.white?.uid && viewerUid !== game.black?.uid) {
                    await db.ref(`/chess/games/${gameId}/spectators/${viewerUid}`).set({
                        name: currentUser?.displayName || currentUser?.username || 'Spectator',
                        lastSeen: Date.now()
                    });
                }

                const activeSpectators = {};
                const specObj = game.spectators || {};
                const now = Date.now();
                for (const [sUid, sData] of Object.entries(specObj)) {
                    if (now - (sData.lastSeen || 0) < 30000) activeSpectators[sUid] = sData;
                }
                game.spectatorCount = Object.keys(activeSpectators).length;

                return res.status(200).json({ success: true, game });
            }

            // Make move
            case 'makeMove': {
                const { gameId, from, to, piece, san, fen, promotion } = payload;
                if (!gameId || !from || !to || !fen) return res.status(400).json({ error: "Missing move details" });

                const gSnap = await db.ref(`/chess/games/${gameId}`).once('value');
                const game = gSnap.val();
                if (!game || game.status !== 'active') return res.status(400).json({ error: "Game is not active" });

                const expectedColor = game.turn;
                const expectedPlayer = expectedColor === 'w' ? game.white : game.black;
                const isPlayerTurn = currentUser && expectedPlayer && currentUser.uid === expectedPlayer.uid;
                const isBotTurn = expectedPlayer && expectedPlayer.isBot;
                
                if (!isPlayerTurn && !isBotTurn && currentUser) {
                    return res.status(403).json({ error: "It is not your turn to move." });
                }

                const now = Date.now();
                let whiteTime = game.whiteTime;
                let blackTime = game.blackTime;

                if (game.lastMoveTime && game.timeControl !== 'unlimited') {
                    const elapsed = Math.floor((now - game.lastMoveTime) / 1000);
                    if (expectedColor === 'w') whiteTime = Math.max(0, whiteTime - elapsed);
                    else blackTime = Math.max(0, blackTime - elapsed);
                }

                const nextTurn = expectedColor === 'w' ? 'b' : 'w';
                const moveObj = { from, to, piece, san, fen, promotion: promotion || null, color: expectedColor, timestamp: now };
                const history = Array.isArray(game.history) ? [...game.history] : [];
                history.push(moveObj);

                const updates = { fen, history, turn: nextTurn, whiteTime, blackTime, lastMoveTime: now, updatedAt: now };

                if (payload.isCheckmate) {
                    updates.status = 'completed';
                    updates.winner = expectedColor;
                    updates.winReason = 'checkmate';
                } else if (payload.isStalemate || payload.isDraw) {
                    updates.status = 'completed';
                    updates.winner = 'draw';
                    updates.winReason = payload.isStalemate ? 'stalemate' : 'draw';
                }

                await db.ref(`/chess/games/${gameId}`).update(updates);
                const updatedGame = { ...game, ...updates };

                if (updates.status === 'completed') await handleGameEnd(updatedGame);
                return res.status(200).json({ success: true, game: updatedGame });
            }

            // Resign game
            case 'resign': {
                const { gameId } = payload;
                if (!gameId) return res.status(400).json({ error: "Missing game ID" });

                const gSnap = await db.ref(`/chess/games/${gameId}`).once('value');
                const game = gSnap.val();
                if (!game || game.status !== 'active') return res.status(400).json({ error: "Game is not active" });

                const myUid = currentUser?.uid;
                let winner = null;
                if (game.white?.uid === myUid) winner = 'b';
                else if (game.black?.uid === myUid) winner = 'w';
                else return res.status(403).json({ error: "Only active players can resign." });

                const updates = { status: 'completed', winner, winReason: 'resignation', updatedAt: Date.now() };
                await db.ref(`/chess/games/${gameId}`).update(updates);
                const updatedGame = { ...game, ...updates };
                await handleGameEnd(updatedGame);

                return res.status(200).json({ success: true, game: updatedGame });
            }

            // List live games
            case 'getLiveGames': {
                const gSnap = await db.ref('/chess/games').once('value');
                const allGames = gSnap.val() || {};
                const now = Date.now();
                const list = [];
                for (const [id, g] of Object.entries(allGames)) {
                    if (g.status === 'active' || (g.status === 'completed' && now - (g.updatedAt || 0) < 900000)) {
                        list.push({
                            id,
                            status: g.status,
                            white: g.white,
                            black: g.black,
                            timeControl: g.timeControl,
                            turn: g.turn,
                            winner: g.winner,
                            winReason: g.winReason,
                            rated: g.rated,
                            isBot: g.isBot,
                            spectatorsCount: Object.keys(g.spectators || {}).length,
                            moveCount: Array.isArray(g.history) ? g.history.length : 0,
                            updatedAt: g.updatedAt || g.createdAt
                        });
                    }
                }
                list.sort((a, b) => (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0));
                return res.status(200).json({ success: true, games: list.slice(0, 30) });
            }

            // In-game Chat
            case 'sendGameChat': {
                const { gameId, message } = payload;
                if (!gameId || !message) return res.status(400).json({ error: "Missing message data" });

                const chatEntry = {
                    id: 'msg_' + Date.now(),
                    senderUid: currentUser?.uid || null,
                    senderName: currentUser?.displayName || currentUser?.username || 'Spectator',
                    senderColor: currentUser?.nameColor || '#ef4444',
                    message: String(message).slice(0, 150),
                    timestamp: Date.now()
                };

                const cSnap = await db.ref(`/chess/games/${gameId}/chat`).once('value');
                const chatList = Array.isArray(cSnap.val()) ? cSnap.val() : [];
                chatList.push(chatEntry);
                if (chatList.length > 50) chatList.shift();

                await db.ref(`/chess/games/${gameId}/chat`).set(chatList);
                return res.status(200).json({ success: true, chat: chatList });
            }

            // Top Chess Elo Leaderboard & School Rankings
            case 'getLeaderboard': {
                const snap = await db.ref('/accounts').once('value');
                const allAccs = snap.val() || {};

                const players = [];
                for (const [uid, acc] of Object.entries(allAccs)) {
                    if (acc.account_status !== 'banned' && acc.username) {
                        const wins = acc.chessWins || 0;
                        const losses = acc.chessLosses || 0;
                        const draws = acc.chessDraws || 0;
                        const total = wins + losses + draws;
                        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

                        players.push({
                            uid,
                            username: acc.username,
                            displayName: acc.displayName || acc.username,
                            avatar: acc.avatar || '',
                            nameColor: acc.nameColor || acc.chatColor || '#ef4444',
                            chessElo: acc.chessElo || 1200,
                            chessWins: wins,
                            chessLosses: losses,
                            chessDraws: draws,
                            chessGamesCount: total,
                            winRate,
                            verified: Boolean(acc.verified),
                            role: acc.role || 'user'
                        });
                    }
                }

                // If fewer than 5 active accounts exist, seed official club roster for excitement
                if (players.length < 5) {
                    const defaultSeed = [
                        { uid: 'seed_gm_magnus', username: 'magnus_fan', displayName: 'Magnus C. (Club Captain)', chessElo: 1845, chessWins: 42, chessLosses: 3, chessDraws: 5, winRate: 84, avatar: '👑', nameColor: '#fbbf24', verified: true, role: 'captain' },
                        { uid: 'seed_gm_hikaru', username: 'blitz_master', displayName: 'Hikaru N. (Speed King)', chessElo: 1790, chessWins: 38, chessLosses: 6, chessDraws: 4, winRate: 79, avatar: '⚡', nameColor: '#38bdf8', verified: true, role: 'contender' },
                        { uid: 'seed_gm_judit', username: 'tactics_queen', displayName: 'Judit P. (Tactician)', chessElo: 1680, chessWins: 29, chessLosses: 8, chessDraws: 3, winRate: 73, avatar: '🔥', nameColor: '#ff4b72', verified: true, role: 'member' },
                        { uid: 'seed_gm_morphy', username: 'romantic_openings', displayName: 'Paul M. (Old School)', chessElo: 1540, chessWins: 21, chessLosses: 9, chessDraws: 2, winRate: 66, avatar: '⚔️', nameColor: '#a855f7', verified: false, role: 'member' },
                        { uid: 'seed_gm_mascot', username: 'jellyfish_mascot', displayName: 'Jellyfish Mascot', chessElo: 1220, chessWins: 12, chessLosses: 14, chessDraws: 2, winRate: 43, avatar: '🐾', nameColor: '#22c55e', verified: true, role: 'mascot' }
                    ];
                    for (const s of defaultSeed) {
                        if (!players.some(p => p.username === s.username)) {
                            players.push({
                                ...s,
                                chessGamesCount: s.chessWins + s.chessLosses + s.chessDraws
                            });
                        }
                    }
                }

                players.sort((a, b) => b.chessElo - a.chessElo);
                return res.status(200).json({ success: true, leaderboard: players.slice(0, 100) });
            }

            default:
                return res.status(400).json({ error: "Unknown action" });
        }
    } catch (err) {
        return res.status(500).json({ error: "Internal server error" });
    }
}

async function handleGameEnd(game) {
    if (!game || !game.rated || game.isBot || game.eloProcessed) return;

    const whiteUid = game.white?.uid;
    const blackUid = game.black?.uid;
    if (!whiteUid || !blackUid || whiteUid.startsWith('guest_') || blackUid.startsWith('guest_')) return;

    const whiteAcc = await getUserAccount(whiteUid);
    const blackAcc = await getUserAccount(blackUid);
    if (!whiteAcc || !blackAcc) return;

    let matchResult = 0.5;
    let whiteOutcome = 'draw', blackOutcome = 'draw';
    if (game.winner === 'w') { matchResult = 1; whiteOutcome = 'win'; blackOutcome = 'loss'; }
    else if (game.winner === 'b') { matchResult = 0; whiteOutcome = 'loss'; blackOutcome = 'win'; }

    const { whiteElo: newWhiteElo, blackElo: newBlackElo, whiteChange, blackChange } = calculateNewElos(whiteAcc.chessElo || 1200, blackAcc.chessElo || 1200, matchResult);

    await updateUserEloAndStats(whiteUid, newWhiteElo, whiteOutcome);
    await updateUserEloAndStats(blackUid, newBlackElo, blackOutcome);

    await db.ref(`/chess/games/${game.id}`).update({
        eloProcessed: true,
        whiteEloChange: whiteChange,
        blackEloChange: blackChange,
        newWhiteElo,
        newBlackElo
    });
}
