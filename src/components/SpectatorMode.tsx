import React, { useState, useEffect } from 'react';
import { SpectatorMatch, Move, BoardGrid, PieceColor, Position, Piece } from '../types/chess';
import { ChessBoard } from './ChessBoard';
import { createInitialBoard, getAllLegalMoves } from '../utils/chessEngine';
import { Eye, MessageSquare, Send, Users, Sparkles, Trophy, ArrowLeft, Radio } from 'lucide-react';
import { sound } from '../utils/audio';

interface SpectatorModeProps {
  matches: SpectatorMatch[];
  initialMatchId?: string;
  onExit: () => void;
}

export const SpectatorMode: React.FC<SpectatorModeProps> = ({
  matches,
  initialMatchId,
  onExit,
}) => {
  const [activeMatchId, setActiveMatchId] = useState<string>(
    initialMatchId || (matches[0] ? matches[0].id : '')
  );
  const [board, setBoard] = useState<BoardGrid>(createInitialBoard('classic'));
  const [turn, setTurn] = useState<PieceColor>('w');
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [spectatorMoveToAnimate, setSpectatorMoveToAnimate] = useState<{
    from: Position;
    to: Position;
    piece: Piece;
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<
    { user: string; text: string; time: string }[]
  >([]);
  const [inputMsg, setInputMsg] = useState('');

  const currentMatch = matches.find((m) => m.id === activeMatchId) || matches[0];

  // Initialize match
  useEffect(() => {
    if (currentMatch) {
      setBoard(createInitialBoard(currentMatch.mode));
      setChatMessages(currentMatch.chatMessages);
      setLastMove(null);
      setSpectatorMoveToAnimate(null);
      setTurn('w');
    }
  }, [activeMatchId, currentMatch]);

  // Simulate ongoing live moves in spectator match with smooth animation
  useEffect(() => {
    if (!currentMatch) return;

    const interval = setInterval(() => {
      // Pick random legal move and trigger sliding animation
      const legalMoves = getAllLegalMoves(board, turn, lastMove, currentMatch.mode);
      if (legalMoves.length > 0) {
        const chosen = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        setSpectatorMoveToAnimate({
          from: chosen.from,
          to: chosen.to,
          piece: chosen.piece,
        });
      }

      // Add occasional spectator chatter
      const sampleComments = [
        'Insane tactical awareness by White!',
        'Can Black hold this endgame?',
        'Look at that bishop pair pressure!',
        'The Alien piece is completely dominating the center!',
        'Time trouble for both players right now!',
        'GM level calculation right here.',
        'GG in 3 moves or what?',
      ];
      if (Math.random() < 0.4) {
        const randomComment = sampleComments[Math.floor(Math.random() * sampleComments.length)];
        const randomUsers = ['KnightRider', 'ChessNinja', 'BoilingSpringsPro', 'MagnusFan26', 'PawnsOnly'];
        const randomUser = randomUsers[Math.floor(Math.random() * randomUsers.length)];

        setChatMessages((prev) => [
          ...prev.slice(-25),
          {
            user: randomUser,
            text: randomComment,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, [currentMatch]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      {
        user: 'You',
        text: inputMsg.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInputMsg('');
  };

  if (!currentMatch) {
    return (
      <div className="text-center py-12 text-zinc-400">
        <p>No active matches available for spectating.</p>
        <button onClick={onExit} className="mt-3 px-4 py-2 bg-zinc-800 text-white rounded-lg">
          Return
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
      {/* Top Banner */}
      <div className="flex items-center justify-between bg-[#0e0e13] border border-zinc-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-700/60 transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Leave Spectator</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5" />
              LIVE SPECTATOR BROADCAST
            </span>
          </div>
        </div>

        {/* Live Channel Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMatchId(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                m.id === currentMatch.id
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {m.whitePlayer.name} vs {m.blackPlayer.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Board + Match Info & Spectator Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: The Live Board */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Black Player Banner */}
          <div className="w-full max-w-[620px] bg-[#121218] border border-zinc-800 px-4 py-2.5 rounded-t-xl flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <img
                src={currentMatch.blackPlayer.avatar}
                alt={currentMatch.blackPlayer.name}
                className="w-8 h-8 rounded-full border border-zinc-700"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-white">
                    {currentMatch.blackPlayer.name}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    ({currentMatch.blackPlayer.elo})
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">Playing as Black</div>
              </div>
            </div>

            <div className="font-mono text-sm font-bold bg-zinc-900 px-3 py-1 rounded border border-zinc-800 text-zinc-200">
              03:42
            </div>
          </div>

          {/* Interactive Chess Board with spectator move animations */}
          <ChessBoard
            board={board}
            turn={turn}
            mode={currentMatch.mode}
            inCheck={null}
            lastMove={lastMove}
            interactive={false}
            externalMove={spectatorMoveToAnimate}
            onExternalMoveComplete={() => setSpectatorMoveToAnimate(null)}
            onMove={(m, nextB) => {
              setBoard(nextB);
              setLastMove(m);
              setTurn((prev) => (prev === 'w' ? 'b' : 'w'));
              setSpectatorMoveToAnimate(null);
            }}
          />

          {/* White Player Banner */}
          <div className="w-full max-w-[620px] bg-[#121218] border border-zinc-800 px-4 py-2.5 rounded-b-xl flex items-center justify-between mt-1">
            <div className="flex items-center gap-2.5">
              <img
                src={currentMatch.whitePlayer.avatar}
                alt={currentMatch.whitePlayer.name}
                className="w-8 h-8 rounded-full border border-zinc-700"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-white">
                    {currentMatch.whitePlayer.name}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    ({currentMatch.whitePlayer.elo})
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">Playing as White</div>
              </div>
            </div>

            <div className="font-mono text-sm font-bold bg-zinc-900 px-3 py-1 rounded border border-zinc-800 text-zinc-200">
              04:15
            </div>
          </div>
        </div>

        {/* Right: Spectator Chat & Match Details */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Match Status Card */}
          <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
              <div>
                <div className="text-xs uppercase font-mono font-bold text-zinc-400">
                  {currentMatch.mode.replace(/_/g, ' ')}
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  {currentMatch.whitePlayer.name} vs {currentMatch.blackPlayer.name}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                <Users className="w-3.5 h-3.5 text-red-400" />
                <span>{currentMatch.spectatorCount} watching</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#14141c] p-2.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Engine Eval</span>
                <span className="text-emerald-400 font-bold text-sm">+1.4 (White Advantage)</span>
              </div>
              <div className="bg-[#14141c] p-2.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Move Count</span>
                <span className="text-white font-bold text-sm">Move 24</span>
              </div>
            </div>
          </div>

          {/* Live Spectator Chat */}
          <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col h-[380px]">
            <div className="flex items-center gap-2 pb-2.5 border-b border-zinc-800/80 mb-3">
              <MessageSquare className="w-4 h-4 text-red-500" />
              <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                Audience Chat
              </h4>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs">
              {chatMessages.map((msg, i) => (
                <div key={i} className="bg-[#14141c] p-2 rounded-lg border border-zinc-800/60">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-amber-400 font-mono text-[11px]">
                      {msg.user}
                    </span>
                    <span className="text-[10px] text-zinc-500">{msg.time}</span>
                  </div>
                  <p className="text-zinc-300 leading-snug">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendChat} className="flex gap-2 mt-3 pt-2 border-t border-zinc-800/80">
              <input
                type="text"
                placeholder="Cheer on or comment..."
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                className="flex-1 bg-[#14141c] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all active:scale-95 flex items-center justify-center shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
