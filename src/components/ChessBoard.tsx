import React, { useState, useEffect, useRef } from 'react';
import {
  BoardGrid,
  Piece,
  Position,
  Move,
  PieceColor,
  GameMode,
  PieceType,
  AlienMoveRule,
} from '../types/chess';
import {
  getLegalMoves,
  getFirstBlockerOnPath,
  formatSAN,
  evaluateBoard,
  cloneBoard,
  isKingInCheck,
  classifyMove,
} from '../utils/chessEngine';
import { ChessPiece } from './ChessPiece';
import { sound } from '../utils/audio';
import { Sparkles, Zap, Cpu, User, Clock, Wand2 } from 'lucide-react';

interface ChessBoardProps {
  board: BoardGrid;
  turn: PieceColor;
  mode: GameMode;
  alienMoveRule?: AlienMoveRule;
  inCheck: PieceColor | null;
  lastMove: Move | null;
  flipped?: boolean;
  interactive?: boolean;
  playerColor?: PieceColor;
  onMove: (move: Move, nextBoard: BoardGrid) => void;
  onSpecialAbility?: (ability: 'cleave' | 'dash') => void;
  canCleave?: boolean;
  cleaveCooldown?: number;
  capturedWhite?: Piece[];
  capturedBlack?: Piece[];
  externalMove?: { from: Position; to: Position; piece: Piece; promotion?: PieceType } | null;
  onExternalMoveComplete?: () => void;
  // Chess.com style player bar props
  whitePlayerName?: string;
  whitePlayerElo?: number;
  whitePlayerAvatar?: string;
  whitePlayerBadge?: string;
  blackPlayerName?: string;
  blackPlayerElo?: number;
  blackPlayerAvatar?: string;
  blackPlayerBadge?: string;
  botAvatarText?: string;
  botAccentColor?: string;
  botQuote?: string | null;
  isAiOpponent?: boolean;
  isGameActive?: boolean;
  boardTheme?: 'green' | 'wood' | 'icy' | 'crimson';
  boardSizePx?: number;
  whiteTime?: number;
  blackTime?: number;
  isUnlimitedTime?: boolean;
  // Custom Gamemode Builder Live Board Editor support
  isEditingBoard?: boolean;
  onEditorSquareClick?: (row: number, col: number) => void;
  moveCount?: number;
}

interface AnimatingMove {
  piece: Piece;
  from: Position;
  to: Position;
  animating: boolean;
  captured: Piece | null;
  isCastling?: 'kingside' | 'queenside';
}

