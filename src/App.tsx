import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Crown,
  Swords,
  Users,
  Trophy,
  Eye,
  Volume2,
  VolumeX,
  RotateCcw,
  Flag,
  ShieldAlert,
  Play,
  UserPlus,
  Radio,
  Bot,
  FlipVertical,
  Wrench,
  Handshake,
  Clock,
  History,
  Palette,
  Edit3,
  Check,
  TrendingUp,
  Globe,
  Copy,
  Link2,
  Loader2,
  Lock,
  Maximize2,
  Camera,
  Upload,
  RefreshCw,
  Home,
  MessageSquare,
  Gamepad2,
  Timer,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BoardGrid,
  Piece,
  PieceColor,
  PieceType,
  GameMode,
  Move,
  Position,
  CustomGameModeConfig,
  AlienMoveRule,
  MoveRating,
  MOVE_RATING_META,
} from './types/chess';
import {
  createInitialBoard,
  createPiece,
  cloneBoard,
  getAllLegalMoves,
  isKingInCheck,
  getAIMove,
  findKing,
  calculateEloChange,
  getTierFromElo,
  classifyMove,
  detectOpening,
} from './utils/chessEngine';
import { ChessBoard } from './components/ChessBoard';
import { CustomModeBuilder, BrushSelection } from './components/CustomModeBuilder';
import { FAMOUS_BOTS, FamousBotProfile } from './data/famousBots';
import { sound } from './utils/audio';

interface ConnectedHumanUser {
  clientId: string;
  memberId: string;
  username: string;
  elo: number;
  avatar: string;
  status: 'online' | 'in_queue' | 'in_game';
  roomId?: string;
}

interface WebsiteMemberRecord {
  memberId: string;
  username: string;
  avatar: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  online: boolean;
  status: 'online' | 'in_queue' | 'in_game' | 'offline';
  lastSeen: number;
}

interface IncomingChallenge {
  fromUser: ConnectedHumanUser;
  mode: GameMode;
  mins: number;
  inc: number;
}

interface ArenaLeaderboardEntry {
  rank: number;
  memberId: string;
  name: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  badge: string;
  avatar: string;
  online: boolean;
  isUser?: boolean;
}

interface LiveHumanMatch {
  roomId: string;
  mode: GameMode;
  timeControlLabel: string;
  whitePlayer: string;
  whiteElo: number;
  whiteAvatar: string;
  blackPlayer: string;
  blackElo: number;
  blackAvatar: string;
  spectators: number;
}

interface MatchHistoryItem {
  id: string;
  date: string;
  opponentName: string;
  opponentElo: number;
  opponentType: 'online' | 'bot';
  mode: GameMode;
  isRated: boolean;
  result: 'win' | 'draw' | 'loss';
  eloDelta: number;
  newElo: number;
  moves: number;
}

/**
 * Automatically detects and syncs any BSMS website member's account name and profile picture (pfp)
 * from URL query params or shared website localStorage keys so their Chess identity matches their site account.
 */
