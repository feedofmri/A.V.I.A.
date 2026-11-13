import type { Status } from '../lib/status';

interface WaveLineProps {
  amplitude?: number;
  color?: string;
  variant?: 'gentle' | 'sharp' | 'arc' | 'flat';
  height?: number;
  opacity?: number;
  status?: Status;
  showBorder?: boolean;
  blur?: number;
}

const LINE_PATHS: Record<string, string> = {
  gentle:
    'M0 28 C15 28, 20 12, 40 18 C60 24, 65 8, 90 14 C115 20, 125 4, 150 10 C175 16, 185 6, 200 8',
  sharp:
    'M0 30 C10 30, 15 6, 30 16 C45 26, 50 4, 70 12 C90 20, 100 2, 120 10 C140 18, 155 5, 180 10 C195 13, 198 8, 200 8',
  arc:
    'M0 36 Q50 36 80 20 Q120 2 160 20 Q185 32 200 30',
  flat:
    'M0 20 C40 20, 60 18, 100 22 C140 26, 160 18, 200 20',
};

const AREA_PATHS: Record<string, string> = {
  gentle:
    'M0 28 C15 28, 20 12, 40 18 C60 24, 65 8, 90 14 C115 20, 125 4, 150 10 C175 16, 185 6, 200 8 L200 40 L0 40 Z',
  sharp:
    'M0 30 C10 30, 15 6, 30 16 C45 26, 50 4, 70 12 C90 20, 100 2, 120 10 C140 18, 155 5, 180 10 C195 13, 198 8, 200 8 L200 40 L0 40 Z',
  arc:
    'M0 36 Q50 36 80 20 Q120 2 160 20 Q185 32 200 30 L200 40 L0 40 Z',
  flat:
    'M0 20 C40 20, 60 18, 100 22 C140 26, 160 18, 200 20 L200 40 L0 40 Z',
};

export function WaveLine({
  variant = 'gentle',
  height = 40,
  opacity = 0.5,
  status = 'nominal',
  showBorder = false,
  blur = 14,
}: WaveLineProps) {
  const gradientId = `wave-grad-${variant}-${status}`;

  // Gradient colors depending on card status
  const isWarn = status === 'warning';
  const isCrit = status === 'critical';

  const topColor = isCrit
    ? 'rgba(255, 92, 108, 0.40)'
    : isWarn
    ? 'rgba(245, 185, 74, 0.35)'
    : 'rgba(20, 52, 147, 0.42)';

  const bottomColor = isCrit
    ? 'rgba(255, 92, 108, 0.02)'
    : isWarn
    ? 'rgba(245, 185, 74, 0.02)'
    : 'rgba(20, 52, 147, 0.02)';

  return (
    <svg
      viewBox="0 0 200 40"
      width="100%"
      height={height}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      style={{
        opacity,
        display: 'block',
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        transform: blur > 0 ? 'scale(1.12)' : undefined,
        transformOrigin: 'bottom center',
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={topColor} />
          <stop offset="100%" stopColor={bottomColor} />
        </linearGradient>
      </defs>

      {/* Smooth filled gradient wave with soft blurry glow */}
      <path
        d={AREA_PATHS[variant]}
        fill={`url(#${gradientId})`}
        stroke="none"
      />

      {/* Only show line if explicitly requested */}
      {showBorder && (
        <path
          d={LINE_PATHS[variant]}
          stroke={topColor}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
