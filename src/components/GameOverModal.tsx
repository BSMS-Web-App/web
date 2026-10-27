import React, { useEffect } from 'react';
import { GameStatus, PieceColor, GameMode } from '../types/chess';
import confetti from 'canvas-confetti';
import { Trophy, TrendingUp, TrendingDown, Minus, RotateCcw, Swords, Sparkles } from 'lucide-react';
import { sound } from '../utils/audio';

interface GameOverModalProps {
  status: GameStatus;
  winner: PieceColor | 'draw' | null;
  playerColor: PieceColor;
  mode: GameMode;
  eloDelta: number;
  newElo: number;
  onRematch: () => void;
  onClose: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  status,
  winner,
  playerColor,
  mode,
  eloDelta,
  newElo,
  onRematch,
  onClose,
}) => {
  const isWin = winner === playerColor;
  const isDraw = winner === 'draw' || status === 'stalemate' || status === 'draw';
  const isLoss = !isWin && !isDraw;

  useEffect(() => {
    if (isWin) {
      sound.playVictory();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#BB001E', '#EAB308', '#FFFFFF', '#A855F7'],
      });
    } else if (isLoss) {
      sound.playDefeat();
    }
  }, [isWin, isLoss]);

  const getTitle = () => {
    if (isWin) return 'VICTORY!';
    if (isDraw) return 'MATCH DRAW';
    return 'DEFEAT';
  };

  const getSubtitle = () => {
    if (status === 'checkmate') {
      return isWin ? 'Checkmate delivered! Opponent king fallen.' : 'You were checkmated by the opponent.';
    }
    if (status === 'resigned') {
      return isWin ? 'Opponent has resigned the match.' : 'You resigned from the duel.';
    }
    if (status === 'timeout') {
      return isWin ? 'Opponent ran out of time!' : 'Time expired!';
    }
    if (status === 'stalemate') return 'Stalemate reached. No legal moves remaining.';
    return 'Game concluded.';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121218] border-2 border-red-500/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative text-center flex flex-col items-center">
        {/* Victory Icon / Badge */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border shadow-lg ${
            isWin
              ? 'bg-gradient-to-tr from-amber-600 to-yellow-400 border-yellow-300 text-black shadow-yellow-500/40'
              : isDraw
              ? 'bg-gradient-to-tr from-zinc-700 to-zinc-500 border-zinc-400 text-white shadow-zinc-500/30'
              : 'bg-gradient-to-tr from-rose-950 to-red-800 border-red-600 text-white shadow-red-600/30'
          }`}
        >
          {isWin ? (
            <Trophy className="w-8 h-8 animate-bounce" />
          ) : isDraw ? (
            <Minus className="w-8 h-8" />
          ) : (
            <Swords className="w-8 h-8" />
          )}
        </div>

        <h3 className="text-2xl font-black font-mono tracking-tight text-white mb-1">
          {getTitle()}
        </h3>
        <p className="text-xs text-zinc-400 mb-5">{getSubtitle()}</p>

        {/* Elo Delta Box */}
        <div className="w-full bg-[#181824] border border-zinc-800 rounded-xl p-3 mb-5">
          <div className="text-[11px] font-mono uppercase text-zinc-500 font-bold mb-1">
            Rating Adjustment
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-extrabold font-mono text-white">
              {newElo}
            </span>

            <span
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono ${
                eloDelta > 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-600/50'
                  : eloDelta < 0
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-600/50'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {eloDelta > 0 ? (
                <>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>+{eloDelta} ELO</span>
                </>
              ) : eloDelta < 0 ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>{eloDelta} ELO</span>
                </>
              ) : (
                <span>0 ELO</span>
              )}
            </span>
          </div>

          <div className="text-[10px] text-zinc-500 font-mono mt-1">
            {isWin
              ? 'Great victory! Ranked ladder climbing.'
              : isDraw
              ? 'Draw penalty: small Elo reduction applied.'
              : 'Loss penalty: substantial Elo reduction applied.'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2.5 w-full">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-95"
          >
            Review Board
          </button>
          <button
            onClick={onRematch}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/40 transition-all active:scale-95 flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rematch</span>
          </button>
        </div>
      </div>
    </div>
  );
};