interface LandingBurst {
  row: number;
  col: number;
  isAlien: boolean;
  id: number;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  turn,
  mode,
  alienMoveRule = 'everywhere',
  inCheck,
  lastMove,
  flipped = false,
  interactive = true,
  onMove,
  onSpecialAbility,
  canCleave = false,
  cleaveCooldown = 0,
  capturedWhite = [],
  capturedBlack = [],
  externalMove = null,
  onExternalMoveComplete,
  whitePlayerName = 'You',
  whitePlayerElo = 0,
  whitePlayerAvatar = '/img/pfp.png',
  whitePlayerBadge = 'Bronze',
  blackPlayerName = 'Opponent',
  blackPlayerElo = 1500,
  blackPlayerAvatar = '/img/pfp.png',
  blackPlayerBadge = 'Gold',
  botAvatarText,
  botAccentColor = 'from-amber-500 to-red-700',
  botQuote = null,
  isAiOpponent = false,
  isGameActive = false,
  boardTheme = 'green',
  boardSizePx = 440,
  whiteTime = 300,
  blackTime = 300,
  isUnlimitedTime = false,
  isEditingBoard = false,
  onEditorSquareClick,
  moveCount = 0,
}) => {
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [legalDestinations, setLegalDestinations] = useState<Position[]>([]);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove | null>(null);
  const [landingBurst, setLandingBurst] = useState<LandingBurst | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Position; to: Position; piece: Piece } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Clear selections when turn or board changes
  useEffect(() => {
    setSelectedPos(null);
    setLegalDestinations([]);
  }, [board, turn]);

  // Execute external moves (from AI or spectator stream) with smooth glide animation
  useEffect(() => {
    if (externalMove && !animatingMove) {
      executeMoveWithAnimation(
        externalMove.from,
        externalMove.to,
        externalMove.piece,
        externalMove.promotion
      );
    }
  }, [externalMove]);

  const formatClock = (seconds: number) => {
    if (isUnlimitedTime) return '∞';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle clicking a square
  const handleSquareClick = (row: number, col: number) => {
    // If Custom Gamemode Builder Board Editor is active, paint directly on the square!
    if (isEditingBoard && onEditorSquareClick) {
      onEditorSquareClick(row, col);
      sound.playMove();
      return;
    }

    if (!interactive || animatingMove) return;
    const clickedPiece = board[row][col];

    // If clicking on a friendly piece of current turn's color, switch selection immediately
    if (clickedPiece && clickedPiece.color === turn) {
      if (selectedPos && selectedPos.row === row && selectedPos.col === col) {
        setSelectedPos(null);
        setLegalDestinations([]);
        return;
      }
      setSelectedPos({ row, col });
      const moves = getLegalMoves(board, { row, col }, lastMove, mode, alienMoveRule);
      setLegalDestinations(moves);
      return;
    }

    // If a piece is already selected, try to move to the clicked square
    if (selectedPos) {
      const fromPiece = board[selectedPos.row][selectedPos.col]!;
      let targetRow = row;
      let targetCol = col;
      let isLegal = legalDestinations.some((d) => d.row === targetRow && d.col === targetCol);

      // If the Alien tries to move to a square that is blocked by another piece in its way,
      // automatically stop at and take the first blocking piece along that line!
      if (!isLegal && fromPiece?.type === 'alien') {
        const blocker = getFirstBlockerOnPath(board, selectedPos, { row, col });
        if (
          blocker &&
          legalDestinations.some((d) => d.row === blocker.row && d.col === blocker.col)
        ) {
          targetRow = blocker.row;
          targetCol = blocker.col;
          isLegal = true;
        }
      }

      if (isLegal) {
        // Check for Pawn Promotion
        if (
          fromPiece.type === 'p' &&
          ((fromPiece.color === 'w' && targetRow === 0) ||
            (fromPiece.color === 'b' && targetRow === 7))
        ) {
          setPromotionPending({
            from: selectedPos,
            to: { row: targetRow, col: targetCol },
            piece: fromPiece,
          });
          return;
        }

        executeMoveWithAnimation(selectedPos, { row: targetRow, col: targetCol }, fromPiece);
        return;
      }
    }

    setSelectedPos(null);
    setLegalDestinations([]);
  };

  // Smooth sliding + Alien Warp Beam animation
  const executeMoveWithAnimation = (
    from: Position,
    to: Position,
    piece: Piece,
    promotionPieceType?: PieceType
  ) => {
    const targetPiece = board[to.row][to.col];

    let isCastling: 'kingside' | 'queenside' | undefined;
    if (piece.type === 'k' && Math.abs(to.col - from.col) === 2) {
      isCastling = to.col > from.col ? 'kingside' : 'queenside';
    }

    setAnimatingMove({
      piece,
      from,
      to,
      animating: false,
      captured: targetPiece,
      isCastling,
    });

    // Play rich synthesized board or sci-fi sound
    if (piece.type === 'alien') {
      sound.playAlienPower(!!targetPiece);
    } else if (isCastling) {
      sound.playCastle();
    } else if (targetPiece) {
      sound.playCapture();
    } else {
      sound.playMove();
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatingMove((prev) => (prev ? { ...prev, animating: true } : null));
      });
    });

    const animDuration = piece.type === 'alien' ? 320 : 240;

    setTimeout(() => {
      const nextBoard = cloneBoard(board);
      const movedPiece: Piece = {
        ...piece,
        hasMoved: true,
        type: promotionPieceType || piece.type,
      };

      // En passant capture removal
      if (
        piece.type === 'p' &&
        from.col !== to.col &&
        !nextBoard[to.row][to.col] &&
        lastMove &&
        lastMove.to.col === to.col
      ) {
        nextBoard[from.row][to.col] = null;
      }

      // Castling rook move
      if (isCastling === 'kingside') {
        const rook = nextBoard[from.row][7];
        if (rook) {
          nextBoard[from.row][5] = { ...rook, hasMoved: true };
          nextBoard[from.row][7] = null;
        }
      } else if (isCastling === 'queenside') {
        const rook = nextBoard[from.row][0];
        if (rook) {
          nextBoard[from.row][3] = { ...rook, hasMoved: true };
          nextBoard[from.row][0] = null;
        }
      }

      nextBoard[to.row][to.col] = movedPiece;
      nextBoard[from.row][from.col] = null;

      const san = formatSAN(board, from, to, piece, targetPiece, isCastling, promotionPieceType);

      const moveObj: Move = {
        from,
        to,
        piece: movedPiece,
        captured: targetPiece,
        isCastling,
        promotion: promotionPieceType,
        san,
        timestamp: Date.now(),
      };

      moveObj.ratingInfo = classifyMove(board, nextBoard, moveObj, moveCount + 1, mode);

      // Trigger impact burst on landing (especially dramatic for Alien or captures)
      if (piece.type === 'alien' || targetPiece) {
        setLandingBurst({
          row: to.row,
          col: to.col,
          isAlien: piece.type === 'alien',
          id: Date.now(),
        });
        setTimeout(() => setLandingBurst(null), 500);
      }

      setAnimatingMove(null);
      setSelectedPos(null);
      setLegalDestinations([]);
      setPromotionPending(null);

      const opponentColor: PieceColor = piece.color === 'w' ? 'b' : 'w';
      if (isKingInCheck(nextBoard, opponentColor)) {
        setTimeout(() => sound.playCheck(), 60);
      }

      onMove(moveObj, nextBoard);
      if (onExternalMoveComplete) {
        onExternalMoveComplete();
      }
    }, animDuration);
  };

  // Compute evaluation score for Chess.com vertical evaluation bar
  const boardEval = evaluateBoard(board);
  const evalPercent = Math.min(95, Math.max(5, 50 + boardEval / 35));
  const evalFormatted =
    boardEval >= 0 ? `+${(boardEval / 100).toFixed(1)}` : (boardEval / 100).toFixed(1);

  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const topIsBlack = !flipped;

  // Material advantage calculation (Chess.com style +1, +3, etc.)
  const pieceMatVal = (t: PieceType) =>
    t === 'p' ? 1 : t === 'n' || t === 'b' ? 3 : t === 'r' ? 5 : t === 'q' ? 9 : t === 'alien' ? 12 : 0;

  let whiteMat = 0;
  let blackMat = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.color === 'w') whiteMat += pieceMatVal(p.type);
      else blackMat += pieceMatVal(p.type);
    }
  }
  const matDiff = whiteMat - blackMat;

  const THEME_SQUARES: Record<'green' | 'wood' | 'icy' | 'crimson', { dark: string; light: string }> = {
    green: {
      dark: 'bg-[#739552] text-[#ebecd0]',
      light: 'bg-[#ebecd0] text-[#739552]',
    },
    wood: {
      dark: 'bg-[#b58863] text-[#f0d9b5]',
      light: 'bg-[#f0d9b5] text-[#b58863]',
    },
    icy: {
      dark: 'bg-[#4b7399] text-[#eae9d2]',
      light: 'bg-[#eae9d2] text-[#4b7399]',
    },
    crimson: {
      dark: 'bg-[#8b1e2f] text-[#f3e5e8]',
      light: 'bg-[#f3e5e8] text-[#8b1e2f]',
    },
  };

  // Helper to render a Chess.com-style Player Bar
  const renderPlayerBar = (isBlackBar: boolean) => {
    const isTurn = isGameActive && ((isBlackBar && turn === 'b') || (!isBlackBar && turn === 'w'));
    const name = isBlackBar ? blackPlayerName : whitePlayerName;
    const elo = isBlackBar ? blackPlayerElo : whitePlayerElo;
    const avatar = isBlackBar ? blackPlayerAvatar : whitePlayerAvatar;
    const badge = isBlackBar ? blackPlayerBadge : whitePlayerBadge;
    const clockSecs = isBlackBar ? blackTime : whiteTime;
    const captures = isBlackBar ? capturedWhite : capturedBlack;
    const matAdvantage = isBlackBar ? (matDiff < 0 ? -matDiff : 0) : matDiff > 0 ? matDiff : 0;
    const isLowTime = isGameActive && !isUnlimitedTime && clockSecs <= 20;

    return (
      <div className="w-full flex flex-col gap-1">
        <div className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#262522] border border-white/10 rounded-lg shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center overflow-hidden border ${
                isTurn ? 'border-[#81b64c] ring-2 ring-[#81b64c]/30' : 'border-white/15'
              } bg-[#1b1a17] shrink-0`}
            >
              {isBlackBar && isAiOpponent && botAvatarText ? (
                <div
                  className={`w-full h-full bg-gradient-to-br ${botAccentColor} flex items-center justify-center font-black text-xs text-white tracking-tight`}
                >
                  {botAvatarText}
                </div>
              ) : isBlackBar && isAiOpponent ? (
                <Cpu className="w-5 h-5 text-amber-400" />
              ) : avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/img/pfp.png';
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-zinc-300" />
              )}
            </div>

            {/* Name, ELO, Tier Flair & Captured Pieces */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white truncate">{name}</span>
                <span className="text-xs font-mono text-zinc-400">({elo})</span>
                {isBlackBar && isAiOpponent ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                    {badge || 'BOT'}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-white/10 text-zinc-300 rounded">
                    {badge}
                  </span>
                )}
                {!isBlackBar && mode === 'alien_mode' && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase bg-fuchsia-950/90 text-fuchsia-300 border border-fuchsia-700/60 rounded">
                    ALIEN
                  </span>
                )}
              </div>

            {/* Captured Pieces Strip + Material Advantage */}
            <div className="flex items-center gap-1 h-4 mt-0.5">
              <div className="flex items-center">
                {captures.slice(-12).map((p, idx) => (
                  <div key={idx} className="w-3.5 h-3.5 -ml-1 first:ml-0">
                    <ChessPiece piece={p} />
                  </div>
                ))}
              </div>
              {matAdvantage > 0 && (
                <span className="text-[11px] font-mono font-bold text-zinc-300 ml-1">
                  +{matAdvantage}
                </span>
              )}
              {captures.length === 0 && matAdvantage === 0 && (
                <span className="text-[10px] text-zinc-500">
                  {isGameActive ? 'In match' : 'Ready to play'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Special Ability Button + Chess.com Digital Clock */}
        <div className="flex items-center gap-2">
          {!isBlackBar && mode === 'king_vs_100_pawns' && onSpecialAbility && (
            <button
              onClick={() => onSpecialAbility('cleave')}
              disabled={!canCleave || cleaveCooldown > 0}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${
                canCleave && cleaveCooldown === 0
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-lg shadow-amber-500/30 hover:brightness-110 active:scale-95'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Cleave {cleaveCooldown > 0 ? `(${cleaveCooldown})` : ''}</span>
            </button>
          )}

          {/* Chess.com Style Digital Clock Box */}
          <div
            className={`min-w-[88px] px-3 py-1.5 rounded-md font-mono font-bold text-lg tracking-tight flex items-center justify-between gap-2 transition-all ${
              !isGameActive
                ? 'bg-[#1c1b18] text-zinc-400 border border-white/5'
                : isLowTime && isTurn
                ? 'bg-[#b33430] text-white shadow-md animate-pulse'
                : isTurn
                ? isBlackBar
                  ? 'bg-[#21201d] text-white border border-white/25 shadow-md'
                  : 'bg-white text-zinc-900 shadow-md'
                : 'bg-[#1c1b18] text-zinc-500 border border-white/5'
            }`}
          >
            <Clock
              className={`w-4 h-4 ${
                isTurn ? (isBlackBar ? 'text-[#81b64c]' : 'text-zinc-800') : 'opacity-30'
              }`}
            />
            <span>{formatClock(clockSecs)}</span>
          </div>
        </div>
      </div>

      {/* Chess.com Style Bot Speech Bubble */}
      {isBlackBar && isAiOpponent && botQuote && (
        <div className="w-full px-2.5 py-1 rounded-md bg-[#fff8e7] text-zinc-900 text-[11px] font-semibold shadow-sm border border-amber-300/60 flex items-center gap-1.5 relative">
          <span className="text-amber-600 font-black">“</span>
          <span className="italic flex-1 leading-tight truncate">{botQuote}</span>
          <span className="text-amber-600 font-black">”</span>
        </div>
      )}
    </div>
    );
  };

  return (
    <div
      className="flex flex-col items-center select-none w-full gap-1.5 transition-all duration-150"
      style={{ maxWidth: `${boardSizePx}px` }}
    >
      {/* Top Player Bar (Opponent by default) */}
      {renderPlayerBar(topIsBlack)}

      {/* Editor Mode Active Banner */}
      {isEditingBoard && (
        <div className="w-full px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold">
            <Wand2 className="w-3.5 h-3.5" />
            BOARD EDITOR ACTIVE: Click any square on the board to place or remove pieces!
          </span>
        </div>
      )}

      {/* Chess.com Live Move Rating Callout Banner (Brilliant !!, Great !, Best ★, Blunder ??, etc.) */}
      {!isEditingBoard && lastMove?.ratingInfo && (
        <div
          className="w-full px-3 py-1.5 rounded-lg bg-[#1c1b18] border flex items-center justify-between gap-2 shadow-md transition-all"
          style={{ borderColor: `${lastMove.ratingInfo.color}66` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md shrink-0 border border-white/30"
              style={{ backgroundColor: lastMove.ratingInfo.color }}
            >
              {lastMove.ratingInfo.symbol}
            </span>
            <div className="min-w-0 flex items-center gap-1.5 flex-wrap text-xs">
              <span className="font-mono font-black text-white">
                {lastMove.san}
              </span>
              <span className="text-zinc-400">is</span>
              <span
                className="font-extrabold uppercase tracking-wide"
                style={{ color: lastMove.ratingInfo.color }}
              >
                {lastMove.ratingInfo.label}
              </span>
              <span className="text-[11px] text-zinc-400 hidden sm:inline truncate">
                — {lastMove.ratingInfo.reason}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#262522] text-zinc-200 shrink-0">
            Eval {lastMove.ratingInfo.evalAfter >= 0 ? `+${lastMove.ratingInfo.evalAfter}` : lastMove.ratingInfo.evalAfter}
          </span>
        </div>
      )}

      {/* Main Board + Evaluation Bar Row */}
      <div className="relative flex gap-2 w-full">
        {/* Chess.com Style Vertical Evaluation Bar */}
        <div className="w-6 rounded-md bg-[#403d39] overflow-hidden flex flex-col justify-end relative shadow-inner shrink-0">
          <div
            className="w-full bg-[#ECECEC] transition-all duration-300 ease-out"
            style={{ height: `${evalPercent}%` }}
          />
          <span
            className={`absolute left-0 right-0 text-center text-[9px] font-mono font-extrabold leading-none ${
              boardEval >= 0 ? 'bottom-1.5 text-zinc-900' : 'top-1.5 text-zinc-200'
            }`}
          >
            {evalFormatted}
          </span>
        </div>

        {/* The 8x8 Chess Grid */}
        <div
          ref={boardRef}
          className="relative aspect-square w-full rounded-md overflow-hidden shadow-2xl grid grid-cols-8 grid-rows-8"
        >
          {rows.map((r) =>
            cols.map((c) => {
              const isDark = (r + c) % 2 === 1;
              const squarePiece = board[r][c];
              const isSelected = selectedPos?.row === r && selectedPos?.col === c;
              const isLegalDest = legalDestinations.some((d) => d.row === r && d.col === c);
              const isPreviousMoveOrigin = lastMove?.from.row === r && lastMove?.from.col === c;
              const isPreviousMoveDest = lastMove?.to.row === r && lastMove?.to.col === c;
              const isKingChecked =
                (squarePiece?.type === 'k' || (mode === 'alien_mode' && squarePiece?.type === 'alien')) &&
                inCheck === squarePiece?.color;

              const isSourceOfAnimation =
                animatingMove &&
                animatingMove.from.row === r &&
                animatingMove.from.col === c;

              const isSelectedAlien =
                selectedPos && board[selectedPos.row][selectedPos.col]?.type === 'alien';

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`relative flex items-center justify-center transition-colors duration-100 ${
                    isDark ? THEME_SQUARES[boardTheme].dark : THEME_SQUARES[boardTheme].light
                  } ${
                    isPreviousMoveOrigin || isPreviousMoveDest
                      ? 'after:absolute after:inset-0 after:bg-[#f5f682]/55 after:pointer-events-none'
                      : ''
                  } ${
                    isSelected ? 'bg-[#b9ca43]' : ''
                  } ${isEditingBoard ? 'hover:ring-2 hover:ring-amber-400 cursor-crosshair' : ''}`}
                >
                  {/* Coordinate labels */}
                  {c === (flipped ? 7 : 0) && (
                    <span className="absolute top-0.5 left-1 text-[10px] font-bold opacity-80 pointer-events-none">
                      {8 - r}
                    </span>
                  )}
                  {r === (flipped ? 0 : 7) && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-bold opacity-80 pointer-events-none">
                      {String.fromCharCode(97 + c)}
                    </span>
                  )}

                  {/* King in Check Pulsing Glow */}
                  {isKingChecked && (
                    <div className="absolute inset-0 bg-red-600/65 rounded-sm animate-pulse z-0 pointer-events-none shadow-[0_0_20px_rgba(220,38,38,0.9)]" />
                  )}

                  {/* Landing Shockwave Burst (Alien Supernova or Capture Impact) */}
                  {landingBurst && landingBurst.row === r && landingBurst.col === c && (
                    <div
                      className={`absolute inset-0 z-20 rounded-full pointer-events-none animate-ping ${
                        landingBurst.isAlien
                          ? 'bg-fuchsia-500/50 border-4 border-cyan-300 shadow-[0_0_30px_#e879f9]'
                          : 'bg-amber-400/40 border-2 border-amber-300'
                      }`}
                    />
                  )}

                  {/* Piece on Square */}
                  {squarePiece && !isSourceOfAnimation && (
                    <div className="w-full h-full relative z-10">
                      <ChessPiece
                        piece={squarePiece}
                        isSelected={isSelected}
                        isUnderAttack={isLegalDest && !!squarePiece}
                      />
                    </div>
                  )}

                  {/* Chess.com On-Board Move Rating Badge (Brilliant !!, Great !, Best ★, Blunder ??, etc.) */}
                  {isPreviousMoveDest && lastMove?.ratingInfo && !animatingMove && (
                    <div
                      className="absolute top-0.5 right-0.5 z-30 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black text-white border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.65)] pointer-events-none animate-in zoom-in-75 duration-150"
                      style={{ backgroundColor: lastMove.ratingInfo.color }}
                      title={`${lastMove.san}: ${lastMove.ratingInfo.label} (${lastMove.ratingInfo.symbol}) — ${lastMove.ratingInfo.reason}`}
                    >
                      {lastMove.ratingInfo.symbol}
                    </div>
                  )}

                  {/* Move Destination Indicators */}
                  {isLegalDest && !squarePiece && (
                    <div
                      className={`absolute z-20 rounded-full pointer-events-none transition-transform ${
                        isSelectedAlien
                          ? 'w-3.5 h-3.5 bg-fuchsia-500/80 border border-cyan-300 shadow-[0_0_10px_#e879f9] animate-pulse'
                          : 'w-3.5 h-3.5 bg-black/25'
                      }`}
                    />
                  )}
                  {isLegalDest && squarePiece && (
                    <div
                      className={`absolute z-20 inset-0.5 rounded-full pointer-events-none ${
                        isSelectedAlien
                          ? 'border-4 border-fuchsia-500 shadow-[inset_0_0_12px_#22d3ee] animate-pulse'
                          : 'border-[5px] border-black/25'
                      }`}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* Alien Cosmic Laser Beam & Portal Vortex Overlay during Alien Movement */}
          {animatingMove && animatingMove.piece.type === 'alien' && (
            <>
              {/* Origin Wormhole Portal */}
              <div
                className="absolute z-20 pointer-events-none w-[12.5%] h-[12.5%] flex items-center justify-center"
                style={{
                  top: `${(flipped ? 7 - animatingMove.from.row : animatingMove.from.row) * 12.5}%`,
                  left: `${(flipped ? 7 - animatingMove.from.col : animatingMove.from.col) * 12.5}%`,
                }}
              >
                <div className="w-4/5 h-4/5 rounded-full border-2 border-cyan-400 bg-purple-600/40 animate-ping" />
              </div>

              {/* SVG Plasma Warp Beam connecting Origin to Destination */}
              <svg className="absolute inset-0 w-full h-full z-25 pointer-events-none">
                <defs>
                  <linearGradient id="alienWarpBeam" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#E879F9" stopOpacity="1" />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <line
                  x1={`${((flipped ? 7 - animatingMove.from.col : animatingMove.from.col) + 0.5) * 12.5}%`}
                  y1={`${((flipped ? 7 - animatingMove.from.row : animatingMove.from.row) + 0.5) * 12.5}%`}
                  x2={`${((flipped ? 7 - animatingMove.to.col : animatingMove.to.col) + 0.5) * 12.5}%`}
                  y2={`${((flipped ? 7 - animatingMove.to.row : animatingMove.to.row) + 0.5) * 12.5}%`}
                  stroke="url(#alienWarpBeam)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="animate-pulse"
                />
              </svg>
            </>
          )}

          {/* Smooth Gliding Piece Animation Overlay */}
          {animatingMove && (
            <div
              className={`absolute z-30 pointer-events-none w-[12.5%] h-[12.5%] transition-all ${
                animatingMove.piece.type === 'alien'
                  ? 'duration-[310ms] ease-[cubic-bezier(0.16,1,0.3,1)] scale-125'
                  : 'duration-[230ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] scale-105'
              }`}
              style={{
                top: `${(flipped
                  ? 7 - (animatingMove.animating ? animatingMove.to.row : animatingMove.from.row)
                  : (animatingMove.animating ? animatingMove.to.row : animatingMove.from.row)
                ) * 12.5}%`,
                left: `${(flipped
                  ? 7 - (animatingMove.animating ? animatingMove.to.col : animatingMove.from.col)
                  : (animatingMove.animating ? animatingMove.to.col : animatingMove.from.col)
                ) * 12.5}%`,
                filter:
                  animatingMove.piece.type === 'alien'
                    ? 'drop-shadow(0 0 22px rgba(232,121,249,1))'
                    : 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
              }}
            >
              <ChessPiece piece={animatingMove.piece} />
              {animatingMove.piece.type === 'alien' && (
                <div className="absolute -inset-1 rounded-full border-2 border-cyan-300 bg-fuchsia-500/30 animate-ping pointer-events-none" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Player Bar (You by default) */}
      {renderPlayerBar(!topIsBlack)}

      {/* Pawn Promotion Dialog Modal */}
      {promotionPending && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-amber-500/40 rounded-xl p-5 shadow-2xl flex flex-col items-center max-w-xs text-center">
            <h4 className="text-sm font-bold tracking-wide uppercase text-amber-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Promote Pawn
            </h4>
            <p className="text-xs text-zinc-400 mb-4">Choose a unit to promote your pawn:</p>
            <div className="grid grid-cols-4 gap-2 w-full">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map((promoType) => (
                <button
                  key={promoType}
                  onClick={() =>
                    executeMoveWithAnimation(
                      promotionPending.from,
                      promotionPending.to,
                      promotionPending.piece,
                      promoType
                    )
                  }
                  className="w-14 h-14 bg-zinc-900 border border-zinc-700 hover:border-amber-400 rounded-lg p-2 transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center"
                >
                  <ChessPiece
                    piece={{
                      id: `temp_promo_${promoType}`,
                      type: promoType,
                      color: promotionPending.piece.color,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
