export type PieceColor = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'alien';

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export type BoardSquare = Piece | null;
export type BoardGrid = BoardSquare[][]; // 8x8 standard, or custom dimensions

export interface Position {
  row: number;
  col: number;
}

export type MoveRating =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'book'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface MoveRatingInfo {
  rating: MoveRating;
  label: string;
  symbol: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  evalBefore: number;
  evalAfter: number;
  evalDelta: number;
  reason: string;
}

export const MOVE_RATING_META: Record<
  MoveRating,
  {
    label: string;
    symbol: string;
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  brilliant: {
    label: 'Brilliant',
    symbol: '!!',
    color: '#1baca6',
    bgClass: 'bg-[#1baca6]',
    textClass: 'text-[#1baca6]',
    borderClass: 'border-[#1baca6]',
  },
  great: {
    label: 'Great Move',
    symbol: '!',
    color: '#5c8bb0',
    bgClass: 'bg-[#5c8bb0]',
    textClass: 'text-[#5c8bb0]',
    borderClass: 'border-[#5c8bb0]',
  },
  best: {
    label: 'Best Move',
    symbol: '★',
    color: '#81b64c',
    bgClass: 'bg-[#81b64c]',
    textClass: 'text-[#81b64c]',
    borderClass: 'border-[#81b64c]',
  },
  book: {
    label: 'Book Move',
    symbol: '📖',
    color: '#a88865',
    bgClass: 'bg-[#a88865]',
    textClass: 'text-[#d5b48f]',
    borderClass: 'border-[#a88865]',
  },
  good: {
    label: 'Good',
    symbol: '✓',
    color: '#95b776',
    bgClass: 'bg-[#6c8d4d]',
    textClass: 'text-[#95b776]',
    borderClass: 'border-[#95b776]',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    color: '#f7c631',
    bgClass: 'bg-[#f7c631]',
    textClass: 'text-[#f7c631]',
    borderClass: 'border-[#f7c631]',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    color: '#e6912c',
    bgClass: 'bg-[#e6912c]',
    textClass: 'text-[#e6912c]',
    borderClass: 'border-[#e6912c]',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    color: '#ca3431',
    bgClass: 'bg-[#ca3431]',
    textClass: 'text-[#fa412d]',
    borderClass: 'border-[#ca3431]',
  },
};

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece | null;
  isEnPassant?: boolean;
  isCastling?: 'kingside' | 'queenside';
  promotion?: PieceType;
  san: string;
  timestamp: number;
  ratingInfo?: MoveRatingInfo;
}

export type GameMode = 'classic' | 'king_vs_100_pawns' | 'sudden_death_blitz' | 'alien_mode' | 'custom';

export type AlienMoveRule = 'everywhere' | 'unguarded_only' | 'queen_knight';

export interface CustomGameModeConfig {
  id: string;
  name: string;
  description: string;
  board: BoardGrid;
  alienMoveRule: AlienMoveRule;
  allowRoyalCleave: boolean;
  acceleratingBlitz: boolean;
  pawnReserveCount: number;
  baseMinutes: number; // -1 for unlimited
  incrementSeconds: number;
}

export type AIDifficulty = 'novice' | 'intermediate' | 'grandmaster' | 'alien_mind';

export type GameStatus = 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned' | 'timeout';

export interface TimeControlSetting {
  baseMinutes: number; // -1 for unlimited
  incrementSeconds: number;
  label: string;
}

export interface KingAbilityStatus {
  royalCleaveCooldown: number; // in turns
  royalCleaveMaxCooldown: number;
  holyDashCharges: number;
  holyDashMaxCharges: number;
}

export interface PawnWaveStatus {
  totalPawnsRemaining: number;
  pawnsKilled: number;
  activeWave: number;
  totalWaves: number;
}

export interface BlitzSpeedStatus {
  currentMultiplier: number;
  turnCount: number;
}

export interface GameState {
  board: BoardGrid;
  turn: PieceColor;
  mode: GameMode;
  aiDifficulty: AIDifficulty;
  isAiGame: boolean;
  aiColor: PieceColor;
  status: GameStatus;
  winner: PieceColor | 'draw' | null;
  moveHistory: Move[];
  capturedWhite: Piece[];
  capturedBlack: Piece[];
  whiteTime: number; // in seconds
  blackTime: number; // in seconds
  initialTime: number;
  isWhiteTurn: boolean;
  inCheck: PieceColor | null;
  lastMove: Move | null;
  // Specific mode states
  kingAbilities?: KingAbilityStatus;
  pawnWave?: PawnWaveStatus;
  blitzSpeed?: BlitzSpeedStatus;
}

export type RankTier = 
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Master'
  | 'Grandmaster'
  | 'Legendary';

export interface UserEloProfile {
  elo: number;
  tier: RankTier;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  bestElo: number;
  matchHistory: {
    id: string;
    date: string;
    mode: GameMode;
    opponent: string;
    result: 'win' | 'loss' | 'draw';
    eloDelta: number;
    movesCount: number;
  }[];
}

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  status: 'online' | 'in_game' | 'offline';
  elo: number;
  tier: RankTier;
  currentMatch?: {
    id: string;
    mode: GameMode;
    opponentName: string;
    opponentElo: number;
    whiteScore: string;
    blackScore: string;
  };
}

export interface LeaderboardPlayer {
  rank: number;
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  elo: number;
  tier: RankTier;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  isOnline: boolean;
  badge?: string;
}

export interface SpectatorMatch {
  id: string;
  whitePlayer: {
    name: string;
    elo: number;
    avatar: string;
    isAi?: boolean;
  };
  blackPlayer: {
    name: string;
    elo: number;
    avatar: string;
    isAi?: boolean;
  };
  mode: GameMode;
  currentTurn: PieceColor;
  moveCount: number;
  evalScore: number; // positive = White advantage, negative = Black
  whiteTime: number;
  blackTime: number;
  spectatorCount: number;
  lastMoveSAN: string;
  chatMessages: {
    user: string;
    text: string;
    time: string;
  }[];
}

export const TIER_COLORS: Record<RankTier, { bg: string; text: string; border: string; glow: string }> = {
  Bronze: { bg: 'bg-amber-950/40', text: 'text-amber-600', border: 'border-amber-700/50', glow: 'rgba(180,83,9,0.3)' },
  Silver: { bg: 'bg-slate-800/40', text: 'text-slate-300', border: 'border-slate-500/50', glow: 'rgba(203,213,225,0.3)' },
  Gold: { bg: 'bg-yellow-950/40', text: 'text-yellow-400', border: 'border-yellow-500/50', glow: 'rgba(234,179,8,0.4)' },
  Platinum: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/50', glow: 'rgba(6,182,212,0.4)' },
  Diamond: { bg: 'bg-indigo-950/40', text: 'text-indigo-400', border: 'border-indigo-500/50', glow: 'rgba(99,102,241,0.4)' },
  Master: { bg: 'bg-purple-950/40', text: 'text-purple-400', border: 'border-purple-500/50', glow: 'rgba(168,85,247,0.4)' },
  Grandmaster: { bg: 'bg-rose-950/40', text: 'text-rose-400', border: 'border-rose-500/50', glow: 'rgba(244,63,94,0.4)' },
  Legendary: { bg: 'bg-amber-900/50', text: 'text-amber-300', border: 'border-yellow-400', glow: 'rgba(251,191,36,0.6)' },
};

