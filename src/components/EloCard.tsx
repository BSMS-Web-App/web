import React from 'react';
import { UserEloProfile, TIER_COLORS } from '../types/chess';
import { Trophy, TrendingUp, TrendingDown, Minus, Award, Swords } from 'lucide-react';

interface EloCardProps {
  profile: UserEloProfile;
}

export const EloCard: React.FC<EloCardProps> = ({ profile }) => {
  const tierStyle = TIER_COLORS[profile.tier] || TIER_COLORS.Bronze;
  const totalGames = profile.wins + profile.draws + profile.losses;
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

  // Next tier threshold
  const tierThresholds: Record<string, number> = {
    Bronze: 1000,
    Silver: 1200,
    Gold: 1400,
    Platinum: 1600,
    Diamond: 1800,
    Master: 2000,
    Grandmaster: 2200,
    Legendary: 3000,
  };
  const nextTarget = tierThresholds[profile.tier] || 1200;
  const prevTarget = profile.tier === 'Bronze' ? 0 : nextTarget - 200;
  const progressPercent = Math.min(100, Math.max(0, ((profile.elo - prevTarget) / (nextTarget - prevTarget)) * 100));

  return (
    <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl relative overflow-hidden">
      {/* Background glow accent */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ backgroundColor: tierStyle.glow }}
      />

      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
              {profile.tier}
            </span>
            <span className="text-zinc-500 text-xs">Rating</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold tracking-tight font-mono text-white">
              {profile.elo}
            </span>
            <span className="text-xs text-zinc-400 font-mono">ELO</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">Peak Rating</div>
          <div className="text-sm font-bold font-mono text-amber-400 flex items-center justify-end gap-1">
            <Trophy className="w-3.5 h-3.5" />
            <span>{profile.bestElo}</span>
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      <div className="mb-4">
        <div className="flex justify-between text-[11px] text-zinc-400 mb-1 font-mono">
          <span>Tier Progress</span>
          <span>{profile.elo} / {nextTarget}</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Win / Draw / Loss Stat Grid */}
      <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-zinc-800/70">
        <div className="bg-[#14141c] p-2 rounded-lg border border-zinc-800/60">
          <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            <span>Wins</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">{profile.wins}</div>
          <div className="text-[9px] text-emerald-500/80 font-mono">+32 avg</div>
        </div>

        <div className="bg-[#14141c] p-2 rounded-lg border border-zinc-800/60">
          <div className="text-[10px] uppercase font-bold text-amber-400 flex items-center justify-center gap-0.5">
            <Minus className="w-3 h-3" />
            <span>Draws</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">{profile.draws}</div>
          <div className="text-[9px] text-amber-500/80 font-mono">-6 elo</div>
        </div>

        <div className="bg-[#14141c] p-2 rounded-lg border border-zinc-800/60">
          <div className="text-[10px] uppercase font-bold text-rose-400 flex items-center justify-center gap-0.5">
            <TrendingDown className="w-3 h-3" />
            <span>Losses</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">{profile.losses}</div>
          <div className="text-[9px] text-rose-500/80 font-mono">-35 elo</div>
        </div>

        <div className="bg-[#14141c] p-2 rounded-lg border border-zinc-800/60">
          <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center justify-center gap-0.5">
            <Swords className="w-3 h-3" />
            <span>Win Rate</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">{winRate}%</div>
          <div className="text-[9px] text-zinc-500 font-mono">{totalGames} games</div>
        </div>
      </div>
    </div>
  );
};
