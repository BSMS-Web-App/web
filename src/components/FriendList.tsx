import React, { useState } from 'react';
import { Friend, GameMode, RankTier, TIER_COLORS } from '../types/chess';
import {
  Users,
  Eye,
  Swords,
  UserPlus,
  Circle,
  Copy,
  Check,
  Share2,
  X,
  Sparkles,
} from 'lucide-react';

interface FriendListProps {
  friends: Friend[];
  onSpectateMatch: (matchId: string) => void;
  onInvitePlayer: (friend: Friend, mode: GameMode) => void;
  onAddFriend: (username: string) => void;
}

export const FriendList: React.FC<FriendListProps> = ({
  friends,
  onSpectateMatch,
  onInvitePlayer,
  onAddFriend,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [selectedFriendForInvite, setSelectedFriendForInvite] = useState<Friend | null>(null);
  const [selectedInviteMode, setSelectedInviteMode] = useState<GameMode>('classic');
  const [copiedLink, setCopiedLink] = useState(false);
  const [filter, setFilter] = useState<'all' | 'online' | 'in_game'>('all');

  const filteredFriends = friends.filter((f) => {
    if (filter === 'online') return f.status === 'online';
    if (filter === 'in_game') return f.status === 'in_game';
    return true;
  });

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/#invite-chess-${Math.random().toString(36).substring(7)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendInvite = () => {
    if (selectedFriendForInvite) {
      onInvitePlayer(selectedFriendForInvite, selectedInviteMode);
      setSelectedFriendForInvite(null);
    }
  };

  return (
    <div className="bg-[#0e0e13] border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-900/40">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Friend List
            </h3>
            <span className="text-[11px] text-zinc-400">
              {friends.filter((f) => f.status !== 'offline').length} online now
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyInviteLink}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-xs font-semibold text-zinc-300 transition-all active:scale-95"
            title="Copy Game Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copied!' : 'Share Room'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-[#14141c] p-1 rounded-lg mb-3 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1 rounded font-medium transition-colors ${
            filter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          All ({friends.length})
        </button>
        <button
          onClick={() => setFilter('online')}
          className={`flex-1 py-1 rounded font-medium transition-colors ${
            filter === 'online' ? 'bg-zinc-800 text-emerald-400 shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Online ({friends.filter((f) => f.status === 'online').length})
        </button>
        <button
          onClick={() => setFilter('in_game')}
          className={`flex-1 py-1 rounded font-medium transition-colors ${
            filter === 'in_game' ? 'bg-zinc-800 text-amber-400 shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          In Game ({friends.filter((f) => f.status === 'in_game').length})
        </button>
      </div>

      {/* Friends List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[380px]">
        {filteredFriends.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">
            No friends found in this view.
          </div>
        ) : (
          filteredFriends.map((friend) => {
            const tierStyle = TIER_COLORS[friend.tier] || TIER_COLORS.Bronze;

            return (
              <div
                key={friend.id}
                className="bg-[#121218] border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl p-2.5 transition-all flex items-center justify-between gap-3"
              >
                {/* Avatar and Info */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <img
                      src={friend.avatar}
                      alt={friend.displayName}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-700 bg-zinc-800"
                    />
                    {/* Status Dot */}
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#121218] ${
                        friend.status === 'online'
                          ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                          : friend.status === 'in_game'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-zinc-600'
                      }`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-white truncate">
                        {friend.displayName}
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
                        {friend.elo}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-400 truncate font-mono">
                      {friend.status === 'in_game' && friend.currentMatch ? (
                        <span className="text-amber-400/90 flex items-center gap-1">
                          <span>In match vs {friend.currentMatch.opponentName}</span>
                        </span>
                      ) : friend.status === 'online' ? (
                        <span className="text-emerald-400">Available to play</span>
                      ) : (
                        <span className="text-zinc-500">Offline</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {friend.status === 'in_game' && friend.currentMatch && (
                    <button
                      onClick={() => onSpectateMatch(friend.currentMatch!.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm"
                      title="Spectate live game in progress"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Watch</span>
                    </button>
                  )}

                  {friend.status !== 'offline' && (
                    <button
                      onClick={() => setSelectedFriendForInvite(friend)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                      title="Send challenge invite"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Invite</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Challenge Invite Modal */}
      {selectedFriendForInvite && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14141c] border border-zinc-700 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setSelectedFriendForInvite(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2 mb-1">
              <Swords className="w-4 h-4 text-red-500" />
              Challenge {selectedFriendForInvite.displayName}
            </h4>
            <p className="text-xs text-zinc-400 mb-4">
              Select the battlefield gamemode for your private duel:
            </p>

            <div className="space-y-2 mb-4">
              {[
                { id: 'classic', label: 'Classic Chess', sub: 'Standard 8x8 Elo ranked match' },
                { id: 'alien_mode', label: 'Alien Overlord', sub: 'Extraterrestrial hybrid piece mode' },
                { id: 'sudden_death_blitz', label: 'Sudden Death Blitz', sub: 'Accelerating speed clock rounds' },
                { id: 'king_vs_100_pawns', label: '1 King vs 100 Pawns', sub: 'Asymmetric survival duel' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedInviteMode(m.id as GameMode)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${
                    selectedInviteMode === m.id
                      ? 'bg-red-950/40 border-red-500 text-white'
                      : 'bg-[#0e0e13] border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-bold">{m.label}</div>
                  <div className="text-[10px] text-zinc-400">{m.sub}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFriendForInvite(null)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30"
              >
                Send Challenge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#14141c] border border-zinc-700 rounded-xl p-5 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h4 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2 mb-1">
              <UserPlus className="w-4 h-4 text-red-500" />
              Add Friend
            </h4>
            <p className="text-xs text-zinc-400 mb-4">
              Enter username or student friend code to connect:
            </p>

            <input
              type="text"
              placeholder="e.g. Marcus_BSMS or GrandmasterKai"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full bg-[#0a0a0e] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 mb-4 focus:outline-none focus:border-red-500"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newUsername.trim()) {
                    onAddFriend(newUsername.trim());
                    setNewUsername('');
                    setShowAddModal(false);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
