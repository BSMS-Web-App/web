import React, { useState } from 'react';
import {
  AIDifficulty,
  GameMode,
  GameStatus,
  Move,
  PieceColor,
  TimeControlSetting,
} from '../types/chess';
import {
  RotateCcw,
  Flag,
  Handshake,
  RotateCw,
  Cpu,
  User,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  Sliders,
  Check,
  X,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { sound } from '../utils/audio';

interface GameControlsProps {
  mode: GameMode;
  status: GameStatus;
  turn: PieceColor;
  isAiGame: boolean;
  aiDifficulty: AIDifficulty;
  whiteTime: number;
  blackTime: number;
  timeControl: TimeControlSetting;
  moveHistory: Move[];
  onNewGame: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onFlipBoard: () => void;
  onChangeAiDifficulty: (diff: AIDifficulty) => void;
  onChangeTimeControl: (setting: TimeControlSetting) => void;
  isFlipped: boolean;
  blitzSpeedMultiplier?: number;
}

export const GameControls: React.FC<GameControlsProps> = ({
  mode,
  status,
  turn,
  isAiGame,
  aiDifficulty,
  whiteTime,
  blackTime,
  timeControl,
  moveHistory,
  onNewGame,
  onResign,
  onOfferDraw,
  onFlipBoard,
  onChangeAiDifficulty,
  onChangeTimeControl,
  isFlipped,
  blitzSpeedMultiplier = 1,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [customMins, setCustomMins] = useState(Math.max(1, timeControl.baseMinutes));
  const [customInc, setCustomInc] = useState(timeControl.incrementSeconds);
  const [isUnlimited, setIsUnlimited] = useState(timeControl.baseMinutes === -1);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const formatTime = (seconds: number) => {
    if (timeControl.baseMinutes === -1) {
      return '∞';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const presets: TimeControlSetting[] = [
    { baseMinutes: 1, incrementSeconds: 0, label: '1m Bullet' },
    { baseMinutes: 3, incrementSeconds: 0, label: '3m Blitz' },
    { baseMinutes: 5, incrementSeconds: 2, label: '5m | 2s Rapid' },
    { baseMinutes: 10, incrementSeconds: 0, label: '10m Standard' },
    { baseMinutes: 15, incrementSeconds: 10, label: '15m | 10s Classical' },
    { baseMinutes: -1, incrementSeconds: 0, label: 'Unlimited (Casual)' },
  ];

  const handleApplyCustomTime = () => {
    if (isUnlimited) {
      onChangeTimeControl({
        baseMinutes: -1,
        incrementSeconds: 0,
        label: 'Unlimited (Casual)',
      });
    } else {
      onChangeTimeControl({
        baseMinutes: customMins,
        incrementSeconds: customInc,
        label: `${customMins}m${customInc > 0 ? ` | +${customInc}s` : ''}`,
      });
    }
    setShowTimeModal(false);
  };

  return (
    <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 w-full">
      {/* Player Clocks */}
      <div className="grid grid-cols-2 gap-3">
        {/* Black Clock */}
        <div
          className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
            turn === 'b' && status === 'active'
              ? 'bg-[#181824] border-red-500/80 shadow-[0_0_12px_rgba(187,0,30,0.3)] ring-1 ring-red-500/40'
              : 'bg-[#121218] border-zinc-800/80 opacity-80'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-zinc-300 flex items-center gap-1.5">
              {isAiGame ? <Cpu className="w-3.5 h-3.5 text-zinc-400" /> : <User className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{isAiGame ? 'AI Opponent' : 'Black'}</span>
            </span>
            {turn === 'b' && status === 'active' && timeControl.baseMinutes !== -1 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div className="text-2xl font-mono font-black text-white flex items-center gap-1">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span>{formatTime(blackTime)}</span>
          </div>
        </div>

        {/* White Clock */}
        <div
          className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
            turn === 'w' && status === 'active'
              ? 'bg-[#181824] border-red-500/80 shadow-[0_0_12px_rgba(187,0,30,0.3)] ring-1 ring-red-500/40'
              : 'bg-[#121218] border-zinc-800/80 opacity-80'
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-zinc-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>You (White)</span>
            </span>
            {turn === 'w' && status === 'active' && timeControl.baseMinutes !== -1 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div className="text-2xl font-mono font-black text-white flex items-center gap-1">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span>{formatTime(whiteTime)}</span>
          </div>
        </div>
      </div>

      {/* Clock Setting Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#14141c] rounded-lg border border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400 font-mono">
          <Clock className="w-3.5 h-3.5 text-red-400" />
          <span>Clock: <strong className="text-white">{timeControl.label}</strong></span>
        </div>
        <button
          onClick={() => setShowTimeModal(true)}
          className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider"
        >
          <Sliders className="w-3 h-3" />
          <span>Set Time</span>
        </button>
      </div>

      {/* Mode Special Blitz Multiplier Warning */}
      {mode === 'sudden_death_blitz' && blitzSpeedMultiplier > 1 && (
        <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-500/40 text-blue-300 text-xs font-mono flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            BLITZ ACCELERATION:
          </span>
          <span className="font-extrabold text-white text-sm">{blitzSpeedMultiplier.toFixed(1)}x SPEED</span>
        </div>
      )}

      {/* Action Buttons: Draw, Resign, Flip, New Game */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onNewGame}
          className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
          title="Start fresh match"
        >
          <RotateCcw className="w-4 h-4 mb-0.5" />
          <span>New</span>
        </button>

        <button
          onClick={onFlipBoard}
          className="flex flex-col items-center justify-center p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 text-xs font-semibold transition-all active:scale-95"
          title="Flip Board Orientation"
        >
          <RotateCw className="w-4 h-4 mb-0.5" />
          <span>Flip</span>
        </button>

        <button
          onClick={onOfferDraw}
          disabled={status !== 'active'}
          className="flex flex-col items-center justify-center p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700/60 text-amber-400 text-xs font-semibold transition-all active:scale-95"
          title="Offer Draw (-6 Elo)"
        >
          <Handshake className="w-4 h-4 mb-0.5" />
          <span>Draw</span>
        </button>

        <button
          onClick={onResign}
          disabled={status !== 'active'}
          className="flex flex-col items-center justify-center p-2 rounded-lg bg-zinc-900 hover:bg-rose-950/40 disabled:opacity-40 border border-zinc-700/60 text-rose-400 text-xs font-semibold transition-all active:scale-95"
          title="Resign Match (-35 Elo)"
        >
          <Flag className="w-4 h-4 mb-0.5" />
          <span>Resign</span>
        </button>
      </div>

      {/* AI Difficulty Selector & Mute Toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">AI Level:</span>
          <select
            value={aiDifficulty}
            onChange={(e) => onChangeAiDifficulty(e.target.value as AIDifficulty)}
            className="bg-[#14141c] border border-zinc-700 text-xs text-white rounded px-2 py-1 focus:outline-none focus:border-red-500"
          >
            <option value="novice">Novice (~800)</option>
            <option value="intermediate">Intermediate (~1400)</option>
            <option value="grandmaster">Grandmaster (~2200)</option>
            <option value="alien_mind">Alien Mind (Apex)</option>
          </select>
        </div>

        <button
          onClick={toggleMute}
          className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Live Move History List */}
      <div className="flex flex-col flex-1 min-h-[140px] max-h-[200px] bg-[#121218] border border-zinc-800/80 rounded-xl p-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pb-1.5 border-b border-zinc-800/60 mb-1.5">
          <span>Move Notation (SAN)</span>
          <span>{Math.ceil(moveHistory.length / 2)} Turns</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs custom-scrollbar pr-1">
          {moveHistory.length === 0 ? (
            <div className="text-zinc-600 text-center py-4 text-[11px]">
              No moves played yet. White begins.
            </div>
          ) : (
            Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
              const whiteMove = moveHistory[i * 2];
              const blackMove = moveHistory[i * 2 + 1];

              return (
                <div key={i} className="flex items-center text-zinc-300 py-0.5 hover:bg-zinc-800/40 px-1 rounded">
                  <span className="w-8 text-zinc-600 font-bold">{i + 1}.</span>
                  <span className="w-20 font-bold text-amber-200">{whiteMove?.san || ''}</span>
                  <span className="w-20 font-bold text-zinc-400">{blackMove?.san || ''}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Time Control Configuration Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14141c] border border-zinc-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setShowTimeModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-red-500" />
              Configure Match Time
            </h4>
            <p className="text-xs text-zinc-400 mb-4">
              Choose a tournament preset or customize how much time each player receives:
            </p>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onChangeTimeControl(preset);
                    setShowTimeModal(false);
                  }}
                  className={`p-2 rounded-lg border text-left text-xs font-mono transition-all ${
                    timeControl.baseMinutes === preset.baseMinutes &&
                    timeControl.incrementSeconds === preset.incrementSeconds
                      ? 'bg-red-950/60 border-red-500 text-white font-bold'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Time Controls */}
            <div className="pt-3 border-t border-zinc-800/80 mb-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-semibold font-mono">Custom Duration:</span>
                <span className="font-bold text-red-400 font-mono">
                  {isUnlimited ? 'Unlimited' : `${customMins} Minutes`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="60"
                  disabled={isUnlimited}
                  value={customMins}
                  onChange={(e) => setCustomMins(parseInt(e.target.value) || 1)}
                  className="w-full accent-red-600 disabled:opacity-40"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-mono">Increment per move:</span>
                <select
                  disabled={isUnlimited}
                  value={customInc}
                  onChange={(e) => setCustomInc(parseInt(e.target.value) || 0)}
                  className="bg-zinc-900 border border-zinc-700 text-xs text-white rounded px-2 py-1 font-mono disabled:opacity-40"
                >
                  <option value="0">+0s</option>
                  <option value="1">+1s</option>
                  <option value="2">+2s</option>
                  <option value="3">+3s</option>
                  <option value="5">+5s</option>
                  <option value="10">+10s</option>
                  <option value="15">+15s</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="unlimitedCheck"
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className="accent-red-600 w-4 h-4 rounded"
                />
                <label htmlFor="unlimitedCheck" className="text-xs text-zinc-300 cursor-pointer font-mono">
                  Unlimited time (No clock expiration)
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTimeModal(false)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCustomTime}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30"
              >
                Apply Time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