function detectWebsiteMemberAccount(): {
  memberId: string;
  username: string;
  pfp: string;
} {
  let detectedName = '';
  let detectedPfp = '';
  let detectedId = '';

  // 1. Check URL query parameters if navigated from main BSMS website
  try {
    const params = new URLSearchParams(window.location.search);
    detectedName =
      params.get('username') ||
      params.get('name') ||
      params.get('user') ||
      params.get('member') ||
      '';
    detectedPfp =
      params.get('pfp') ||
      params.get('avatar') ||
      params.get('profilePic') ||
      params.get('photo') ||
      '';
    detectedId = params.get('memberId') || params.get('uid') || params.get('id') || '';
  } catch {
    // ignore
  }

  // 2. Check BSMS Website JSON objects in localStorage (prioritizing bsms_auth_session from BSMS Web)
  const candidateJsonKeys = [
    'bsms_auth_session',
    'bsms_member',
    'bsms_user',
    'bsms_account',
    'bsms_profile',
    'currentUser',
    'user',
    'account',
    'profile',
    'member',
    'auth_user',
  ];

  for (const key of candidateJsonKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (!detectedName) {
            detectedName =
              parsed.displayName ||
              parsed.username ||
              parsed.name ||
              parsed.accountName ||
              parsed.handle ||
              '';
          }
          if (!detectedPfp) {
            detectedPfp =
              parsed.pfp ||
              parsed.avatar ||
              parsed.avatarUrl ||
              parsed.profilePicture ||
              parsed.profilePic ||
              parsed.photoURL ||
              parsed.image ||
              '';
          }
          if (!detectedId) {
            detectedId = parsed.uid || parsed.memberId || parsed.id || '';
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Check direct string keys in localStorage
  if (!detectedName) {
    detectedName =
      localStorage.getItem('bsms_username') ||
      localStorage.getItem('username') ||
      localStorage.getItem('account_name') ||
      localStorage.getItem('bsms_chess_username_v2') ||
      'BSMS_Member';
  }

  if (!detectedPfp) {
    detectedPfp =
      localStorage.getItem('bsms_pfp') ||
      localStorage.getItem('pfp') ||
      localStorage.getItem('avatar') ||
      localStorage.getItem('bsms_avatar') ||
      localStorage.getItem('bsms_chess_pfp_v1') ||
      '/img/pfp.png';
  }

  if (!detectedId) {
    const savedId = localStorage.getItem('bsms_member_id_v1');
    if (savedId) {
      detectedId = savedId;
    } else {
      detectedId = `member_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('bsms_member_id_v1', detectedId);
    }
  }

  return {
    memberId: detectedId,
    username: detectedName.trim() || 'BSMS_Member',
    pfp: detectedPfp.trim() || '/img/pfp.png',
  };
}

const PRESET_PFPS = [
  { label: 'BSMS Default', url: '/img/pfp.png' },
  { label: 'BSMS Crest', url: '/img/icon.png' },
  { label: 'BSMS Badge', url: '/img/app-icon.png' },
];

const BOARD_SIZE_PRESETS = [
  { label: 'Compact', px: 380 },
  { label: 'Default', px: 440 },
  { label: 'Medium', px: 500 },
  { label: 'Large', px: 580 },
];

const MODE_INFO: Record<
  GameMode,
  {
    title: string;
    subtitle: string;
    badge: string;
    isStandard: boolean;
    defaultMinutes: number;
    accent: string;
  }
> = {
  classic: {
    title: 'Standard Chess',
    subtitle: 'Official Chess.com rules. Play Online vs Website Members for Rated ELO!',
    badge: 'STANDARD',
    isStandard: true,
    defaultMinutes: 10,
    accent: 'from-[#81b64c] to-[#537133]',
  },
  alien_mode: {
    title: 'Lone Alien Overlord',
    subtitle: 'Unrated Variant: White commands 1 Alien piece that moves along any clear path.',
    badge: 'UNRATED VARIANT',
    isStandard: false,
    defaultMinutes: 5,
    accent: 'from-fuchsia-600 to-purple-800',
  },
  king_vs_100_pawns: {
    title: '1 King vs 100 Pawns',
    subtitle: 'Unrated Variant: White King unleashes Royal Cleave vs waves of 100 Pawns.',
    badge: 'UNRATED VARIANT',
    isStandard: false,
    defaultMinutes: 5,
    accent: 'from-amber-500 to-orange-700',
  },
  sudden_death_blitz: {
    title: 'Sudden Death Overdrive',
    subtitle: 'Unrated Variant: Blitz where clock drain accelerates every 5 turns!',
    badge: 'UNRATED VARIANT',
    isStandard: false,
    defaultMinutes: 3,
    accent: 'from-rose-600 to-red-800',
  },
  custom: {
    title: 'Custom Studio Mode',
    subtitle: 'Unrated Variant: Your custom-painted board layout and custom physics rules.',
    badge: 'UNRATED CUSTOM',
    isStandard: false,
    defaultMinutes: 5,
    accent: 'from-cyan-500 to-blue-700',
  },
};

const TIME_PRESETS = [
  { label: '1 min', category: 'Bullet', mins: 1, inc: 0 },
  { label: '2 | 1', category: 'Bullet', mins: 2, inc: 1 },
  { label: '3 min', category: 'Blitz', mins: 3, inc: 0 },
  { label: '3 | 2', category: 'Blitz', mins: 3, inc: 2 },
  { label: '5 min', category: 'Blitz', mins: 5, inc: 0 },
  { label: '5 | 2', category: 'Blitz', mins: 5, inc: 2 },
  { label: '10 min', category: 'Rapid', mins: 10, inc: 0 },
  { label: '15 | 10', category: 'Rapid', mins: 15, inc: 10 },
];

type NavSection = 'bots' | 'online' | 'custom' | 'friends' | 'leaderboard';

export default function App() {
  // Initial synced BSMS Website Member identity
  const initialIdentity = detectWebsiteMemberAccount();

  // Unique Client ID for Real-Time WebSocket Session
  const [myClientId] = useState<string>(() => {
    const existing = sessionStorage.getItem('bsms_client_id');
    if (existing) return existing;
    const created = `user_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('bsms_client_id', created);
    return created;
  });

  const [myMemberId, setMyMemberId] = useState<string>(initialIdentity.memberId);

  // Navigation, Board Theme & Configurable Board Size State
  const [navSection, setNavSection] = useState<NavSection>('bots');
  const [boardTheme, setBoardTheme] = useState<'green' | 'wood' | 'icy' | 'crimson'>('green');
  const [boardSizePx, setBoardSizePx] = useState<number>(() => {
    const saved = localStorage.getItem('bsms_chess_board_size_v2');
    if (saved) {
      const parsed = Number(saved);
      if (!Number.isNaN(parsed) && parsed >= 320 && parsed <= 760) return parsed;
    }
    return 440;
  });
  const [showTimeSelector, setShowTimeSelector] = useState<boolean>(false);

  // Persistent BSMS Website Member Account Name & PFP — Automatically synced!
  const [username, setUsername] = useState<string>(initialIdentity.username);
  const [userPfp, setUserPfp] = useState<string>(initialIdentity.pfp);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialIdentity.username);
  const [pfpDraft, setPfpDraft] = useState(initialIdentity.pfp);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ELO State — Starts at 0 ELO! Only changes in Online Standard Chess vs Real Members (NEVER vs Bots!)
  const [userElo, setUserElo] = useState<number>(() => {
    const saved = localStorage.getItem('bsms_chess_elo_zero_v1');
    return saved !== null ? Math.max(0, Number(saved)) : 0;
  });

  const [userRecord, setUserRecord] = useState<{
    wins: number;
    draws: number;
    losses: number;
    streak: number;
    bestElo: number;
  }>(() => {
    const saved = localStorage.getItem('bsms_chess_record_zero_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return { wins: 0, draws: 0, losses: 0, streak: 0, bestElo: 0 };
  });

  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>(() => {
    const saved = localStorage.getItem('bsms_chess_history_zero_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('bsms_chess_board_size_v2', String(boardSizePx));
  }, [boardSizePx]);

  useEffect(() => {
    localStorage.setItem('bsms_chess_elo_zero_v1', String(userElo));
  }, [userElo]);

  useEffect(() => {
    localStorage.setItem('bsms_chess_record_zero_v1', JSON.stringify(userRecord));
  }, [userRecord]);

  // Save BSMS Member account name & pfp to shared localStorage keys so the website and chess stay in sync
  useEffect(() => {
    localStorage.setItem('bsms_chess_username_v2', username);
    localStorage.setItem('bsms_username', username);
    localStorage.setItem('bsms_chess_pfp_v1', userPfp);
    localStorage.setItem('bsms_pfp', userPfp);
    localStorage.setItem(
      'bsms_member',
      JSON.stringify({
        memberId: myMemberId,
        username,
        pfp: userPfp,
        avatar: userPfp,
        elo: userElo,
      })
    );
  }, [username, userPfp, myMemberId, userElo]);

  useEffect(() => {
    localStorage.setItem('bsms_chess_history_zero_v1', JSON.stringify(matchHistory));
  }, [matchHistory]);

  // Listen for live BSMS website account sync via postMessage or storage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (
        data.type === 'bsms:member_sync' ||
        data.type === 'bsms:user' ||
        data.username ||
        data.pfp ||
        data.avatar
      ) {
        const nextName =
          data.username || data.name || data.displayName || data.user?.username || '';
        const nextPfp =
          data.pfp || data.avatar || data.profilePic || data.user?.pfp || data.user?.avatar || '';
        const nextId = data.memberId || data.id || data.user?.id || '';
        if (nextName && typeof nextName === 'string') {
          setUsername(nextName.trim());
          setNameDraft(nextName.trim());
        }
        if (nextPfp && typeof nextPfp === 'string') {
          setUserPfp(nextPfp.trim());
          setPfpDraft(nextPfp.trim());
        }
        if (nextId && typeof nextId === 'string') {
          setMyMemberId(nextId.trim());
        }
      }
    };

    const handleStorage = () => {
      const synced = detectWebsiteMemberAccount();
      if (synced.username && synced.username !== username) {
        setUsername(synced.username);
        setNameDraft(synced.username);
      }
      if (synced.pfp && synced.pfp !== userPfp) {
        setUserPfp(synced.pfp);
        setPfpDraft(synced.pfp);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [username, userPfp]);

  // Core Game State — Starts in 'idle' Lobby Preview state!
  const [gameStatus, setGameStatus] = useState<
    'idle' | 'playing' | 'checkmate' | 'stalemate' | 'draw' | 'timeout' | 'resigned'
  >('idle');
  const [matchModeType, setMatchModeType] = useState<'bot' | 'online'>('bot');
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [board, setBoard] = useState<BoardGrid>(() => createInitialBoard('classic'));
  const [turn, setTurn] = useState<PieceColor>('w');
  const [myOnlineColor, setMyOnlineColor] = useState<PieceColor>('w');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [capturedWhite, setCapturedWhite] = useState<Piece[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<Piece[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [externalMove, setExternalMove] = useState<{
    from: Position;
    to: Position;
    piece: Piece;
    promotion?: PieceType;
  } | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Famous AI Bot Selection State (Strictly for Play Bots tab — NEVER on Leaderboard!)
  const [selectedBot, setSelectedBot] = useState<FamousBotProfile>(FAMOUS_BOTS[6]); // GothamChess default preview
  const [botCategoryFilter, setBotCategoryFilter] = useState<
    'All' | 'Creators' | 'Chess Personalities' | 'Super Grandmasters'
  >('All');
  const [botQuote, setBotQuote] = useState<string | null>(FAMOUS_BOTS[6].introQuote);

  // Active Opponent Display State
  const [activeOpponentName, setActiveOpponentName] = useState<string>(FAMOUS_BOTS[6].name);
  const [activeOpponentElo, setActiveOpponentElo] = useState<number>(FAMOUS_BOTS[6].elo);
  const [activeOpponentAvatar, setActiveOpponentAvatar] = useState<string>('/img/icon.png');
  const [activeOpponentBadge, setActiveOpponentBadge] = useState<string>(FAMOUS_BOTS[6].title);

  // Real Online Multiplayer & Website Members State (Strictly Human BSMS Website Members — Zero Bots!)
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedHumanUser[]>([]);
  const [websiteMembers, setWebsiteMembers] = useState<WebsiteMemberRecord[]>([]);
  const [liveHumanMatches, setLiveHumanMatches] = useState<LiveHumanMatch[]>([]);
  const [isSearchingQueue, setIsSearchingQueue] = useState<boolean>(false);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [joinRoomInput, setJoinRoomInput] = useState<string>('');
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(null);
  const [savedFriendNames, setSavedFriendNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('bsms_saved_friend_names_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [];
  });
  const [friendInputName, setFriendInputName] = useState('');
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [showWebsiteBanners, setShowWebsiteBanners] = useState(false);

  useEffect(() => {
    localStorage.setItem('bsms_saved_friend_names_v2', JSON.stringify(savedFriendNames));
  }, [savedFriendNames]);

  // Time Controls
  const [customMinutes, setCustomMinutes] = useState<number>(10);
  const [incrementSeconds, setIncrementSeconds] = useState<number>(0);
  const [whiteTime, setWhiteTime] = useState<number>(600);
  const [blackTime, setBlackTime] = useState<number>(600);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [pawnReinforcementsLeft, setPawnReinforcementsLeft] = useState<number>(68);
  const [cleaveCooldown, setCleaveCooldown] = useState<number>(0);

  // Custom Gamemode Builder State
  const [isEditingBoard, setIsEditingBoard] = useState<boolean>(false);
  const [selectedBrush, setSelectedBrush] = useState<BrushSelection>({
    type: 'alien',
    color: 'w',
  });
  const [customDraftName, setCustomDraftName] = useState<string>('Galactic Overlord Arena');
  const [customDraftDesc, setCustomDraftDesc] = useState<string>(
    'Custom board with omnipotent Alien warps'
  );
  const [alienMoveRule, setAlienMoveRule] = useState<AlienMoveRule>('everywhere');
  const [customRoyalCleave, setCustomRoyalCleave] = useState<boolean>(false);
  const [customAccelBlitz, setCustomAccelBlitz] = useState<boolean>(false);
  const [savedCustomModes, setSavedCustomModes] = useState<CustomGameModeConfig[]>([]);
  const [customStartingBoard, setCustomStartingBoard] = useState<BoardGrid>(() =>
    createInitialBoard('alien_mode')
  );

  // Match Outcome & ELO Delta
  const [winner, setWinner] = useState<PieceColor | 'draw' | null>(null);
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);
  const aiTimeoutRef = useRef<number | null>(null);

  // Fetch initial BSMS Website Members Directory & BSMS Auth Public Users via REST on mount
  useEffect(() => {
    const sessionId = localStorage.getItem('session_id') || '';

    // 1. If logged into BSMS Web with a session_id, verify profile to sync latest displayName & avatar
    if (sessionId) {
      fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({ action: 'getProfile', sessionId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((profile) => {
          if (profile && !profile.error) {
            const syncedName = (profile.displayName || profile.username || '').trim();
            const syncedPfp = (profile.avatar || profile.pfp || '').trim();
            if (syncedName) setUsername(syncedName);
            if (syncedPfp) setUserPfp(syncedPfp);
          }
        })
        .catch(() => {
          // ignore
        });
    }

    // 2. Fetch BSMS Chess members + BSMS /api/auth getPublicUsers and merge
    Promise.allSettled([
      fetch('/api/members').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId ? { 'X-Session-ID': sessionId } : {}),
        },
        body: JSON.stringify({ action: 'getPublicUsers' }),
      }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([membersRes, publicUsersRes]) => {
      const map = new Map<string, WebsiteMemberRecord>();

      if (
        publicUsersRes.status === 'fulfilled' &&
        publicUsersRes.value &&
        Array.isArray(publicUsersRes.value.users)
      ) {
        for (const u of publicUsersRes.value.users) {
          if (!u || !u.uid) continue;
          map.set(u.uid, {
            memberId: u.uid,
            username: u.displayName || u.username || u.uid,
            avatar: u.avatar || '/img/pfp.png',
            elo: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            streak: 0,
            online: false,
            status: 'offline',
            lastSeen: Date.now(),
          });
        }
      }

      if (
        membersRes.status === 'fulfilled' &&
        membersRes.value &&
        Array.isArray(membersRes.value.members)
      ) {
        for (const m of membersRes.value.members) {
          if (!m || !m.memberId) continue;
          const prev = map.get(m.memberId);
          map.set(m.memberId, {
            ...m,
            username: prev?.username || m.username,
            avatar:
              prev?.avatar && prev.avatar !== '/img/pfp.png'
                ? prev.avatar
                : m.avatar || '/img/pfp.png',
          });
        }
      }

      if (map.size > 0) {
        setWebsiteMembers(Array.from(map.values()));
      }
    });
  }, []);

  // Connect to Real-Time WebSocket Server for Human-Only Online Mode & Website Member Sync
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          type: 'user:register',
          clientId: myClientId,
          memberId: myMemberId,
          username,
          elo: userElo,
          avatar: userPfp,
          wins: userRecord.wins,
          draws: userRecord.draws,
          losses: userRecord.losses,
          streak: userRecord.streak,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'presence:update') {
          setConnectedUsers(msg.users || []);
          if (Array.isArray(msg.members)) {
            setWebsiteMembers(msg.members);
          }
          setLiveHumanMatches(msg.liveMatches || []);
        } else if (msg.type === 'opponent:profile_updated') {
          if (msg.opponent) {
            setActiveOpponentName(msg.opponent.username || 'BSMS_Member');
            setActiveOpponentAvatar(msg.opponent.avatar || '/img/pfp.png');
            if (typeof msg.opponent.elo === 'number') {
              setActiveOpponentElo(msg.opponent.elo);
            }
          }
        } else if (msg.type === 'room:created') {
          setCreatedRoomCode(msg.roomId);
          setStatusBanner(
            `Room ${msg.roomId} created! Share this code with another website member to join.`
          );
        } else if (msg.type === 'room:error') {
          setStatusBanner(msg.message || 'Room error.');
          setTimeout(() => setStatusBanner(null), 4000);
        } else if (msg.type === 'challenge:received') {
          setIncomingChallenge({
            fromUser: msg.fromUser,
            mode: msg.mode || 'classic',
            mins: msg.mins || 10,
            inc: msg.inc || 0,
          });
          sound.playCheck();
        } else if (msg.type === 'match:started') {
          // Real Human vs Human Online Match Started with synced Website Member Name & PFP!
          setIsSearchingQueue(false);
          setCreatedRoomCode(null);
          setIncomingChallenge(null);
          setStatusBanner(null);

          const assignedColor: PieceColor = msg.color === 'b' ? 'b' : 'w';
          const modeToPlay: GameMode = msg.mode || 'classic';
          const minsToPlay: number = msg.mins || 10;
          const incToPlay: number = msg.inc || 0;

          setMatchModeType('online');
          setActiveRoomId(msg.roomId);
          setMyOnlineColor(assignedColor);
          setFlipped(assignedColor === 'b');
          setGameMode(modeToPlay);
          setCustomMinutes(minsToPlay);
          setIncrementSeconds(incToPlay);

          setBoard(createInitialBoard(modeToPlay));
          setTurn('w');
          setMoveHistory([]);
          setCapturedWhite([]);
          setCapturedBlack([]);
          setLastMove(null);
          setExternalMove(null);
          setGameStatus('playing');
          setWinner(null);
          setEloDelta(null);
          setWhiteTime(minsToPlay * 60);
          setBlackTime(minsToPlay * 60);

          setActiveOpponentName(msg.opponent?.username || 'BSMS Member');
          setActiveOpponentElo(msg.opponent?.elo ?? 0);
          setActiveOpponentAvatar(msg.opponent?.avatar || '/img/pfp.png');
          setActiveOpponentBadge(getTierFromElo(msg.opponent?.elo ?? 0));
          setBotQuote(null);

          sound.playGameStart();
        } else if (msg.type === 'game:opponent_move') {
          if (msg.move) {
            setExternalMove({
              from: msg.move.from,
              to: msg.move.to,
              piece: msg.move.piece,
              promotion: msg.move.promotion,
            });
          }
        } else if (msg.type === 'game:ended') {
          setGameStatus(msg.reason || 'resigned');
          setWinner(msg.winner);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [myClientId]);

  // Sync BSMS member account name, pfp, ELO, and W/D/L record to WebSocket & REST server
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user:update',
          memberId: myMemberId,
          username,
          avatar: userPfp,
          elo: userElo,
          wins: userRecord.wins,
          draws: userRecord.draws,
          losses: userRecord.losses,
          streak: userRecord.streak,
        })
      );
    }
  }, [myMemberId, username, userPfp, userElo, userRecord]);

  // Build the Global Leaderboard strictly from real BSMS Website Members (ZERO BOTS!)
  const leaderboard: ArenaLeaderboardEntry[] = React.useMemo(() => {
    const memberMap = new Map<string, WebsiteMemberRecord>();
    for (const m of websiteMembers) {
      memberMap.set(m.memberId, m);
    }
    // Always ensure the current logged-in BSMS member is represented with their latest synced name & pfp
    memberMap.set(myMemberId, {
      memberId: myMemberId,
      username,
      avatar: userPfp,
      elo: userElo,
      wins: userRecord.wins,
      draws: userRecord.draws,
      losses: userRecord.losses,
      streak: userRecord.streak,
      online: true,
      status: gameStatus === 'playing' ? 'in_game' : isSearchingQueue ? 'in_queue' : 'online',
      lastSeen: Date.now(),
    });

    const sorted = Array.from(memberMap.values()).sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.username.localeCompare(b.username);
    });

    return sorted.map((m, idx) => ({
      rank: idx + 1,
      memberId: m.memberId,
      name: m.username,
      elo: m.elo,
      wins: m.wins,
      draws: m.draws,
      losses: m.losses,
      streak: m.streak,
      badge: getTierFromElo(m.elo),
      avatar: m.avatar || '/img/pfp.png',
      online: m.online,
      isUser: m.memberId === myMemberId,
    }));
  }, [websiteMembers, myMemberId, username, userPfp, userElo, userRecord, gameStatus, isSearchingQueue]);

  // CRITICAL RULE: Bots NEVER give or lose your ELO!
  // ELO is ONLY enabled when playing Online vs a Real Website Member (`matchModeType === 'online'`) AND in Standard Mode (`gameMode === 'classic'`).
  const isRatedMatch = matchModeType === 'online' && gameMode === 'classic';
  const projectedWinElo = isRatedMatch
    ? calculateEloChange('win', userElo, activeOpponentElo)
    : 0;
  const projectedDrawElo = isRatedMatch
    ? calculateEloChange('draw', userElo, activeOpponentElo)
    : 0;
  const projectedLossElo = isRatedMatch
    ? calculateEloChange('loss', userElo, activeOpponentElo)
    : 0;

  // Handle uploading a custom Profile Picture (PFP) file
  const handlePfpFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPfpDraft(reader.result);
        setUserPfp(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Preview a Gamemode on the Board WITHOUT forcing an active game
  const selectModePreview = useCallback(
    (nextMode: GameMode) => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

      setIsEditingBoard(false);
      setGameMode(nextMode);
      setGameStatus('idle');
      setWinner(null);
      setEloDelta(null);
      setActiveRoomId(null);

      const previewBoard =
        nextMode === 'custom'
          ? cloneBoard(customStartingBoard)
          : createInitialBoard(nextMode);

      setBoard(previewBoard);
      setTurn('w');
      setMoveHistory([]);
      setCapturedWhite([]);
      setCapturedBlack([]);
      setLastMove(null);
      setExternalMove(null);
      setSpeedMultiplier(1);
      setPawnReinforcementsLeft(68);
      setCleaveCooldown(0);

      if (nextMode === 'alien_mode') {
        setAlienMoveRule('everywhere');
      }

      setWhiteTime(customMinutes * 60);
      setBlackTime(customMinutes * 60);
    },
    [customStartingBoard, customMinutes]
  );

  // Conclude Match & Apply ELO ONLY IF Online Human Match AND Standard Mode ('classic')
  // Bots NEVER give or deduct ELO!
  const concludeGame = useCallback(
    (
      reason: 'checkmate' | 'stalemate' | 'draw' | 'timeout' | 'resigned',
      winningColor: PieceColor | 'draw',
      notifyRemote: boolean = true
    ) => {
      if (gameStatus !== 'playing') return;
      setGameStatus(reason);
      setWinner(winningColor);

      if (
        notifyRemote &&
        matchModeType === 'online' &&
        activeRoomId &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        wsRef.current.send(
          JSON.stringify({
            type: 'game:end',
            roomId: activeRoomId,
            reason,
            winner: winningColor,
          })
        );
      }

      const myColor: PieceColor = matchModeType === 'online' ? myOnlineColor : 'w';
      const outcome: 'win' | 'draw' | 'loss' =
        winningColor === myColor
          ? 'win'
          : winningColor === 'draw'
          ? 'draw'
          : 'loss';

      // ONLY award/deduct ELO in Online Human matches in Standard Mode ('classic')!
      // Playing vs Bots NEVER changes your ELO or ranked W/D/L record!
      const rated = matchModeType === 'online' && gameMode === 'classic';
      const rawDelta = rated
        ? calculateEloChange(outcome, userElo, activeOpponentElo)
        : 0;
      const nextElo = rated ? Math.max(0, userElo + rawDelta) : userElo;
      const actualAppliedDelta = nextElo - userElo;

      if (outcome === 'win') {
        sound.playVictory();
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
        if (matchModeType === 'online') {
          setUserRecord((r) => ({
            ...r,
            wins: r.wins + 1,
            streak: r.streak + 1,
            bestElo: Math.max(r.bestElo, nextElo),
          }));
        }
      } else if (outcome === 'draw') {
        sound.playDefeat();
        if (matchModeType === 'online') {
          setUserRecord((r) => ({ ...r, draws: r.draws + 1, streak: 0 }));
        }
      } else {
        sound.playDefeat();
        if (matchModeType === 'online') {
          setUserRecord((r) => ({ ...r, losses: r.losses + 1, streak: 0 }));
        }
      }

      setEloDelta(rated ? actualAppliedDelta : null);
      if (rated) {
        setUserElo(nextElo);
      }

      const historyEntry: MatchHistoryItem = {
        id: `m-${Date.now()}`,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        opponentName: activeOpponentName,
        opponentElo: activeOpponentElo,
        opponentType: matchModeType,
        mode: gameMode,
        isRated: rated,
        result: outcome,
        eloDelta: actualAppliedDelta,
        newElo: nextElo,
        moves: Math.ceil(moveHistory.length / 2) || 1,
      };
      setMatchHistory((prev) => [historyEntry, ...prev.slice(0, 24)]);
    },
    [
      gameStatus,
      matchModeType,
      activeRoomId,
      myOnlineColor,
      gameMode,
      userElo,
      activeOpponentElo,
      activeOpponentName,
      moveHistory.length,
    ]
  );

  // Start a Bot Match (Play vs Famous AI Bot — Always Unrated 0 ELO)
  const startBotMatch = useCallback(
    (
      bot: FamousBotProfile = selectedBot,
      nextMode: GameMode = gameMode,
      customMinutesOverride?: number,
      customBoardOverride?: BoardGrid
    ) => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

      setIsEditingBoard(false);
      setIsSearchingQueue(false);
      setActiveRoomId(null);
      setMatchModeType('bot');
      setMyOnlineColor('w');
      setFlipped(false);
      setSelectedBot(bot);
      setGameMode(nextMode);

      const initialBoard =
        nextMode === 'custom'
          ? cloneBoard(customBoardOverride || customStartingBoard)
          : createInitialBoard(nextMode);

      setBoard(initialBoard);
      setTurn('w');
      setMoveHistory([]);
      setCapturedWhite([]);
      setCapturedBlack([]);
      setLastMove(null);
      setExternalMove(null);
      setGameStatus('playing');
      setWinner(null);
      setEloDelta(null);
      setSpeedMultiplier(1);
      setPawnReinforcementsLeft(68);
      setCleaveCooldown(0);

      if (nextMode === 'alien_mode') {
        setAlienMoveRule('everywhere');
      }

      const secs =
        customMinutesOverride !== undefined
          ? customMinutesOverride * 60
          : customMinutes * 60;
      setWhiteTime(secs);
      setBlackTime(secs);

      setActiveOpponentName(bot.name);
      setActiveOpponentElo(bot.elo);
      setActiveOpponentBadge(bot.title);
      setBotQuote(bot.introQuote);

      sound.playGameStart();
    },
    [selectedBot, gameMode, customStartingBoard, customMinutes]
  );

  // Real-time Clock Countdown (ONLY ticks when gameStatus === 'playing')
  useEffect(() => {
    if (gameStatus !== 'playing' || isEditingBoard) return;
    const timer = window.setInterval(() => {
      if (externalMove) return;
      const isAccel =
        gameMode === 'sudden_death_blitz' ||
        (gameMode === 'custom' && customAccelBlitz);
      const drain = isAccel ? speedMultiplier : 1;

      if (turn === 'w') {
        setWhiteTime((prev) => {
          if (prev <= drain) {
            concludeGame('timeout', 'b');
            return 0;
          }
          if (prev <= 10) sound.playTick();
          return Math.max(0, Math.round(prev - drain));
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= drain) {
            concludeGame('timeout', 'w');
            return 0;
          }
          return Math.max(0, Math.round(prev - drain));
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    gameStatus,
    turn,
    externalMove,
    gameMode,
    speedMultiplier,
    concludeGame,
    isEditingBoard,
    customAccelBlitz,
  ]);

  // Handle Royal Cleave Special Ability
  const handleSpecialAbility = (ability: 'cleave' | 'dash') => {
    if (ability !== 'cleave' || cleaveCooldown > 0 || turn !== 'w') return;
    if (gameStatus === 'idle' && matchModeType === 'bot') {
      setGameStatus('playing');
    } else if (gameStatus !== 'playing') {
      return;
    }

    const kingPos = findKing(board, 'w');
    if (!kingPos) return;

    const nextBoard = cloneBoard(board);
    let cleavedCount = 0;
    const newlyCaptured: Piece[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = kingPos.row + dr;
        const nc = kingPos.col + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = nextBoard[nr][nc];
          if (target && target.color === 'b' && target.type !== 'k') {
            newlyCaptured.push(target);
            nextBoard[nr][nc] = null;
            cleavedCount++;
          }
        }
      }
    }

    if (cleavedCount > 0) {
      sound.playAlienPower(true);
      setCapturedBlack((prev) => [...prev, ...newlyCaptured]);
      setBoard(nextBoard);
      setCleaveCooldown(3);
      setTurn('b');
    }
  };

  // Handle Completed Move from ChessBoard
  const handleBoardMove = useCallback(
    (move: Move, nextBoardInput: BoardGrid) => {
      setExternalMove(null);

      // If user makes their first move while in 'idle' Bot Preview mode, start the bot match!
      if (gameStatus === 'idle' && matchModeType === 'bot') {
        setGameStatus('playing');
      }

      // If in a real Online Match and this move was made by the local player, broadcast it over WebSocket!
      if (
        matchModeType === 'online' &&
        activeRoomId &&
        move.piece.color === myOnlineColor &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        wsRef.current.send(
          JSON.stringify({
            type: 'game:move',
            roomId: activeRoomId,
            move,
          })
        );
      }

      const nextBoard = cloneBoard(nextBoardInput);
      const movedColor = move.piece.color;
      const nextTurn: PieceColor = movedColor === 'w' ? 'b' : 'w';

      // Ensure move has Chess.com-style rating classification (Brilliant !!, Great !, Best ★, Blunder ??, etc.)
      if (!move.ratingInfo) {
        move.ratingInfo = classifyMove(
          board,
          nextBoard,
          move,
          moveHistory.length + 1,
          gameMode
        );
      }

      // Track captured pieces
      if (move.captured) {
        if (move.captured.color === 'w') {
          setCapturedWhite((prev) => [...prev, move.captured!]);
        } else {
          setCapturedBlack((prev) => [...prev, move.captured!]);
        }
      }

      // Update Famous Bot Speech Bubble Quips when playing vs Bot
      if (matchModeType === 'bot' && movedColor === 'b') {
        if (isKingInCheck(nextBoard, 'w') && selectedBot.checkQuotes.length > 0) {
          setBotQuote(
            selectedBot.checkQuotes[
              Math.floor(Math.random() * selectedBot.checkQuotes.length)
            ]
          );
        } else if (move.captured && selectedBot.captureQuotes.length > 0) {
          setBotQuote(
            selectedBot.captureQuotes[
              Math.floor(Math.random() * selectedBot.captureQuotes.length)
            ]
          );
        } else if (Math.random() < 0.65 && selectedBot.moveQuotes.length > 0) {
          setBotQuote(
            selectedBot.moveQuotes[
              Math.floor(Math.random() * selectedBot.moveQuotes.length)
            ]
          );
        }
      }

      if (movedColor === 'w' && cleaveCooldown > 0) {
        setCleaveCooldown((c) => Math.max(0, c - 1));
      }

      // In 1 King vs 100 Pawns mode, spawn pawn reinforcements on rank 1 when space opens
      if (
        gameMode === 'king_vs_100_pawns' &&
        movedColor === 'w' &&
        pawnReinforcementsLeft > 0
      ) {
        const emptyTopCols: number[] = [];
        for (let c = 0; c < 8; c++) {
          if (!nextBoard[1][c]) emptyTopCols.push(c);
        }
        if (emptyTopCols.length > 0) {
          const spawnCount = Math.min(
            emptyTopCols.length,
            Math.min(2, pawnReinforcementsLeft)
          );
          for (let i = 0; i < spawnCount; i++) {
            const col = emptyTopCols[i];
            nextBoard[1][col] = createPiece('p', 'b');
          }
          setPawnReinforcementsLeft((prev) => Math.max(0, prev - spawnCount));
        }
      }

      // Add time increment
      if (incrementSeconds > 0 && (gameStatus === 'playing' || gameStatus === 'idle')) {
        if (movedColor === 'w') setWhiteTime((t) => t + incrementSeconds);
        else setBlackTime((t) => t + incrementSeconds);
      }

      const updatedHistory = [...moveHistory, move];
      setBoard(nextBoard);
      setMoveHistory(updatedHistory);
      setLastMove(move);

      // Accelerate speed in Sudden Death Blitz
      if (
        (gameMode === 'sudden_death_blitz' ||
          (gameMode === 'custom' && customAccelBlitz)) &&
        updatedHistory.length % 5 === 0
      ) {
        setSpeedMultiplier((prev) => +(prev + 0.35).toFixed(2));
      }

      // Immediate Victory Check if King or sole Alien Sovereign was captured
      if (move.captured?.type === 'k' || !findKing(nextBoard, nextTurn)) {
        setTurn(nextTurn);
        setTimeout(() => concludeGame('checkmate', movedColor), 20);
        return;
      }

      // Check for checkmate / stalemate / elimination
      const nextLegalMoves = getAllLegalMoves(nextBoard, nextTurn, move, gameMode);
      const nextInCheck = isKingInCheck(nextBoard, nextTurn);

      if (nextInCheck) {
        sound.playCheck();
      }

      const blackPiecesRemaining = nextBoard
        .flat()
        .filter((p): p is Piece => p !== null && p.color === 'b').length;
      if (blackPiecesRemaining === 0) {
        setTurn(nextTurn);
        setTimeout(() => concludeGame('checkmate', 'w'), 20);
        return;
      }

      if (nextLegalMoves.length === 0) {
        setTurn(nextTurn);
        if (nextInCheck || gameMode !== 'classic') {
          setTimeout(() => concludeGame('checkmate', movedColor), 20);
        } else {
          setTimeout(() => concludeGame('stalemate', 'draw'), 20);
        }
        return;
      }

      setTurn(nextTurn);
    },
    [
      gameStatus,
      matchModeType,
      activeRoomId,
      myOnlineColor,
      selectedBot,
      cleaveCooldown,
      gameMode,
      pawnReinforcementsLeft,
      incrementSeconds,
      moveHistory,
      customAccelBlitz,
      concludeGame,
    ]
  );

  // Trigger AI Bot Move ONLY when matchModeType === 'bot' and gameStatus === 'playing'
  // (NEVER runs in Online Mode!)
  useEffect(() => {
    if (
      gameStatus !== 'playing' ||
      matchModeType !== 'bot' ||
      isEditingBoard
    )
      return;
    if (turn === 'b' && !externalMove) {
      const delay = gameMode === 'sudden_death_blitz' ? 300 : 450;
      aiTimeoutRef.current = window.setTimeout(() => {
        const chosen = getAIMove(
          board,
          'b',
          selectedBot.engineDifficulty,
          lastMove,
          gameMode,
          moveHistory
        );
        if (!chosen) {
          const inChk = isKingInCheck(board, 'b');
          concludeGame(inChk ? 'checkmate' : 'stalemate', inChk ? 'w' : 'draw');
          return;
        }
        const movingPiece = board[chosen.from.row][chosen.from.col];
        if (!movingPiece) return;

        const isPromo = movingPiece.type === 'p' && chosen.to.row === 7;
        setExternalMove({
          from: chosen.from,
          to: chosen.to,
          piece: movingPiece,
          promotion: isPromo ? 'q' : undefined,
        });
      }, delay);
    }
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [
    turn,
    gameStatus,
    matchModeType,
    externalMove,
    board,
    gameMode,
    selectedBot,
    lastMove,
    moveHistory,
    concludeGame,
    isEditingBoard,
  ]);

  // Handle Custom Board Painting
  const handleEditorSquareClick = (row: number, col: number) => {
    setBoard((prev: BoardGrid) => {
      const next = cloneBoard(prev);
      if (selectedBrush.type === 'eraser') {
        next[row][col] = null;
      } else {
        next[row][col] = createPiece(selectedBrush.type, selectedBrush.color);
      }
      setCustomStartingBoard(next);
      return next;
    });
  };

  // Online Matchmaking Actions (Strictly Human BSMS Website Members)
  const handleJoinMatchmakingQueue = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isSearchingQueue) {
      wsRef.current.send(JSON.stringify({ type: 'queue:leave' }));
      setIsSearchingQueue(false);
      return;
    }
    setIsSearchingQueue(true);
    wsRef.current.send(
      JSON.stringify({
        type: 'queue:join',
        mode: gameMode,
        mins: customMinutes,
        inc: incrementSeconds,
      })
    );
  };

  const handleCreatePrivateRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'room:create',
        mode: gameMode,
        mins: customMinutes,
        inc: incrementSeconds,
      })
    );
  };

  const handleJoinRoomByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinRoomInput.trim().toUpperCase();
    if (!code || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'room:join',
        roomId: code,
      })
    );
    setJoinRoomInput('');
  };

  const handleChallengeConnectedHuman = (user: ConnectedHumanUser) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'challenge:send',
        targetClientId: user.clientId,
        mode: gameMode,
        mins: customMinutes,
        inc: incrementSeconds,
      })
    );
    setStatusBanner(`Challenge sent to member ${user.username}! Waiting for response...`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleAcceptChallenge = () => {
    if (
      !incomingChallenge ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    )
      return;
    wsRef.current.send(
      JSON.stringify({
        type: 'challenge:accept',
        challengerClientId: incomingChallenge.fromUser.clientId,
        mode: incomingChallenge.mode,
        mins: incomingChallenge.mins,
        inc: incomingChallenge.inc,
      })
    );
    setIncomingChallenge(null);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.setMuted(!next);
    if (next) sound.playMove();
  };

  const inCheckColor: PieceColor | null = isKingInCheck(board, 'w')
    ? 'w'
    : isKingInCheck(board, 'b')
    ? 'b'
    : null;

  // Group move history into pairs for Chess.com style move table
  const movePairs: { moveNumber: number; white?: Move; black?: Move }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  const otherConnectedHumans = connectedUsers.filter(
    (u) => u.clientId !== myClientId
  );

  const filteredBots =
    botCategoryFilter === 'All'
      ? FAMOUS_BOTS
      : FAMOUS_BOTS.filter((b) => b.category === botCategoryFilter);

  const userTier = getTierFromElo(userElo);

  // Detect what chess opening happened in the current game
  const detectedOpening = React.useMemo(
    () => detectOpening(moveHistory, gameMode),
    [moveHistory, gameMode]
  );

  // Tally move ratings for the local player across current match
  const myRatedColor: PieceColor = matchModeType === 'online' ? myOnlineColor : 'w';
  const myMoveRatingsCount: Record<MoveRating, number> = {
    brilliant: 0,
    great: 0,
    best: 0,
    book: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  for (const m of moveHistory) {
    if (m.piece.color === myRatedColor && m.ratingInfo) {
      myMoveRatingsCount[m.ratingInfo.rating]++;
    }
  }

  return (
    <div className="min-h-screen bg-[#302e2b] text-[#dbd9d6] flex flex-col md:flex-row selection:bg-[#81b64c] selection:text-white font-sans">
      {/* LEFT CHESS.COM VERTICAL SIDEBAR (#161512) */}
      <aside className="w-full md:w-[225px] lg:w-[245px] bg-[#161512] border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between shrink-0 z-30">
        <div>
          {/* Chess.com Brand Header */}
          <div className="px-4 py-4 flex items-center justify-between md:justify-start gap-2.5 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <img
                src="/img/icon.png"
                alt="BSMS Chess"
                className="w-8 h-8 rounded-lg object-cover border border-[#81b64c]/60 shadow-sm"
              />
              <div>
                <div className="text-base font-black tracking-tight text-white flex items-center">
                  BSMS<span className="text-[#81b64c]">Chess</span>
                  <span className="text-[10px] text-zinc-400 font-normal ml-0.5">.com</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-semibold -mt-0.5">
                  Member-Synced Arena
                </div>
              </div>
            </div>

            {/* Mobile ELO & Sound */}
            <div className="flex md:hidden items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#262522] text-xs font-mono font-bold text-[#81b64c]">
                {userElo} ELO
              </span>
              <button
                onClick={toggleSound}
                className="p-1.5 rounded bg-[#262522] text-zinc-300"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#81b64c]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-zinc-500" />
                )}
              </button>
            </div>
          </div>

          {/* Primary Navigation Menu — Strict Separation of Play Bots vs Play Online */}
          <nav className="p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {[
              {
                id: 'bots' as NavSection,
                label: 'Play Bots (AI)',
                icon: Bot,
                badge: 'UNRATED',
              },
              {
                id: 'online' as NavSection,
                label: 'Play Online',
                icon: Globe,
                badge: 'MEMBERS',
              },
              {
                id: 'custom' as NavSection,
                label: 'Custom Studio',
                icon: Wrench,
              },
              {
                id: 'friends' as NavSection,
                label: 'Website Members',
                icon: Users,
                count: leaderboard.length,
              },
              {
                id: 'leaderboard' as NavSection,
                label: 'Leaderboard',
                icon: Trophy,
              },
            ].map((item) => {
              const Icon = item.icon;
              const active = navSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setNavSection(item.id);
                    if (item.id !== 'custom') setIsEditingBoard(false);
                    if (item.id === 'bots' && gameStatus === 'idle') {
                      setMatchModeType('bot');
                      setActiveOpponentName(selectedBot.name);
                      setActiveOpponentElo(selectedBot.elo);
                      setActiveOpponentBadge(selectedBot.title);
                      setBotQuote(selectedBot.introQuote);
                    } else if (item.id === 'online' && gameStatus === 'idle') {
                      setMatchModeType('online');
                      setActiveOpponentName('Waiting for Member...');
                      setActiveOpponentElo(userElo);
                      setActiveOpponentAvatar('/img/pfp.png');
                      setActiveOpponentBadge('MEMBER');
                      setBotQuote(null);
                    }
                  }}
                  className={`px-3 py-2.5 rounded-lg flex items-center justify-between gap-2.5 text-xs font-bold transition-all shrink-0 ${
                    active
                      ? 'bg-[#262522] text-white border-l-4 border-[#81b64c] shadow-sm'
                      : 'text-zinc-400 hover:bg-[#21201d] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        active ? 'text-[#81b64c]' : 'text-zinc-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-[#81b64c]/20 text-[#81b64c]">
                      {item.badge}
                    </span>
                  )}
                  {item.count !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 text-zinc-300">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Board Theme Picker */}
          <div className="hidden md:block px-4 py-3 mt-1 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 mb-2">
              <Palette className="w-3.5 h-3.5 text-[#81b64c]" />
              <span>Board Theme</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'green', label: 'Green', color: 'bg-[#739552]' },
                  { id: 'wood', label: 'Wood', color: 'bg-[#b58863]' },
                  { id: 'icy', label: 'Icy', color: 'bg-[#4b7399]' },
                  { id: 'crimson', label: 'BSMS', color: 'bg-[#8b1e2f]' },
                ] as { id: 'green' | 'wood' | 'icy' | 'crimson'; label: string; color: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setBoardTheme(t.id)}
                  className={`p-1.5 rounded border text-center transition-all ${
                    boardTheme === t.id
                      ? 'border-[#81b64c] bg-[#262522] text-white'
                      : 'border-white/10 bg-[#1c1b18] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className={`w-full h-3 rounded-xs ${t.color} mb-1`} />
                  <span className="text-[9px] font-bold block">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configurable Board Size Control */}
          <div className="hidden md:block px-4 py-3 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-[#81b64c]" />
                <span>Board Size</span>
              </span>
              <span className="font-mono text-[10px] text-[#81b64c]">{boardSizePx}px</span>
            </div>
            <input
              type="range"
              min={340}
              max={680}
              step={10}
              value={boardSizePx}
              onChange={(e) => setBoardSizePx(Number(e.target.value))}
              className="w-full accent-[#81b64c] h-1.5 bg-[#262522] rounded-lg cursor-pointer"
            />
            <div className="grid grid-cols-4 gap-1">
              {BOARD_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setBoardSizePx(preset.px)}
                  className={`py-1 rounded text-[9px] font-bold border transition-all ${
                    Math.abs(boardSizePx - preset.px) < 20
                      ? 'bg-[#81b64c] text-white border-[#81b64c]'
                      : 'bg-[#1c1b18] text-zinc-400 border-white/5 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom BSMS Website Member Account & PFP Sync Card */}
        <div className="hidden md:flex flex-col gap-2.5 p-3.5 bg-[#12110e] border-t border-white/5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            <span className="flex items-center gap-1 text-[#81b64c]">
              <RefreshCw className="w-3 h-3" /> BSMS Member Synced
            </span>
            <button
              onClick={() => {
                setNameDraft(username);
                setPfpDraft(userPfp);
                setIsEditingProfile((v) => !v);
              }}
              className="text-zinc-400 hover:text-white flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" />
              <span>{isEditingProfile ? 'Close' : 'Edit Profile'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative group shrink-0">
                <img
                  src={userPfp}
                  alt={username}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/img/pfp.png';
                  }}
                  className="w-10 h-10 rounded-md object-cover border border-[#81b64c]/60"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-md flex items-center justify-center transition-opacity"
                  title="Change BSMS Profile Picture (PFP)"
                >
                  <Camera className="w-4 h-4 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePfpFileUpload}
                  className="hidden"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{username}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-mono font-bold text-[#81b64c]">
                    {userElo} ELO
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-bold">
                    {userTier}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={toggleSound}
              className="p-2 rounded-lg bg-[#21201d] hover:bg-[#2b2926] text-zinc-300 transition-colors"
              title={soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#81b64c]" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-500" />
              )}
            </button>
          </div>

          {/* Inline BSMS Account Name & PFP Editor */}
          {isEditingProfile && (
            <div className="p-2.5 rounded-lg bg-[#1c1b18] border border-white/10 space-y-2 text-xs">
              <div>
                <label className="text-[10px] text-zinc-400 font-bold block mb-1">
                  BSMS Account Name
                </label>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Your BSMS Username"
                  className="w-full px-2 py-1 rounded bg-[#12110e] border border-white/10 text-xs text-white focus:outline-none focus:border-[#81b64c]"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 font-bold block mb-1">
                  Profile Picture (PFP) URL or Upload
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={pfpDraft}
                    onChange={(e) => setPfpDraft(e.target.value)}
                    placeholder="https://... or /img/pfp.png"
                    className="flex-1 px-2 py-1 rounded bg-[#12110e] border border-white/10 text-[11px] text-white focus:outline-none focus:border-[#81b64c]"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-1 rounded bg-[#262522] hover:bg-[#33312e] text-zinc-200 flex items-center gap-1 text-[10px] font-bold shrink-0"
                    title="Upload custom PFP image"
                  >
                    <Upload className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {PRESET_PFPS.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      onClick={() => setPfpDraft(p.url)}
                      className={`p-0.5 rounded border ${
                        pfpDraft === p.url ? 'border-[#81b64c]' : 'border-white/10'
                      }`}
                      title={p.label}
                    >
                      <img src={p.url} alt={p.label} className="w-6 h-6 rounded object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const cleanName = nameDraft.trim() || 'BSMS_Member';
                  const cleanPfp = pfpDraft.trim() || '/img/pfp.png';
                  setUsername(cleanName);
                  setUserPfp(cleanPfp);
                  setIsEditingProfile(false);
                }}
                className="w-full py-1.5 rounded bg-[#81b64c] hover:bg-[#95bb4a] text-white font-bold text-xs flex items-center justify-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Sync Account to Chess &amp; Leaderboard
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-white/5 text-center font-mono text-[10px]">
            <div className="bg-[#1b1a17] py-1 rounded">
              <span className="text-emerald-400 font-bold">{userRecord.wins}W</span>
            </div>
            <div className="bg-[#1b1a17] py-1 rounded">
              <span className="text-amber-400 font-bold">{userRecord.draws}D</span>
            </div>
            <div className="bg-[#1b1a17] py-1 rounded">
              <span className="text-rose-400 font-bold">{userRecord.losses}L</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CHESS.COM WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BSMS WEBSITE REDIRECT BAR (Home, Chat, Games, Countdown, Chess) */}
        <header className="w-full bg-[#161512] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-20 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 hidden sm:inline">
              BSMS Portal
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {(
                [
                  {
                    id: 'home',
                    label: 'Home',
                    path: '/',
                    icon: Home,
                    isCurrent: false,
                  },
                  {
                    id: 'chat',
                    label: 'Chat',
                    path: '/chat',
                    icon: MessageSquare,
                    isCurrent: false,
                  },
                  {
                    id: 'games',
                    label: 'Games',
                    path: '/g',
                    icon: Gamepad2,
                    isCurrent: false,
                  },
                  {
                    id: 'countdown',
                    label: 'Countdown',
                    path: '/countdown',
                    icon: Timer,
                    isCurrent: false,
                  },
                  {
                    id: 'users',
                    label: 'Users',
                    path: '/users',
                    icon: Users,
                    isCurrent: false,
                  },
                  {
                    id: 'chess',
                    label: 'Chess',
                    path: '/chess.html',
                    icon: Crown,
                    isCurrent: true,
                  },
                ] as const
              ).map((navItem) => {
                const NavIcon = navItem.icon;
                const resolveTargetUrl = (path: string) => {
                  if (typeof window === 'undefined') return path;
                  const params = new URLSearchParams(window.location.search);
                  const baseOrigin =
                    params.get('site_url') ||
                    params.get('origin') ||
                    localStorage.getItem('bsms_site_origin') ||
                    '';
                  if (baseOrigin) {
                    return `${baseOrigin.replace(/\/+$/, '')}${path}`;
                  }
                  return path;
                };
                const targetUrl = resolveTargetUrl(navItem.path);

                return (
                  <a
                    key={navItem.id}
                    href={targetUrl}
                    target="_top"
                    onClick={(e) => {
                      if (navItem.isCurrent) {
                        e.preventDefault();
                        setShowWebsiteBanners((v) => !v);
                        return;
                      }
                      e.preventDefault();
                      try {
                        if (window.parent && window.parent !== window) {
                          window.parent.postMessage(
                            {
                              type: 'BSMS_NAVIGATE',
                              destination: navItem.id,
                              path: navItem.path,
                            },
                            '*'
                          );
                        }
                        if (window.top) {
                          window.top.location.href = targetUrl;
                          return;
                        }
                      } catch {
                        // Fallback if cross-origin top navigation is restricted
                      }
                      window.location.href = targetUrl;
                    }}
                    className={`group px-3.5 py-1.5 rounded-lg border text-xs font-extrabold tracking-wide flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                      navItem.isCurrent
                        ? 'bg-[#81b64c] text-white border-[#81b64c] shadow-[0_2px_10px_rgba(129,182,76,0.35)]'
                        : 'bg-[#262522] hover:bg-[#81b64c] text-zinc-200 hover:text-white border-white/10 hover:border-[#81b64c]'
                    }`}
                  >
                    <NavIcon
                      className={`w-3.5 h-3.5 transition-colors ${
                        navItem.isCurrent
                          ? 'text-white'
                          : 'text-[#81b64c] group-hover:text-white'
                      }`}
                    />
                    <span>{navItem.label}</span>
                    {navItem.isCurrent && (
                      <span className="px-1.5 py-0.2 rounded bg-black/25 text-[9px] font-black uppercase tracking-wider">
                        ACTIVE
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowWebsiteBanners((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-[#262522] hover:bg-[#33312e] border border-white/10 text-[11px] font-bold text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <span>Website Hub Banners</span>
              {showWebsiteBanners ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#81b64c]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#81b64c]" />
              )}
            </button>
            <div className="hidden lg:flex items-center gap-2 text-[11px] text-zinc-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#81b64c]" />
              <span>
                Playing as <strong className="text-white">{username}</strong> ({userElo} ELO)
              </span>
            </div>
          </div>
        </header>

        {/* BSMS WEBSITE FEATURED CHESS BANNER & PORTAL CARDS (Chat, Games, Countdown, Chess) */}
        {showWebsiteBanners && (
          <section className="w-full bg-[#1b1a17] border-b border-white/10 px-3 sm:px-6 py-3.5">
            <div className="max-w-[1440px] mx-auto space-y-3">
              {/* Featured BSMS Chess Hero Banner */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1f2f16] via-[#252320] to-[#3a1520] border border-[#81b64c]/40 p-4 sm:px-6 sm:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#161512] border-2 border-[#81b64c] flex items-center justify-center shadow-lg shrink-0 relative">
                    <Crown className="w-8 h-8 text-[#81b64c]" />
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full bg-[#1baca6] text-[9px] font-black text-white border border-white">
                      !!
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-[#81b64c] text-white text-[10px] font-black uppercase tracking-wider">
                        BSMS Website Featured Banner
                      </span>
                      <span className="text-xs font-mono text-emerald-300 font-bold">
                        ● {connectedUsers.length || 1} Member{connectedUsers.length === 1 ? '' : 's'} Active
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                      BSMS Chess Arena — Online Ranked ELO, Move Ratings &amp; Alien Overlord
                    </h2>
                    <p className="text-xs text-zinc-300 max-w-2xl">
                      Challenge real BSMS website members for Rated Standard ELO, battle Famous Personalities (Magnus, Hikaru, GothamChess, MrBeast), and unlock live <strong>Brilliant (!!)</strong> &amp; <strong>Blunder (??)</strong> move ratings.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setNavSection('online');
                      setMatchModeType('online');
                    }}
                    className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-[#81b64c] hover:bg-[#95bb4a] text-white font-black text-xs uppercase tracking-wider shadow-[0_3px_0_#537133] active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Globe className="w-4 h-4" /> Play Online Ranked
                  </button>
                  <button
                    onClick={() => {
                      setNavSection('bots');
                      setMatchModeType('bot');
                    }}
                    className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-[#262522] hover:bg-[#33312e] text-white border border-white/15 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Bot className="w-4 h-4 text-amber-400" /> Fight Famous Bots
                  </button>
                </div>
              </div>

              {/* BSMS Website Section Banners Row: Chat, Games, Countdown, and Chess */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {[
                  {
                    id: 'chat',
                    title: 'BSMS Chat',
                    subtitle: 'Live member messaging & rooms',
                    badge: 'COMMUNITY',
                    path: '/chat',
                    icon: MessageSquare,
                    gradient: 'from-sky-900/50 to-[#21201d] border-sky-500/30 hover:border-sky-400',
                    iconColor: 'text-sky-400',
                    btnLabel: 'Open Chat',
                    isCurrent: false,
                  },
                  {
                    id: 'games',
                    title: 'BSMS Games',
                    subtitle: 'Arcade hub & member leaderboards',
                    badge: 'ARCADE',
                    path: '/g',
                    icon: Gamepad2,
                    gradient: 'from-purple-900/50 to-[#21201d] border-purple-500/30 hover:border-purple-400',
                    iconColor: 'text-purple-400',
                    btnLabel: 'Open Games',
                    isCurrent: false,
                  },
                  {
                    id: 'countdown',
                    title: 'BSMS Countdown',
                    subtitle: 'Live school & event timers',
                    badge: 'EVENTS',
                    path: '/countdown',
                    icon: Timer,
                    gradient: 'from-amber-900/50 to-[#21201d] border-amber-500/30 hover:border-amber-400',
                    iconColor: 'text-amber-400',
                    btnLabel: 'View Countdown',
                    isCurrent: false,
                  },
                  {
                    id: 'chess',
                    title: 'BSMS Chess',
                    subtitle: 'Rated member matches, Bots & Move Ratings',
                    badge: 'FEATURED',
                    path: '/chess.html',
                    icon: Crown,
                    gradient: 'from-[#81b64c]/30 to-[#21201d] border-[#81b64c] ring-1 ring-[#81b64c]/40',
                    iconColor: 'text-[#81b64c]',
                    btnLabel: 'Play Chess Now',
                    isCurrent: true,
                  },
                ].map((card) => {
                  const CardIcon = card.icon;
                  const params =
                    typeof window !== 'undefined'
                      ? new URLSearchParams(window.location.search)
                      : null;
                  const baseOrigin =
                    params?.get('site_url') ||
                    params?.get('origin') ||
                    (typeof window !== 'undefined'
                      ? localStorage.getItem('bsms_site_origin')
                      : '') ||
                    '';
                  const targetUrl = baseOrigin
                    ? `${baseOrigin.replace(/\/+$/, '')}${card.path}`
                    : card.path;

                  return (
                    <a
                      key={card.id}
                      href={targetUrl}
                      target="_top"
                      onClick={(e) => {
                        e.preventDefault();
                        if (card.isCurrent) {
                          startBotMatch(selectedBot, gameMode);
                          return;
                        }
                        try {
                          if (window.parent && window.parent !== window) {
                            window.parent.postMessage(
                              {
                                type: 'BSMS_NAVIGATE',
                                destination: card.id,
                                path: card.path,
                              },
                              '*'
                            );
                          }
                          if (window.top) {
                            window.top.location.href = targetUrl;
                            return;
                          }
                        } catch {
                          // fallback
                        }
                        window.location.href = targetUrl;
                      }}
                      className={`p-3 rounded-xl bg-gradient-to-br ${card.gradient} border flex items-center justify-between gap-2.5 transition-all shadow-md group cursor-pointer`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[#161512] border border-white/10 flex items-center justify-center shrink-0">
                          <CardIcon className={`w-4 h-4 ${card.iconColor}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-white truncate">
                              {card.title}
                            </span>
                            <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-black/40 text-zinc-300">
                              {card.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {card.subtitle}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold shrink-0 transition-colors ${
                          card.isCurrent
                            ? 'bg-[#81b64c] text-white'
                            : 'bg-[#161512] text-zinc-300 group-hover:bg-white group-hover:text-zinc-900'
                        }`}
                      >
                        {card.btnLabel}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Status / Room Notification Banner */}
        {statusBanner && (
          <div className="bg-[#81b64c] text-white px-4 py-2 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-md">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>{statusBanner}</span>
          </div>
        )}

        {/* Incoming Human Challenge Banner */}
        {incomingChallenge && (
          <div className="bg-amber-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-lg">
            <div className="text-xs font-bold flex items-center gap-2">
              <img
                src={incomingChallenge.fromUser.avatar || '/img/pfp.png'}
                alt={incomingChallenge.fromUser.username}
                className="w-6 h-6 rounded object-cover border border-white/40"
              />
              <span>
                Website member <strong>{incomingChallenge.fromUser.username}</strong> (
                {incomingChallenge.fromUser.elo} ELO) challenged you to{' '}
                {MODE_INFO[incomingChallenge.mode].title} ({incomingChallenge.mins}|
                {incomingChallenge.inc})!
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleAcceptChallenge}
                className="px-3 py-1 rounded bg-white text-zinc-900 font-black text-xs hover:bg-zinc-100"
              >
                Accept Match
              </button>
              <button
                onClick={() => setIncomingChallenge(null)}
                className="px-2.5 py-1 rounded bg-black/30 text-white text-xs font-semibold"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-2 flex flex-col lg:flex-row gap-4 items-center lg:items-start justify-center">
          {/* CENTER: CONFIGURABLE CHESSBOARD & PLAYER BARS */}
          <div
            className="w-full flex flex-col items-center transition-all duration-150"
            style={{ maxWidth: `${boardSizePx}px` }}
          >
            {/* Top Status & Quick Board Size Strip Above Player Bar */}
            <div className="w-full mb-1.5 flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1 rounded-lg bg-[#262522] border border-white/10 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-gradient-to-r ${MODE_INFO[gameMode].accent} text-white`}
                >
                  {isRatedMatch ? 'RATED ONLINE ELO' : 'UNRATED (0 ELO)'}
                </span>
                <span className="font-bold text-white truncate">
                  {gameMode === 'custom' ? customDraftName : MODE_INFO[gameMode].title}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Quick Board Size Buttons */}
                <div className="flex items-center gap-1 bg-[#1c1b18] px-1.5 py-0.5 rounded border border-white/5">
                  <Maximize2 className="w-3 h-3 text-zinc-400 mr-0.5" />
                  {[
                    { label: 'XS', px: 380 },
                    { label: 'S', px: 440 },
                    { label: 'M', px: 500 },
                    { label: 'L', px: 580 },
                  ].map((sz) => (
                    <button
                      key={sz.label}
                      onClick={() => setBoardSizePx(sz.px)}
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold transition-colors ${
                        Math.abs(boardSizePx - sz.px) < 25
                          ? 'bg-[#81b64c] text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title={`Set board size to ${sz.px}px`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
                {inCheckColor && gameStatus === 'playing' && (
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold animate-pulse flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> CHECK
                  </span>
                )}
              </div>
            </div>

            {/* ChessBoard Component */}
            <div className="relative w-full flex justify-center">
              <ChessBoard
                board={board}
                turn={turn}
                mode={gameMode}
                alienMoveRule={gameMode === 'alien_mode' ? 'everywhere' : alienMoveRule}
                inCheck={inCheckColor}
                lastMove={lastMove}
                flipped={flipped}
                interactive={
                  matchModeType === 'bot'
                    ? (gameStatus === 'playing' || gameStatus === 'idle') && turn === 'w'
                    : gameStatus === 'playing' && turn === myOnlineColor
                }
                onMove={handleBoardMove}
                onSpecialAbility={handleSpecialAbility}
                canCleave={
                  gameMode === 'king_vs_100_pawns' ||
                  (gameMode === 'custom' && customRoyalCleave)
                }
                cleaveCooldown={cleaveCooldown}
                capturedWhite={capturedWhite}
                capturedBlack={capturedBlack}
                externalMove={externalMove}
                onExternalMoveComplete={() => setExternalMove(null)}
                whitePlayerName={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? activeOpponentName
                    : username
                }
                whitePlayerElo={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? activeOpponentElo
                    : userElo
                }
                whitePlayerAvatar={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? activeOpponentAvatar
                    : userPfp
                }
                whitePlayerBadge={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? activeOpponentBadge
                    : userTier
                }
                blackPlayerName={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? username
                    : activeOpponentName
                }
                blackPlayerElo={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? userElo
                    : activeOpponentElo
                }
                blackPlayerAvatar={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? userPfp
                    : activeOpponentAvatar
                }
                blackPlayerBadge={
                  matchModeType === 'online' && myOnlineColor === 'b'
                    ? userTier
                    : activeOpponentBadge
                }
                botAvatarText={
                  matchModeType === 'bot' ? selectedBot.avatarText : undefined
                }
                botAccentColor={
                  matchModeType === 'bot' ? selectedBot.accentColor : undefined
                }
                botQuote={matchModeType === 'bot' ? botQuote : null}
                isAiOpponent={matchModeType === 'bot'}
                isGameActive={gameStatus === 'playing'}
                boardTheme={boardTheme}
                boardSizePx={boardSizePx}
                whiteTime={whiteTime}
                blackTime={blackTime}
                isUnlimitedTime={customMinutes < 0}
                isEditingBoard={isEditingBoard}
                onEditorSquareClick={handleEditorSquareClick}
                moveCount={moveHistory.length}
              />

              {/* End-of-Game Chess.com Result Modal Overlay */}
              {gameStatus !== 'idle' &&
                gameStatus !== 'playing' &&
                !isEditingBoard && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-xs rounded-lg p-4">
                    <div className="bg-[#262522] border border-white/15 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      <div
                        className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
                          winner === (matchModeType === 'online' ? myOnlineColor : 'w')
                            ? 'bg-[#81b64c]'
                            : winner === 'draw'
                            ? 'bg-amber-600'
                            : 'bg-rose-700'
                        }`}
                      >
                        <Crown className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
                          {gameStatus}
                        </div>
                        <h3 className="text-2xl font-black text-white mt-0.5">
                          {winner === (matchModeType === 'online' ? myOnlineColor : 'w')
                            ? 'You Won!'
                            : winner === 'draw'
                            ? 'Match Drawn'
                            : `${activeOpponentName} Won`}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          {isRatedMatch
                            ? winner === (matchModeType === 'online' ? myOnlineColor : 'w')
                              ? `Rated Online Standard Victory against ${activeOpponentName}!`
                              : winner === 'draw'
                              ? 'Draws deduct a small -6 ELO penalty in Online Standard Ranked.'
                              : 'Losses deduct ELO in Online Standard Ranked (minimum floor 0 ELO).'
                            : matchModeType === 'bot'
                            ? 'Bot Match Complete — Playing vs Bots never gives or loses your ELO!'
                            : 'Unrated Variant Match — Only Online Standard Chess affects ELO.'}
                        </p>
                      </div>

                      {/* Chess.com Game Review Move Ratings Summary in End-of-Game Modal */}
                      <div className="p-2.5 rounded-xl bg-[#1c1b18] border border-white/10 space-y-1.5">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center justify-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#1baca6]" /> Your Game Review Move Ratings
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                          {(
                            [
                              'brilliant',
                              'great',
                              'best',
                              'good',
                              'book',
                              'inaccuracy',
                              'mistake',
                              'blunder',
                            ] as MoveRating[]
                          ).map((rKey) => {
                            const meta = MOVE_RATING_META[rKey];
                            const count = myMoveRatingsCount[rKey];
                            return (
                              <div
                                key={rKey}
                                className="px-1.5 py-1 rounded bg-[#161512] flex items-center justify-between"
                              >
                                <span
                                  className="font-black"
                                  style={{ color: meta.color }}
                                >
                                  {meta.symbol}
                                </span>
                                <span className="font-bold text-white">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {isRatedMatch && eloDelta !== null ? (
                        <div className="py-3 px-4 rounded-xl bg-[#1c1b18] border border-white/10 flex items-center justify-between">
                          <div className="text-left">
                            <span className="text-[11px] text-zinc-400 block">
                              Updated ELO Rating
                            </span>
                            <span className="text-xs font-bold text-[#81b64c]">
                              {userTier} Tier
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-mono font-black text-white">
                              {userElo}
                            </span>
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                eloDelta > 0
                                  ? 'bg-[#81b64c]/25 text-[#81b64c]'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {eloDelta > 0 ? `+${eloDelta}` : eloDelta}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-2.5 px-3 rounded-xl bg-[#1c1b18] border border-white/10 text-xs text-amber-300 font-semibold">
                          0 ELO Change • Play Online Standard vs Website Members for Rated ELO!
                        </div>
                      )}

                      <div className="flex gap-2">
                        {matchModeType === 'bot' && (
                          <button
                            onClick={() => startBotMatch(selectedBot, gameMode)}
                            className="flex-1 py-3 rounded-xl bg-[#81b64c] hover:bg-[#95bb4a] text-white font-black text-xs uppercase tracking-wider shadow-[0_4px_0_#537133] active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="w-4 h-4" /> Rematch {selectedBot.name}
                          </button>
                        )}
                        <button
                          onClick={() => selectModePreview(gameMode)}
                          className="flex-1 py-3 rounded-xl bg-[#383633] hover:bg-[#454340] text-zinc-200 font-bold text-xs transition-all"
                        >
                          Back to Lobby
                        </button>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* RIGHT: CHESS.COM SIDEBAR DOCK (#262522) */}
          <div className="w-full lg:w-[430px] xl:w-[450px] bg-[#262522] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col shrink-0">
            {/* Top Mode Tabs Inside Right Panel */}
            <div className="grid grid-cols-4 bg-[#1c1b18] border-b border-white/10">
              {[
                { id: 'bots' as NavSection, label: 'Play Bots', icon: Bot },
                { id: 'online' as NavSection, label: 'Online', icon: Globe },
                { id: 'friends' as NavSection, label: 'Members', icon: Users },
                { id: 'leaderboard' as NavSection, label: 'Rankings', icon: Trophy },
              ].map((t) => {
                const Icon = t.icon;
                const active = navSection === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setNavSection(t.id);
                      if (t.id !== 'custom') setIsEditingBoard(false);
                      if (t.id === 'bots' && gameStatus === 'idle') {
                        setMatchModeType('bot');
                        setActiveOpponentName(selectedBot.name);
                        setActiveOpponentElo(selectedBot.elo);
                        setActiveOpponentBadge(selectedBot.title);
                        setBotQuote(selectedBot.introQuote);
                      } else if (t.id === 'online' && gameStatus === 'idle') {
                        setMatchModeType('online');
                        setActiveOpponentName('Waiting for Member...');
                        setActiveOpponentElo(userElo);
                        setActiveOpponentAvatar('/img/pfp.png');
                        setActiveOpponentBadge('MEMBER');
                        setBotQuote(null);
                      }
                    }}
                    className={`py-3 px-2 flex flex-col items-center justify-center gap-1 text-[11px] font-bold border-b-2 transition-all ${
                      active
                        ? 'bg-[#262522] text-white border-[#81b64c]'
                        : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-white/5'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        active ? 'text-[#81b64c]' : 'text-zinc-400'
                      }`}
                    />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* LIVE OPENING EXPLORER BOX AT THE SIDE — Shows What Opening Happened! */}
            <div className="mx-3.5 mt-3 p-3 rounded-xl bg-[#1c1b18] border border-[#81b64c]/35 shadow-inner space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-[#81b64c]/20 text-[#81b64c] font-mono text-[10px] font-black shrink-0 border border-[#81b64c]/40">
                    {detectedOpening.eco}
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 truncate">
                    Opening Played
                  </span>
                </div>
                {matchModeType === 'bot' && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold border border-amber-500/30 shrink-0">
                    🎲 Random Bot Book
                  </span>
                )}
              </div>

              <div className="text-xs font-black text-white leading-snug">
                {detectedOpening.name}
                {detectedOpening.variation && (
                  <span className="text-[#81b64c] font-bold">
                    {' '}• {detectedOpening.variation}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 leading-snug">
                {detectedOpening.description}
              </p>

              {detectedOpening.movesMatched.length > 0 && (
                <div className="pt-1 flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-zinc-300">
                  <span className="text-zinc-500 font-bold">Book Line:</span>
                  {detectedOpening.movesMatched.map((san, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-[#161512] border border-white/5 text-emerald-300"
                    >
                      {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ${san}` : san}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* TAB 1: PLAY BOTS (MAGNUS, HIKARU, GOTHAMCHESS, MRBEAST & OTHERS — UNRATED 0 ELO) */}
            {navSection === 'bots' && (
              <div className="p-4 space-y-3.5">
                {/* Selected Bot Featured Header Card */}
                <div className="p-3 rounded-xl bg-[#1c1b18] border border-white/10 flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${selectedBot.accentColor} flex items-center justify-center font-black text-base text-white shadow-md shrink-0`}
                  >
                    {selectedBot.avatarText}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black text-white truncate">
                        {selectedBot.name}
                      </h3>
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded border ${selectedBot.badgeColor}`}
                      >
                        {selectedBot.title}
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        ({selectedBot.elo})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                      {selectedBot.description}
                    </p>
                  </div>
                </div>

                {/* Bot Category Filter Pills */}
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {(
                    [
                      'All',
                      'Creators',
                      'Chess Personalities',
                      'Super Grandmasters',
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setBotCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-colors ${
                        botCategoryFilter === cat
                          ? 'bg-[#81b64c] text-white'
                          : 'bg-[#1c1b18] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Bot Roster Grid */}
                <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {filteredBots.map((bot) => {
                    const isSelected = selectedBot.id === bot.id;
                    return (
                      <button
                        key={bot.id}
                        onClick={() => {
                          setSelectedBot(bot);
                          setMatchModeType('bot');
                          setActiveOpponentName(bot.name);
                          setActiveOpponentElo(bot.elo);
                          setActiveOpponentBadge(bot.title);
                          setBotQuote(bot.introQuote);
                        }}
                        className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          isSelected
                            ? 'bg-[#33312e] border-[#81b64c] ring-1 ring-[#81b64c]/40 shadow-md'
                            : 'bg-[#1c1b18] border-white/5 hover:bg-[#2b2926]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${bot.accentColor} flex items-center justify-center font-black text-xs text-white shrink-0`}
                          >
                            {bot.avatarText}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white truncate">
                              {bot.name}
                            </div>
                            <div className="text-[10px] font-mono text-amber-400 font-bold">
                              {bot.elo} Bot
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Gamemode Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Select Mode
                    </span>
                    <button
                      onClick={() => setShowTimeSelector((s) => !s)}
                      className="text-[11px] font-bold text-[#81b64c] flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" /> {customMinutes}m+{incrementSeconds}s ▼
                    </button>
                  </div>

                  {showTimeSelector && (
                    <div className="mb-2 p-2.5 rounded-xl bg-[#1c1b18] border border-white/10 grid grid-cols-4 gap-1">
                      {TIME_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => {
                            setCustomMinutes(p.mins);
                            setIncrementSeconds(p.inc);
                            if (gameStatus === 'idle') {
                              setWhiteTime(p.mins * 60);
                              setBlackTime(p.mins * 60);
                            }
                            setShowTimeSelector(false);
                          }}
                          className={`py-1.5 rounded text-[11px] font-bold ${
                            customMinutes === p.mins && incrementSeconds === p.inc
                              ? 'bg-[#81b64c] text-white'
                              : 'bg-[#2b2926] text-zinc-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        'classic',
                        'alien_mode',
                        'king_vs_100_pawns',
                        'sudden_death_blitz',
                      ] as GameMode[]
                    ).map((m) => {
                      const info = MODE_INFO[m];
                      const active = gameMode === m;
                      return (
                        <button
                          key={m}
                          onClick={() => selectModePreview(m)}
                          className={`p-2 rounded-xl border text-left transition-all ${
                            active
                              ? 'bg-[#33312e] border-[#81b64c]'
                              : 'bg-[#1c1b18] border-white/5 hover:bg-[#2b2926]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {info.title}
                            </span>
                            <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              BOT PRACTICE
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bot ELO Policy Notice (Bots never give or lose ELO!) */}
                <div className="px-3 py-2 rounded-xl bg-[#1c1b18] border border-white/10 flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Bot ELO Policy:
                  </span>
                  <span className="text-[11px] font-bold text-amber-400">
                    Unrated (Bots give/lose 0 ELO)
                  </span>
                </div>

                {/* Big Green Chess.com Play Button (when idle) or Move Log & Controls (when playing) */}
                {gameStatus === 'idle' ? (
                  <button
                    onClick={() => startBotMatch(selectedBot, gameMode)}
                    className="w-full py-3.5 rounded-xl bg-[#81b64c] hover:bg-[#95bb4a] text-white font-black text-base tracking-wide shadow-[0_5px_0_#537133] active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>
                      Play vs {selectedBot.name} (Unrated)
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {/* Chess.com Game Review Live Move Ratings Strip */}
                    <div className="p-2.5 rounded-xl bg-[#1c1b18] border border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#1baca6]" /> Live Move Ratings
                        </span>
                        <span className="text-zinc-500">Your Moves</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                        {(
                          [
                            'brilliant',
                            'great',
                            'best',
                            'good',
                            'book',
                            'inaccuracy',
                            'mistake',
                            'blunder',
                          ] as MoveRating[]
                        ).map((rKey) => {
                          const meta = MOVE_RATING_META[rKey];
                          const count = myMoveRatingsCount[rKey];
                          return (
                            <div
                              key={rKey}
                              className="px-2 py-1 rounded bg-[#161512] border border-white/5 flex items-center justify-between"
                              title={meta.label}
                            >
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                                  style={{ backgroundColor: meta.color }}
                                >
                                  {meta.symbol}
                                </span>
                                <span className="text-[9px] text-zinc-400 truncate max-w-[42px]">
                                  {meta.label.split(' ')[0]}
                                </span>
                              </span>
                              <span className="font-bold text-white">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-[#1c1b18] border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-3.5 py-1.5 bg-[#161512] border-b border-white/5 flex items-center justify-between text-[11px] font-bold text-zinc-400">
                        <span>MOVES ({moveHistory.length})</span>
                        <span className="font-mono text-[#81b64c]">
                          {turn === 'w' ? 'Your turn' : `${selectedBot.name} thinking...`}
                        </span>
                      </div>
                      <div className="h-28 overflow-y-auto divide-y divide-white/5 text-xs font-mono">
                        {movePairs.map((pair) => (
                          <div
                            key={pair.moveNumber}
                            className="grid grid-cols-7 px-3.5 py-1 hover:bg-white/5 items-center"
                          >
                            <span className="col-span-1 text-zinc-500">
                              {pair.moveNumber}.
                            </span>
                            <span className="col-span-3 text-white font-semibold flex items-center gap-1.5">
                              <span>{pair.white?.san || ''}</span>
                              {pair.white?.ratingInfo && (
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-black text-white leading-tight"
                                  style={{ backgroundColor: pair.white.ratingInfo.color }}
                                  title={`${pair.white.ratingInfo.label}: ${pair.white.ratingInfo.reason}`}
                                >
                                  {pair.white.ratingInfo.symbol}
                                </span>
                              )}
                            </span>
                            <span className="col-span-3 text-zinc-400 flex items-center gap-1.5">
                              <span>{pair.black?.san || ''}</span>
                              {pair.black?.ratingInfo && (
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-black text-white leading-tight"
                                  style={{ backgroundColor: pair.black.ratingInfo.color }}
                                  title={`${pair.black.ratingInfo.label}: ${pair.black.ratingInfo.reason}`}
                                >
                                  {pair.black.ratingInfo.symbol}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => setFlipped((f) => !f)}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-[#454340] text-zinc-200 font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <FlipVertical className="w-3.5 h-3.5" /> Flip
                      </button>
                      <button
                        onClick={() => concludeGame('draw', 'draw')}
                        disabled={gameStatus !== 'playing'}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-amber-600/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Handshake className="w-3.5 h-3.5" /> Draw
                      </button>
                      <button
                        onClick={() => concludeGame('resigned', 'b')}
                        disabled={gameStatus !== 'playing'}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-rose-600/30 text-rose-400 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Flag className="w-3.5 h-3.5" /> Resign
                      </button>
                      <button
                        onClick={() => selectModePreview(gameMode)}
                        className="py-2 rounded-lg bg-[#81b64c] hover:bg-[#95bb4a] text-white font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Lobby
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: REAL ONLINE MULTIPLAYER SYNCED WITH BSMS WEBSITE MEMBERS */}
            {navSection === 'online' && (
              <div className="p-4 space-y-4">
                <div className="p-3.5 rounded-xl bg-[#1c1b18] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#81b64c]" />
                      <h3 className="text-sm font-bold text-white">
                        BSMS Website Member Online Lobby
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        wsConnected
                          ? 'bg-[#81b64c]/20 text-[#81b64c]'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {wsConnected
                        ? `● ${connectedUsers.length} Online Now`
                        : 'Connecting...'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Synced with BSMS website members. Playing <strong>Standard Chess</strong> here against real members is the <strong>ONLY</strong> way to gain or lose Ranked ELO!
                  </p>
                </div>

                {/* Online Mode & Rated ELO Stakes Selector */}
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      'classic',
                      'alien_mode',
                      'king_vs_100_pawns',
                      'sudden_death_blitz',
                    ] as GameMode[]
                  ).map((m) => {
                    const info = MODE_INFO[m];
                    const active = gameMode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => selectModePreview(m)}
                        className={`p-2 rounded-xl border text-left transition-all ${
                          active
                            ? 'bg-[#33312e] border-[#81b64c]'
                            : 'bg-[#1c1b18] border-white/5 hover:bg-[#2b2926]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">
                            {info.title}
                          </span>
                          <span
                            className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded ${
                              info.isStandard
                                ? 'bg-[#81b64c]/25 text-[#81b64c]'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {info.isStandard ? 'RATED ELO' : 'UNRATED'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Online ELO Stakes Preview */}
                <div className="px-3 py-2 rounded-xl bg-[#1c1b18] border border-white/10 flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#81b64c]" />
                    {gameMode === 'classic' ? 'Online Standard ELO:' : 'Variant Mode:'}
                  </span>
                  {gameMode === 'classic' ? (
                    <div className="flex items-center gap-2 font-mono font-bold text-[11px]">
                      <span className="text-[#81b64c]">
                        Win +{calculateEloChange('win', userElo, activeOpponentElo)}
                      </span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-amber-400">
                        Draw {calculateEloChange('draw', userElo, activeOpponentElo)}
                      </span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-rose-400">
                        Loss {calculateEloChange('loss', userElo, activeOpponentElo)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-400">
                      Unrated Variant (0 ELO Change)
                    </span>
                  )}
                </div>

                {/* Online Matchmaking Queue Button or Active Online Game Move Ratings & Controls */}
                {matchModeType === 'online' && gameStatus !== 'idle' ? (
                  <div className="space-y-2.5">
                    <div className="p-2.5 rounded-xl bg-[#1c1b18] border border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#1baca6]" /> Live Move Ratings
                        </span>
                        <span className="text-zinc-500">Your Online Moves</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                        {(
                          [
                            'brilliant',
                            'great',
                            'best',
                            'good',
                            'book',
                            'inaccuracy',
                            'mistake',
                            'blunder',
                          ] as MoveRating[]
                        ).map((rKey) => {
                          const meta = MOVE_RATING_META[rKey];
                          const count = myMoveRatingsCount[rKey];
                          return (
                            <div
                              key={rKey}
                              className="px-2 py-1 rounded bg-[#161512] border border-white/5 flex items-center justify-between"
                              title={meta.label}
                            >
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                                  style={{ backgroundColor: meta.color }}
                                >
                                  {meta.symbol}
                                </span>
                                <span className="text-[9px] text-zinc-400 truncate max-w-[42px]">
                                  {meta.label.split(' ')[0]}
                                </span>
                              </span>
                              <span className="font-bold text-white">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-[#1c1b18] border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-3.5 py-1.5 bg-[#161512] border-b border-white/5 flex items-center justify-between text-[11px] font-bold text-zinc-400">
                        <span>ONLINE MOVES ({moveHistory.length})</span>
                        <span className="font-mono text-[#81b64c]">
                          {turn === myOnlineColor
                            ? 'Your turn'
                            : `${activeOpponentName}'s turn...`}
                        </span>
                      </div>
                      <div className="h-28 overflow-y-auto divide-y divide-white/5 text-xs font-mono">
                        {movePairs.map((pair) => (
                          <div
                            key={pair.moveNumber}
                            className="grid grid-cols-7 px-3.5 py-1 hover:bg-white/5 items-center"
                          >
                            <span className="col-span-1 text-zinc-500">
                              {pair.moveNumber}.
                            </span>
                            <span className="col-span-3 text-white font-semibold flex items-center gap-1.5">
                              <span>{pair.white?.san || ''}</span>
                              {pair.white?.ratingInfo && (
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-black text-white leading-tight"
                                  style={{ backgroundColor: pair.white.ratingInfo.color }}
                                  title={`${pair.white.ratingInfo.label}: ${pair.white.ratingInfo.reason}`}
                                >
                                  {pair.white.ratingInfo.symbol}
                                </span>
                              )}
                            </span>
                            <span className="col-span-3 text-zinc-400 flex items-center gap-1.5">
                              <span>{pair.black?.san || ''}</span>
                              {pair.black?.ratingInfo && (
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-black text-white leading-tight"
                                  style={{ backgroundColor: pair.black.ratingInfo.color }}
                                  title={`${pair.black.ratingInfo.label}: ${pair.black.ratingInfo.reason}`}
                                >
                                  {pair.black.ratingInfo.symbol}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => setFlipped((f) => !f)}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-[#454340] text-zinc-200 font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <FlipVertical className="w-3.5 h-3.5" /> Flip
                      </button>
                      <button
                        onClick={() => concludeGame('draw', 'draw')}
                        disabled={gameStatus !== 'playing'}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-amber-600/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Handshake className="w-3.5 h-3.5" /> Draw
                      </button>
                      <button
                        onClick={() =>
                          concludeGame('resigned', myOnlineColor === 'w' ? 'b' : 'w')
                        }
                        disabled={gameStatus !== 'playing'}
                        className="py-2 rounded-lg bg-[#383633] hover:bg-rose-600/30 text-rose-400 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Flag className="w-3.5 h-3.5" /> Resign
                      </button>
                      <button
                        onClick={() => selectModePreview(gameMode)}
                        className="py-2 rounded-lg bg-[#81b64c] hover:bg-[#95bb4a] text-white font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Lobby
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleJoinMatchmakingQueue}
                    className={`w-full py-3.5 rounded-xl font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isSearchingQueue
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-[#81b64c] hover:bg-[#95bb4a] text-white shadow-[0_4px_0_#537133]'
                    }`}
                  >
                    {isSearchingQueue ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Searching for Website Member... (Click to Cancel)</span>
                      </>
                    ) : (
                      <>
                        <Swords className="w-4 h-4" />
                        <span>Find Online Member Match ({MODE_INFO[gameMode].title})</span>
                      </>
                    )}
                  </button>
                )}

                {/* Create or Join Private Room Code */}
                <div className="bg-[#1c1b18] p-3.5 rounded-xl border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-[#81b64c]" /> Private Match Room Code
                    </span>
                    <button
                      onClick={handleCreatePrivateRoom}
                      className="px-2.5 py-1 rounded bg-[#2b2926] hover:bg-[#81b64c] text-zinc-200 hover:text-white text-[11px] font-bold transition-colors"
                    >
                      + Create Room Code
                    </button>
                  </div>

                  {createdRoomCode && (
                    <div className="p-2.5 rounded-lg bg-[#161512] border border-[#81b64c]/50 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">
                          Share this Room Code with another member:
                        </span>
                        <span className="font-mono font-black text-base text-[#81b64c] tracking-widest">
                          {createdRoomCode}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdRoomCode);
                          setCopiedRoom(true);
                          setTimeout(() => setCopiedRoom(false), 2000);
                        }}
                        className="px-2.5 py-1.5 rounded bg-[#262522] hover:bg-[#33312e] text-xs font-bold text-white flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedRoom ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleJoinRoomByCode} className="flex gap-2">
                    <input
                      type="text"
                      value={joinRoomInput}
                      onChange={(e) => setJoinRoomInput(e.target.value)}
                      placeholder="Enter member's Room Code (e.g. A9F3K)"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#161512] border border-white/10 text-xs font-mono uppercase text-white focus:outline-none focus:border-[#81b64c]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#81b64c] hover:bg-[#95bb4a] text-white text-xs font-bold"
                    >
                      Join Room
                    </button>
                  </form>
                </div>

                {/* Connected Online Website Members List */}
                <div className="bg-[#1c1b18] p-3.5 rounded-xl border border-white/10 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Online Website Members ({otherConnectedHumans.length})
                  </span>
                  {otherConnectedHumans.length === 0 ? (
                    <div className="py-5 text-center text-xs text-zinc-500">
                      No other website members online right now. Open this page in another tab or invite a BSMS member to play live!
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {otherConnectedHumans.map((u) => (
                        <div
                          key={u.clientId}
                          className="p-2.5 rounded-lg bg-[#161512] border border-white/5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={u.avatar || '/img/pfp.png'}
                              alt={u.username}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/img/pfp.png';
                              }}
                              className="w-8 h-8 rounded object-cover border border-white/10"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {u.username}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-400">
                                {u.elo} ELO • {u.status}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!savedFriendNames.includes(u.username) && (
                              <button
                                onClick={() =>
                                  setSavedFriendNames((prev) => [...prev, u.username])
                                }
                                className="px-2 py-1 rounded bg-[#262522] hover:bg-[#383633] text-[10px] font-bold text-zinc-300"
                              >
                                + Friend
                              </button>
                            )}
                            <button
                              onClick={() => handleChallengeConnectedHuman(u)}
                              className="px-2.5 py-1 rounded bg-[#81b64c] hover:bg-[#95bb4a] text-white text-[11px] font-bold"
                            >
                              Challenge
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CUSTOM GAMEMODE STUDIO */}
            {navSection === 'custom' && (
              <div className="p-4">
                <CustomModeBuilder
                  isEditing={isEditingBoard}
                  onToggleEditing={(editing) => {
                    setIsEditingBoard(editing);
                    if (editing) {
                      setGameMode('custom');
                      setGameStatus('idle');
                    }
                  }}
                  selectedBrush={selectedBrush}
                  onSelectBrush={setSelectedBrush}
                  draftName={customDraftName}
                  onChangeDraftName={setCustomDraftName}
                  draftDesc={customDraftDesc}
                  onChangeDraftDesc={setCustomDraftDesc}
                  alienMoveRule={alienMoveRule}
                  onChangeAlienRule={setAlienMoveRule}
                  allowRoyalCleave={customRoyalCleave}
                  onChangeRoyalCleave={setCustomRoyalCleave}
                  acceleratingBlitz={customAccelBlitz}
                  onChangeAcceleratingBlitz={setCustomAccelBlitz}
                  baseMinutes={customMinutes}
                  onChangeBaseMinutes={(mins) => {
                    setCustomMinutes(mins);
                    setWhiteTime(mins * 60);
                    setBlackTime(mins * 60);
                  }}
                  incrementSeconds={incrementSeconds}
                  onChangeIncrementSeconds={setIncrementSeconds}
                  onApplyBoardPreset={(presetBoard) => {
                    setIsEditingBoard(true);
                    setGameMode('custom');
                    setGameStatus('idle');
                    setCustomStartingBoard(cloneBoard(presetBoard));
                    setBoard(cloneBoard(presetBoard));
                    sound.playMove();
                  }}
                  onSaveAndPlayCustom={() => {
                    const newSaved: CustomGameModeConfig = {
                      id: `custom-${Date.now()}`,
                      name: customDraftName || 'Custom Arena',
                      description: customDraftDesc,
                      board: cloneBoard(board),
                      alienMoveRule,
                      allowRoyalCleave: customRoyalCleave,
                      acceleratingBlitz: customAccelBlitz,
                      pawnReserveCount: 0,
                      baseMinutes: customMinutes,
                      incrementSeconds,
                    };
                    setSavedCustomModes((prev) => [newSaved, ...prev]);
                    setCustomStartingBoard(cloneBoard(board));
                    startBotMatch(selectedBot, 'custom', customMinutes, board);
                    setNavSection('bots');
                  }}
                  savedCustomModes={savedCustomModes}
                  onLoadSavedMode={(cfg) => {
                    setCustomDraftName(cfg.name);
                    setCustomDraftDesc(cfg.description);
                    setAlienMoveRule(cfg.alienMoveRule);
                    setCustomRoyalCleave(cfg.allowRoyalCleave);
                    setCustomAccelBlitz(cfg.acceleratingBlitz);
                    setCustomMinutes(cfg.baseMinutes);
                    setIncrementSeconds(cfg.incrementSeconds);
                    setCustomStartingBoard(cloneBoard(cfg.board));
                    startBotMatch(selectedBot, 'custom', cfg.baseMinutes, cfg.board);
                    setNavSection('bots');
                  }}
                  onDeleteSavedMode={(id) =>
                    setSavedCustomModes((prev) => prev.filter((m) => m.id !== id))
                  }
                />
              </div>
            )}

            {/* TAB 4: WEBSITE MEMBERS & FRIENDS (SYNCED ACCOUNT NAMES & PFPS — ZERO AI) */}
            {navSection === 'friends' && (
              <div className="p-4 space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = friendInputName.trim();
                    if (clean && !savedFriendNames.includes(clean)) {
                      setSavedFriendNames((prev) => [clean, ...prev]);
                    }
                    setFriendInputName('');
                  }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <UserPlus className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={friendInputName}
                      onChange={(e) => setFriendInputName(e.target.value)}
                      placeholder="Add BSMS member by account name..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#1c1b18] border border-white/10 text-xs text-white focus:outline-none focus:border-[#81b64c]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-lg bg-[#81b64c] hover:bg-[#95bb4a] text-white text-xs font-bold shrink-0"
                  >
                    Add Friend
                  </button>
                </form>

                {/* Registered BSMS Website Members Directory */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <span>Synced Website Members ({leaderboard.length})</span>
                    <span className="text-[#81b64c]">Account Name &amp; PFP Synced</span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {leaderboard.map((member) => {
                      const liveConn = otherConnectedHumans.find(
                        (u) =>
                          u.memberId === member.memberId ||
                          u.username.toLowerCase() === member.name.toLowerCase()
                      );
                      const isFriend = savedFriendNames.some(
                        (f) => f.toLowerCase() === member.name.toLowerCase()
                      );
                      return (
                        <div
                          key={member.memberId}
                          className="p-2.5 rounded-xl bg-[#1c1b18] border border-white/5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative shrink-0">
                              <img
                                src={member.avatar || '/img/pfp.png'}
                                alt={member.name}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = '/img/pfp.png';
                                }}
                                className="w-8 h-8 rounded object-cover border border-white/10"
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1c1b18] ${
                                  member.online ? 'bg-[#81b64c]' : 'bg-zinc-600'
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                <span className="truncate">{member.name}</span>
                                {member.isUser && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#81b64c]/20 text-[#81b64c]">
                                    YOU
                                  </span>
                                )}
                                {isFriend && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                    FRIEND
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-400">
                                {member.elo} ELO • {member.online ? 'Online Now' : 'Offline'}
                              </div>
                            </div>
                          </div>

                          {!member.isUser && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {liveConn && (
                                <button
                                  onClick={() => handleChallengeConnectedHuman(liveConn)}
                                  className="px-2.5 py-1 rounded bg-[#81b64c] text-white text-[11px] font-bold"
                                >
                                  Challenge
                                </button>
                              )}
                              {isFriend ? (
                                <button
                                  onClick={() =>
                                    setSavedFriendNames((prev) =>
                                      prev.filter(
                                        (n) => n.toLowerCase() !== member.name.toLowerCase()
                                      )
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-[#2b2926] text-zinc-400 hover:text-rose-400 text-[10px]"
                                >
                                  Unfriend
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    setSavedFriendNames((prev) => [...prev, member.name])
                                  }
                                  className="px-2 py-1 rounded bg-[#262522] hover:bg-[#383633] text-zinc-300 text-[10px] font-bold"
                                >
                                  + Friend
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Human Matches Being Played Right Now */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#81b64c]" /> Live Member Matches (
                    {liveHumanMatches.length})
                  </span>
                  {liveHumanMatches.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#161512] text-xs text-zinc-500 text-center">
                      No active member vs member matches in progress right now.
                    </div>
                  ) : (
                    liveHumanMatches.map((m) => (
                      <div
                        key={m.roomId}
                        className="p-2.5 rounded-xl bg-[#161512] border border-white/5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={m.whiteAvatar || '/img/pfp.png'}
                            alt={m.whitePlayer}
                            className="w-5 h-5 rounded object-cover"
                          />
                          <span className="font-bold text-white">{m.whitePlayer}</span>
                          <span className="text-zinc-500">vs</span>
                          <img
                            src={m.blackAvatar || '/img/pfp.png'}
                            alt={m.blackPlayer}
                            className="w-5 h-5 rounded object-cover"
                          />
                          <span className="font-bold text-white">{m.blackPlayer}</span>
                        </div>
                        <span className="text-[10px] text-[#81b64c] font-mono">
                          {m.timeControlLabel}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: WEBSITE MEMBERS LEADERBOARD (ZERO BOTS — REAL SYNCED MEMBERS ONLY!) */}
            {navSection === 'leaderboard' && (
              <div className="p-4 space-y-4">
                <div className="p-3 rounded-xl bg-[#1c1b18] border border-[#81b64c]/40 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-amber-400" /> BSMS Website Members Leaderboard
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Zero Bots • Real Website Members Only • Online Standard Chess ELO
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-[10px] text-zinc-400">Your ELO</div>
                    <div className="text-base font-black text-[#81b64c]">{userElo}</div>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.memberId}
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        entry.isUser
                          ? 'bg-[#81b64c]/15 border-[#81b64c] shadow-sm'
                          : 'bg-[#1c1b18] border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 text-center font-mono text-xs font-black ${
                            entry.rank === 1
                              ? 'text-amber-400'
                              : entry.rank === 2
                              ? 'text-zinc-300'
                              : entry.rank === 3
                              ? 'text-amber-600'
                              : 'text-zinc-500'
                          }`}
                        >
                          #{entry.rank}
                        </span>
                        <div className="relative shrink-0">
                          <img
                            src={entry.avatar || '/img/pfp.png'}
                            alt={entry.name}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = '/img/pfp.png';
                            }}
                            className="w-8 h-8 rounded-lg object-cover border border-white/10"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1c1b18] ${
                              entry.online ? 'bg-[#81b64c]' : 'bg-zinc-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{entry.name}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-mono">
                              {entry.badge}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {entry.wins}W / {entry.draws}D / {entry.losses}L
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono shrink-0">
                        <div className="text-xs font-black text-white">
                          {entry.elo} ELO
                        </div>
                        {entry.streak > 0 && (
                          <div className="text-[10px] text-[#81b64c]">
                            🔥 {entry.streak}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Match History */}
                {matchHistory.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[#81b64c]" /> Recent Matches
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {matchHistory.map((item) => (
                        <div
                          key={item.id}
                          className="px-3 py-1.5 rounded-lg bg-[#161512] flex items-center justify-between text-xs"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-white">
                              vs {item.opponentName}
                            </span>{' '}
                            <span className="text-[10px] text-zinc-500">
                              ({MODE_INFO[item.mode].title})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono shrink-0">
                            {item.isRated ? (
                              <span
                                className={`text-[11px] font-bold ${
                                  item.eloDelta > 0
                                    ? 'text-[#81b64c]'
                                    : 'text-rose-400'
                                }`}
                              >
                                {item.eloDelta > 0
                                  ? `+${item.eloDelta}`
                                  : item.eloDelta}{' '}
                                ELO
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-500">
                                0 ELO ({item.opponentType === 'bot' ? 'Bot' : 'Variant'})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
