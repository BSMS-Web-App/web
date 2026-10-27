import React from 'react';
import {
  Wrench,
  Sparkles,
  Trash2,
  Play,
  RotateCcw,
  Crown,
  Zap,
  Check,
  Wand2
} from 'lucide-react';
import {
  BoardGrid,
  PieceColor,
  PieceType,
  AlienMoveRule,
  CustomGameModeConfig
} from '../types/chess';
import { ChessPiece } from './ChessPiece';
import { createInitialBoard, createPiece } from '../utils/chessEngine';

export interface BrushSelection {
  type: PieceType | 'eraser';
  color: PieceColor;
}

interface CustomModeBuilderProps {
  isEditing: boolean;
  onToggleEditing: (editing: boolean) => void;
  selectedBrush: BrushSelection;
  onSelectBrush: (brush: BrushSelection) => void;
  draftName: string;
  onChangeDraftName: (name: string) => void;
  draftDesc: string;
  onChangeDraftDesc: (desc: string) => void;
  alienMoveRule: AlienMoveRule;
  onChangeAlienRule: (rule: AlienMoveRule) => void;
  allowRoyalCleave: boolean;
  onChangeRoyalCleave: (val: boolean) => void;
  acceleratingBlitz: boolean;
  onChangeAcceleratingBlitz: (val: boolean) => void;
  baseMinutes: number;
  onChangeBaseMinutes: (mins: number) => void;
  incrementSeconds: number;
  onChangeIncrementSeconds: (secs: number) => void;
  onApplyBoardPreset: (board: BoardGrid) => void;
  onSaveAndPlayCustom: () => void;
  savedCustomModes: CustomGameModeConfig[];
  onLoadSavedMode: (config: CustomGameModeConfig) => void;
  onDeleteSavedMode: (id: string) => void;
}

const PIECE_TYPES: { type: PieceType; label: string }[] = [
  { type: 'alien', label: 'Alien' },
  { type: 'k', label: 'King' },
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
  { type: 'p', label: 'Pawn' },
];

const createEmptyGrid = (): BoardGrid =>
  Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

