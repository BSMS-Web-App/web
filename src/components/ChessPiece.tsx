import React from 'react';
import { Piece, PieceColor, PieceType } from '../types/chess';

interface ChessPieceProps {
  piece: Piece;
  isHovered?: boolean;
  isSelected?: boolean;
  isUnderAttack?: boolean;
  className?: string;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({
  piece,
  isHovered = false,
  isSelected = false,
  className = '',
}) => {
  const renderSVG = (type: PieceType, color: PieceColor) => {
    const isW = color === 'w';
    const primaryFill = isW ? '#F8FAFC' : '#1E1E24';
    const strokeColor = isW ? '#1E293B' : '#94A3B8';
    const highlightFill = isW ? '#FFFFFF' : '#334155';

    switch (type) {
      case 'p':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <path
              d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M21 11.5a1.5 1.5 0 0 1 3 0"
              stroke={highlightFill}
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        );

      case 'r':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <g
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
              <path d="M34 14l-3 3H14l-3-3" />
              <path d="M31 17v12.5H14V17" />
              <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
              <path d="M11 14h23" stroke={strokeColor} />
            </g>
          </svg>
        );

      case 'n':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <g
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
              <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
              <circle cx="9.5" cy="25.5" r="1.2" fill={isW ? '#0F172A' : '#F8FAFC'} />
              <path d="M15 15.5c3.31 1.05 4.87 3.99 4 7" fill="none" />
            </g>
          </svg>
        );

      case 'b':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <g
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
              <path d="M17.5 26h10M15 10h15" stroke={strokeColor} />
            </g>
          </svg>
        );

      case 'q':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <g
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
              <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-13.5V25l-7-11 2 12z" />
              <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
              <path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke={strokeColor} />
              <path d="M11 29a35 35 1 0 1 23 0" fill="none" stroke={strokeColor} />
            </g>
          </svg>
        );

      case 'k':
        return (
          <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]">
            <g
              fill={primaryFill}
              stroke={strokeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22.5 11.63V6M20 8h5" stroke={strokeColor} strokeWidth="2" />
              <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
              <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" />
              <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
            </g>
          </svg>
        );

      case 'alien':
        return (
          <div className="relative w-full h-full flex items-center justify-center alien-float-anim">
            {/* Outer Counter-Rotating Cosmic Ring */}
            <div className="absolute inset-0.5 rounded-full border border-dashed border-fuchsia-400/70 animate-spin pointer-events-none" style={{ animationDuration: '6s' }} />
            {/* Inner Cyan Plasma Ring */}
            <div className="absolute inset-1.5 rounded-full border border-cyan-400/60 animate-ping pointer-events-none" style={{ animationDuration: '2.4s' }} />

            <svg
              viewBox="0 0 45 45"
              className="w-full h-full filter drop-shadow-[0_0_10px_rgba(192,132,252,0.95)]"
            >
              <defs>
                <radialGradient id="alienCore" cx="50%" cy="42%" r="55%">
                  <stop offset="0%" stopColor="#E879F9" />
                  <stop offset="55%" stopColor="#9333EA" />
                  <stop offset="100%" stopColor="#3B0764" />
                </radialGradient>
                <linearGradient id="cyberEye" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#67E8F9" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>

              {/* Hovering UFO / Grav-Thruster Base */}
              <ellipse
                cx="22.5"
                cy="39"
                rx="12"
                ry="3"
                fill="url(#cyberEye)"
                opacity="0.75"
              />
              <path
                d="M11 37.5c4-2.5 19-2.5 23 0l-2 2.5H13l-2-2.5z"
                fill="#1E1B4B"
                stroke="#67E8F9"
                strokeWidth="1.3"
              />

              {/* Extraterrestrial Cranium & Armor Crest */}
              <path
                d="M11.5 20 C9 11, 14 5, 22.5 5 C31 5, 36 11, 33.5 20 C31.5 28, 26 35, 22.5 35 C19 35, 13.5 28, 11.5 20 Z"
                fill="url(#alienCore)"
                stroke="#F5D0FE"
                strokeWidth="1.5"
              />

              {/* Telepathic Crown Horns */}
              <path d="M15 6 L12 1.5 L18.5 5" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M22.5 4.5 L22.5 0.5" stroke="#F472B6" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M30 6 L33 1.5 L26.5 5" stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round" />

              {/* Glowing Bio-Luminescent Eyes */}
              <ellipse
                cx="17.2"
                cy="18.5"
                rx="3.8"
                ry="5.8"
                transform="rotate(-16 17.2 18.5)"
                fill="url(#cyberEye)"
                stroke="#CFFAFE"
                strokeWidth="0.8"
              />
              <ellipse
                cx="27.8"
                cy="18.5"
                rx="3.8"
                ry="5.8"
                transform="rotate(16 27.8 18.5)"
                fill="url(#cyberEye)"
                stroke="#CFFAFE"
                strokeWidth="0.8"
              />

              {/* Slit Pupils */}
              <ellipse cx="17.2" cy="18.5" rx="1.1" ry="3.4" fill="#083344" />
              <ellipse cx="27.8" cy="18.5" rx="1.1" ry="3.4" fill="#083344" />

              {/* Third-Eye Psionic Gem */}
              <polygon points="22.5,8.5 25.2,12 22.5,15.5 19.8,12" fill="#FDE047" stroke="#FEF08A" strokeWidth="0.6" />
            </svg>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center select-none cursor-pointer p-1 transition-transform duration-150 ${
        isSelected ? 'scale-110 drop-shadow-[0_0_14px_rgba(250,204,21,0.85)]' : ''
      } ${isHovered ? 'scale-105' : ''} ${className}`}
    >
      {renderSVG(piece.type, piece.color)}
      <style>{`
        @keyframes alienFloat {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-3px) scale(1.04); }
        }
        .alien-float-anim {
          animation: alienFloat 2.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
