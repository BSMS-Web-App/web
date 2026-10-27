import React from 'react';
import { GameMode } from '../types/chess';
import { Crown, Zap, Sparkles, ShieldAlert } from 'lucide-react';

interface GameModeSelectorProps {
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  disabled?: boolean;
}

interface ModeDetail {
  id: GameMode;
  name: string;
  tagline: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  description: string;
  accentBorder: string;
}

export const GameModeSelector: React.FC<GameModeSelectorProps> = ({
  selectedMode,
  onSelectMode,
  disabled = false,
}) => {
  const modes: ModeDetail[] = [
    {
      id: 'classic',
      name: 'Classic Chess',
      tagline: 'Standard 8x8 Rules',
      badge: 'RANKED',
      badgeColor: 'bg-emerald-950/60 text-emerald-400 border-emerald-700/50',
      icon: <Crown className="w-5 h-5 text-amber-400" />,
      description: 'The definitive royal duel. Full castling, en passant, promotions, and strategic depth.',
      accentBorder: 'hover:border-amber-500/50',
    },
    {
      id: 'alien_mode',
      name: 'Alien Overlord',
      tagline: 'Extraterrestrial Unit',
      badge: 'SPECIAL',
      badgeColor: 'bg-purple-950/60 text-purple-300 border-purple-700/50',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      description: "White commands ONLY 1 piece: The Alien Overlord with combined Queen, Knight & King mobility against Black's entire army!",
      accentBorder: 'hover:border-purple-500/50',
    },
    {
      id: 'king_vs_100_pawns',
      name: '1 King vs 100 Pawns',
      tagline: 'Survival Defense',
      badge: 'HARDCORE',
      badgeColor: 'bg-red-950/60 text-red-300 border-red-700/50',
      icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
      description: 'A lone White Sovereign equipped with 360° Cleave stands against 100 marching pawns!',
      accentBorder: 'hover:border-red-500/50',
    },
    {
      id: 'sudden_death_blitz',
      name: 'Sudden Death Blitz',
      tagline: 'Accelerating Speed',
      badge: 'SPEED',
      badgeColor: 'bg-blue-950/60 text-blue-300 border-blue-700/50',
      icon: <Zap className="w-5 h-5 text-blue-400" />,
      description: 'Fast rounds where clock tick rate accelerates every few moves as time runs out!',
      accentBorder: 'hover:border-blue-500/50',
    },
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5 font-mono">
          <span>Select Gamemode</span>
        </h3>
        <span className="text-[11px] text-zinc-500 font-mono">4 custom modes</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              onClick={() => onSelectMode(mode.id)}
              disabled={disabled}
              className={`text-left p-3 rounded-xl border transition-all duration-200 relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-b from-[#181824] to-[#121218] border-red-500/80 shadow-[0_0_16px_rgba(187,0,30,0.3)] ring-1 ring-red-500/50'
                  : `bg-[#0e0e13] border-zinc-800/80 ${mode.accentBorder} hover:bg-[#14141c]`
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
                    {mode.icon}
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${mode.badgeColor}`}>
                    {mode.badge}
                  </span>
                </div>

                <div className="font-bold text-sm text-white mb-0.5">{mode.name}</div>
                <div className="text-[11px] text-zinc-400 font-mono mb-2">{mode.tagline}</div>
              </div>

              <p className="text-[11px] text-zinc-400/90 leading-relaxed border-t border-zinc-800/60 pt-2">
                {mode.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