export const CustomModeBuilder: React.FC<CustomModeBuilderProps> = ({
  isEditing,
  onToggleEditing,
  selectedBrush,
  onSelectBrush,
  draftName,
  onChangeDraftName,
  draftDesc,
  onChangeDraftDesc,
  alienMoveRule,
  onChangeAlienRule,
  allowRoyalCleave,
  onChangeRoyalCleave,
  acceleratingBlitz,
  onChangeAcceleratingBlitz,
  baseMinutes,
  onChangeBaseMinutes,
  incrementSeconds,
  onChangeIncrementSeconds,
  onApplyBoardPreset,
  onSaveAndPlayCustom,
  savedCustomModes,
  onLoadSavedMode,
  onDeleteSavedMode,
}) => {
  const applyPreset = (
    preset: 'clear' | 'classic' | 'alien_invasion' | 'queen_wars' | 'boss_raid'
  ) => {
    if (preset === 'clear') {
      const b = createEmptyGrid();
      b[0][4] = createPiece('k', 'b');
      b[7][4] = createPiece('alien', 'w');
      onApplyBoardPreset(b);
    } else if (preset === 'classic') {
      onApplyBoardPreset(createInitialBoard('classic'));
    } else if (preset === 'alien_invasion') {
      const b = createEmptyGrid();
      b[0][2] = createPiece('alien', 'b');
      b[0][4] = createPiece('k', 'b');
      b[0][6] = createPiece('alien', 'b');
      for (let c = 0; c < 8; c++) {
        b[1][c] = createPiece('p', 'b');
        b[6][c] = createPiece('p', 'w');
      }
      b[7][3] = createPiece('alien', 'w');
      b[7][4] = createPiece('k', 'w');
      onApplyBoardPreset(b);
    } else if (preset === 'queen_wars') {
      const b = createEmptyGrid();
      for (let c = 0; c < 8; c++) {
        b[0][c] = createPiece(c === 4 ? 'k' : 'q', 'b');
        b[7][c] = createPiece(c === 4 ? 'k' : 'q', 'w');
      }
      onApplyBoardPreset(b);
    } else if (preset === 'boss_raid') {
      const b = createInitialBoard('king_vs_100_pawns');
      b[7][3] = createPiece('alien', 'w');
      onApplyBoardPreset(b);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-fuchsia-950/60 via-[#15121e] to-[#11131a] border border-fuchsia-500/30 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-fuchsia-400" />
            <h3 className="text-sm font-bold text-white">Custom Gamemode Studio</h3>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Click squares on the Chess board to paint pieces &amp; design custom rules!
          </p>
        </div>

        <button
          onClick={() => onToggleEditing(!isEditing)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            isEditing
              ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
              : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
          }`}
        >
          {isEditing ? (
            <>
              <Check className="w-3.5 h-3.5" /> Editing Active
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" /> Paint Board
            </>
          )}
        </button>
      </div>

      {/* Piece Brush Palette */}
      <div className="bg-[#161821] border border-white/10 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            1. Select Piece Brush (Click Board Squares)
          </span>
          <div className="flex items-center gap-1">
            {(['w', 'b'] as PieceColor[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  onToggleEditing(true);
                  onSelectBrush({
                    type: selectedBrush.type === 'eraser' ? 'alien' : selectedBrush.type,
                    color: c,
                  });
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  selectedBrush.color === c && selectedBrush.type !== 'eraser'
                    ? 'bg-[#BB001E] text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {c === 'w' ? 'White Team' : 'Black Team'}
              </button>
            ))}
            <button
              onClick={() => {
                onToggleEditing(true);
                onSelectBrush({ type: 'eraser', color: selectedBrush.color });
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                selectedBrush.type === 'eraser'
                  ? 'bg-rose-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Erase Piece from Square"
            >
              <Trash2 className="w-3 h-3" /> Eraser
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {PIECE_TYPES.map((item) => {
            const active = selectedBrush.type === item.type && isEditing;
            return (
              <button
                key={item.type}
                onClick={() => {
                  onToggleEditing(true);
                  onSelectBrush({ type: item.type, color: selectedBrush.color });
                }}
                className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${
                  active
                    ? 'bg-fuchsia-500/20 border-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.3)] scale-105'
                    : 'bg-zinc-900/80 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="w-8 h-8">
                  <ChessPiece
                    piece={{
                      id: `brush-${item.type}-${selectedBrush.color}`,
                      type: item.type,
                      color: selectedBrush.color,
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-zinc-300 mt-1">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Board Templates */}
        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mr-1">
            Templates:
          </span>
          <button
            onClick={() => applyPreset('clear')}
            className="px-2 py-1 rounded bg-zinc-800/90 hover:bg-zinc-700 text-[11px] text-zinc-300 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> 1v1 Minimal
          </button>
          <button
            onClick={() => applyPreset('alien_invasion')}
            className="px-2 py-1 rounded bg-fuchsia-950/80 hover:bg-fuchsia-900/80 border border-fuchsia-500/30 text-[11px] text-fuchsia-200 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> Alien Invasion
          </button>
          <button
            onClick={() => applyPreset('queen_wars')}
            className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/30 text-[11px] text-amber-200"
          >
            8 Queens War
          </button>
          <button
            onClick={() => applyPreset('boss_raid')}
            className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-[11px] text-emerald-200"
          >
            King + Alien vs Swarm
          </button>
        </div>
      </div>

      {/* Custom Mechanics & Rules */}
      <div className="bg-[#161821] border border-white/10 rounded-xl p-3.5 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
          2. Configure Special Physics &amp; Rules
        </span>

        {/* Alien Move Rule */}
        <div>
          <label className="text-xs font-medium text-zinc-300 block mb-1.5">
            Alien Piece Movement Power
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              {
                id: 'everywhere' as AlienMoveRule,
                label: 'Move Everywhere',
                sub: 'All 64 Squares',
              },
              {
                id: 'unguarded_only' as AlienMoveRule,
                label: 'Safe Warp Only',
                sub: 'Unguarded Squares',
              },
              {
                id: 'queen_knight' as AlienMoveRule,
                label: 'Amazon Hybrid',
                sub: 'Queen + Knight',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onChangeAlienRule(opt.id)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  alienMoveRule === opt.id
                    ? 'bg-fuchsia-500/20 border-fuchsia-500 text-white'
                    : 'bg-zinc-900/70 border-white/5 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="text-[11px] font-bold leading-tight">{opt.label}</div>
                <div className="text-[9px] text-zinc-400 mt-0.5">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Rule Toggles */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onChangeRoyalCleave(!allowRoyalCleave)}
            className={`p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all ${
              allowRoyalCleave
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                : 'bg-zinc-900/60 border-white/5 text-zinc-400'
            }`}
          >
            <Crown className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <div className="text-xs font-bold">Royal Cleave King</div>
              <div className="text-[10px] opacity-80">
                White King unleashes 3x3 Shockwave Cleave
              </div>
            </div>
          </button>

          <button
            onClick={() => onChangeAcceleratingBlitz(!acceleratingBlitz)}
            className={`p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all ${
              acceleratingBlitz
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                : 'bg-zinc-900/60 border-white/5 text-zinc-400'
            }`}
          >
            <Zap className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div>
              <div className="text-xs font-bold">Overdrive Drain</div>
              <div className="text-[10px] opacity-80">
                Clocks drain faster every 5 turns
              </div>
            </div>
          </button>
        </div>

        {/* Time Settings */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-[11px] text-zinc-400 flex justify-between mb-1">
              <span>Clock Time</span>
              <span className="font-mono text-white font-bold">{baseMinutes} min</span>
            </label>
            <input
              type="range"
              min={1}
              max={60}
              value={baseMinutes}
              onChange={(e) => onChangeBaseMinutes(Number(e.target.value))}
              className="w-full accent-[#BB001E]"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 flex justify-between mb-1">
              <span>Increment</span>
              <span className="font-mono text-white font-bold">+{incrementSeconds}s</span>
            </label>
            <input
              type="range"
              min={0}
              max={30}
              value={incrementSeconds}
              onChange={(e) => onChangeIncrementSeconds(Number(e.target.value))}
              className="w-full accent-[#BB001E]"
            />
          </div>
        </div>
      </div>

      {/* Save & Launch */}
      <div className="bg-[#161821] border border-white/10 rounded-xl p-3.5 space-y-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
          3. Name &amp; Launch Custom Mode
        </span>
        <div className="grid grid-cols-1 gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => onChangeDraftName(e.target.value)}
            placeholder="Custom Mode Name (e.g., Galactic Overlord)"
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-fuchsia-500"
          />
          <input
            type="text"
            value={draftDesc}
            onChange={(e) => onChangeDraftDesc(e.target.value)}
            placeholder="Short description of rules..."
            className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 focus:outline-none focus:border-fuchsia-500"
          />
        </div>

        <button
          onClick={onSaveAndPlayCustom}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#BB001E] via-rose-600 to-fuchsia-600 hover:brightness-110 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 transition-all"
        >
          <Play className="w-4 h-4 fill-current" /> Save &amp; Play Custom Gamemode
        </button>
      </div>

      {/* Saved Custom Modes List */}
      {savedCustomModes.length > 0 && (
        <div className="bg-[#161821] border border-white/10 rounded-xl p-3.5 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
            Saved Custom Modes ({savedCustomModes.length})
          </span>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {savedCustomModes.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-white/5 hover:border-white/15"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-bold text-white truncate">{m.name}</div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    {m.baseMinutes}m+{m.incrementSeconds}s • Alien: {m.alienMoveRule}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onLoadSavedMode(m)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => onDeleteSavedMode(m.id)}
                    className="p-1 rounded bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
