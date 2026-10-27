import React, { useState } from 'react';
import { LeaderboardPlayer, TIER_COLORS, RankTier } from '../types/chess';
import { Trophy, Medal, Search, Swords, Crown, TrendingUp } from 'lucide-react';

interface LeaderboardProps {
  players: LeaderboardPlayer[];
  currentPlayerElo: number;
  onChallengePlayer?: (player: LeaderboardPlayer) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  players,
  currentPlayerElo,
  onChallengePlayer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');

  const filteredPlayers = players.filter((p) => {
    const matchesSearch =
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === 'all' || p.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-600 to-amber-300 text-black font-black text-xs shadow-md shadow-yellow-500/30">
          <Crown className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-slate-400 to-zinc-200 text-black font-black text-xs shadow-md">
          <Medal className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-amber-700 to-amber-500 text-black font-black text-xs shadow-md">
          <Medal className="w-3.5 h-3.5" />
        </div>
      );
    }
    return <span className="font-mono text-zinc-500 font-bold text-xs">#{rank}</span>;
  };

  return (
    <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Trophy className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
              Global Leaderboard
            </h3>
          </div>
          <span className="text-[11px] text-zinc-400">
            Top ranked students & grandmaster champions
          </span>
        </div>

        {/* Search & Tier Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#14141c] border border-zinc-700/80 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 w-36 sm:w-44"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-[#14141c] border border-zinc-700/80 text-zinc-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-500 font-mono"
          >
            <option value="all">All Tiers</option>
            <option value="Legendary">Legendary (2200+)</option>
            <option value="Grandmaster">Grandmaster</option>
            <option value="Master">Master</option>
            <option value="Diamond">Diamond</option>
            <option value="Platinum">Platinum</option>
            <option value="Gold">Gold</option>
          </select>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase font-mono tracking-wider text-zinc-500">
              <th className="py-2 px-2 text-center w-12">Rank</th>
              <th className="py-2 px-3">Player</th>
              <th className="py-2 px-3">Tier</th>
              <th className="py-2 px-3 text-right">Rating</th>
              <th className="py-2 px-3 text-center hidden md:table-cell">W / D / L</th>
              <th className="py-2 px-3 text-right hidden sm:table-cell">Win Rate</th>
              <th className="py-2 px-2 text-center w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40 font-mono">
            {filteredPlayers.map((player) => {
              const tierStyle = TIER_COLORS[player.tier] || TIER_COLORS.Bronze;

              return (
                <tr
                  key={player.id}
                  className="hover:bg-zinc-900/40 transition-colors group"
                >
                  {/* Rank */}
                  <td className="py-2.5 px-2 text-center">
                    <div className="flex items-center justify-center">
                      {getRankBadge(player.rank)}
                    </div>
                  </td>

                  {/* Player info */}
                  <td className="py-2.5 px-3 font-sans">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <img
                          src={player.avatar}
                          alt={player.displayName}
                          className="w-7 h-7 rounded-full object-cover border border-zinc-700 bg-zinc-800"
                        />
                        {player.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-black" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span>{player.displayName}</span>
                          {player.badge && (
                            <span className="text-[9px] font-mono px-1 rounded bg-red-950 text-red-300 border border-red-800/60">
                              {player.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          @{player.username}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Tier */}
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}
                    >
                      {player.tier}
                    </span>
                  </td>

                  {/* Elo */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-bold text-white text-sm tracking-tight">
                      {player.elo}
                    </span>
                  </td>

                  {/* W / D / L */}
                  <td className="py-2.5 px-3 text-center hidden md:table-cell text-[11px] text-zinc-400">
                    <span className="text-emerald-400 font-semibold">{player.wins}W</span>{' '}
                    <span className="text-zinc-500">/</span>{' '}
                    <span className="text-amber-400 font-semibold">{player.draws}D</span>{' '}
                    <span className="text-zinc-500">/</span>{' '}
                    <span className="text-rose-400 font-semibold">{player.losses}L</span>
                  </td>

                  {/* Win Rate */}
                  <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                    <span className="font-bold text-zinc-200">{player.winRate}%</span>
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-2 text-center">
                    {onChallengePlayer && (
                      <button
                        onClick={() => onChallengePlayer(player)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-600/30 text-zinc-300 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/40 text-[10px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1 mx-auto"
                        title="Challenge player to a duel"
                      >
                        <Swords className="w-3 h-3" />
                        <span className="hidden sm:inline">Duel</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
