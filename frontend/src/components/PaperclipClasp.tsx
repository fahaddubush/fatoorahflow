import React, { useId } from 'react';

export type ClipVariantIndex = 0 | 1 | 2;
export type LightClipStyle = 'vintage-brass' | 'geometric-brass' | 'antique-copper';
export type DarkClipStyle = 'gunmetal-steel' | 'matte-black' | 'smoky-bronze';
export type ClipStyle = LightClipStyle | DarkClipStyle;
export type ClipVariant = ClipVariantIndex | ClipStyle;

export const LIGHT_VARIANTS: readonly LightClipStyle[] = [
  'vintage-brass',
  'geometric-brass',
  'antique-copper',
] as const;

export const DARK_VARIANTS: readonly DarkClipStyle[] = [
  'gunmetal-steel',
  'matte-black',
  'smoky-bronze',
] as const;

/**
 * Returns available variant indices [0, 1, 2] for the given theme.
 */
export function getThemeClipVariants(theme: 'light' | 'dark'): [0, 1, 2] {
  return theme === 'dark' ? [0, 1, 2] : [0, 1, 2];
}

/**
 * Returns a random variant index from 0 to 2.
 */
export function getRandomClipVariant(): 0 | 1 | 2 {
  return Math.floor(Math.random() * 3) as 0 | 1 | 2;
}

/**
 * Resolves any variant input (number 0-2 or style name) and theme into exact variant index & style name.
 */
export function resolveClipVariant(
  variant: ClipVariant | undefined,
  theme: 'light' | 'dark'
): { index: ClipVariantIndex; style: ClipStyle } {
  if (variant === undefined) {
    const idx: ClipVariantIndex = 0;
    return {
      index: idx,
      style: theme === 'dark' ? DARK_VARIANTS[idx] : LIGHT_VARIANTS[idx],
    };
  }

  if (typeof variant === 'number') {
    const idx = (Math.abs(Math.floor(variant)) % 3) as ClipVariantIndex;
    return {
      index: idx,
      style: theme === 'dark' ? DARK_VARIANTS[idx] : LIGHT_VARIANTS[idx],
    };
  }

  const lightIdx = LIGHT_VARIANTS.indexOf(variant as LightClipStyle);
  if (lightIdx !== -1) {
    const idx = lightIdx as ClipVariantIndex;
    return {
      index: idx,
      style: theme === 'dark' ? DARK_VARIANTS[idx] : (variant as LightClipStyle),
    };
  }

  const darkIdx = DARK_VARIANTS.indexOf(variant as DarkClipStyle);
  if (darkIdx !== -1) {
    const idx = darkIdx as ClipVariantIndex;
    return {
      index: idx,
      style: theme === 'light' ? LIGHT_VARIANTS[idx] : (variant as DarkClipStyle),
    };
  }

  return {
    index: 0,
    style: theme === 'dark' ? DARK_VARIANTS[0] : LIGHT_VARIANTS[0],
  };
}

interface ClipGeometry {
  rearPath: string;
  frontPath: string;
}

/**
 * SVG wire geometry paths designed on a 0 0 60 120 viewBox.
 * The top paper edge aligns precisely at Y = 28.
 * Above Y = 28, the wire crowns arch in air.
 * Below Y = 28, the paper physically sandwiches between rear (z:1) and front (z:20).
 */
const CLIP_GEOMETRIES: Record<ClipVariantIndex, ClipGeometry> = {
  // 0: Classic Gem Wire (vintage-brass / gunmetal-steel)
  0: {
    rearPath: 'M 16 88 L 16 20 C 16 6, 44 6, 44 20 L 44 100 C 44 114, 24 114, 24 100 L 24 20',
    frontPath: 'M 24 20 C 24 11, 36 11, 36 20 L 36 74 C 36 82, 27 82, 27 74 L 27 44',
  },
  // 1: Midori Architectural Triangular Clasp (geometric-brass / matte-black)
  1: {
    rearPath: 'M 15 82 L 15 24 L 30 7 L 45 24 L 45 96 L 30 110 L 22 96 L 22 22',
    frontPath: 'M 22 22 L 30 13 L 38 22 L 38 42 L 30 74 L 22 42',
  },
  // 2: Antique Copper Teardrop / Pear Clasp (antique-copper / smoky-bronze)
  2: {
    rearPath: 'M 17 78 C 17 50, 21 24, 25 18 C 27 7, 33 7, 35 18 C 39 24, 47 52, 47 80 C 47 112, 23 112, 23 88 C 23 60, 24 30, 24 20',
    frontPath: 'M 24 20 C 26 12, 34 12, 36 20 C 38 32, 40 54, 38 68 C 36 78, 25 78, 25 68 C 25 58, 26 48, 27 40',
  },
};

interface StyleColorDef {
  stops: { offset: string; color: string; opacity?: number }[];
  highlight: string;
  wireWidth: number;
}

const CLIP_PALETTES: Record<ClipStyle, StyleColorDef> = {
  'vintage-brass': {
    stops: [
      { offset: '0%', color: '#FFF6D6' },
      { offset: '18%', color: '#F7DC6F' },
      { offset: '38%', color: '#D4AF37' },
      { offset: '62%', color: '#AA7C1E' },
      { offset: '82%', color: '#7A520E' },
      { offset: '100%', color: '#462F05' },
    ],
    highlight: 'rgba(255, 255, 240, 0.65)',
    wireWidth: 3.2,
  },
  'geometric-brass': {
    stops: [
      { offset: '0%', color: '#FFFDE8' },
      { offset: '20%', color: '#F9E79F' },
      { offset: '42%', color: '#E5B842' },
      { offset: '65%', color: '#B7950B' },
      { offset: '85%', color: '#7D6608' },
      { offset: '100%', color: '#4E3E04' },
    ],
    highlight: 'rgba(255, 255, 255, 0.75)',
    wireWidth: 3.2,
  },
  'antique-copper': {
    stops: [
      { offset: '0%', color: '#FDEBD0' },
      { offset: '18%', color: '#F5CBA7' },
      { offset: '40%', color: '#E59866' },
      { offset: '65%', color: '#DC7633' },
      { offset: '85%', color: '#BA4A00' },
      { offset: '100%', color: '#6E2C00' },
    ],
    highlight: 'rgba(255, 240, 235, 0.65)',
    wireWidth: 3.2,
  },
  'gunmetal-steel': {
    stops: [
      { offset: '0%', color: '#EAEDED' },
      { offset: '20%', color: '#BDC3C7' },
      { offset: '45%', color: '#7F8C8D' },
      { offset: '70%', color: '#34495E' },
      { offset: '88%', color: '#212F3D' },
      { offset: '100%', color: '#17202A' },
    ],
    highlight: 'rgba(230, 240, 250, 0.5)',
    wireWidth: 3.2,
  },
  'matte-black': {
    stops: [
      { offset: '0%', color: '#626567' },
      { offset: '22%', color: '#424949' },
      { offset: '50%', color: '#262626' },
      { offset: '75%', color: '#171717' },
      { offset: '100%', color: '#0A0A0A' },
    ],
    highlight: 'rgba(255, 255, 255, 0.22)',
    wireWidth: 3.2,
  },
  'smoky-bronze': {
    stops: [
      { offset: '0%', color: '#E0D5CE' },
      { offset: '20%', color: '#BCAAA4' },
      { offset: '45%', color: '#8D6E63' },
      { offset: '70%', color: '#5D4037' },
      { offset: '88%', color: '#3E2723' },
      { offset: '100%', color: '#1E120D' },
    ],
    highlight: 'rgba(245, 235, 225, 0.45)',
    wireWidth: 3.2,
  },
};

export interface PaperclipWireProps {
  part: 'front' | 'rear';
  variant?: ClipVariant;
  theme?: 'light' | 'dark';
  width?: number;
  height?: number;
  idPrefix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const PaperclipWire: React.FC<PaperclipWireProps> = ({
  part,
  variant = 0,
  theme,
  width = 38,
  height = 76,
  idPrefix,
  className,
  style,
}) => {
  const generatedId = useId().replace(/[:]/g, '_');
  const uid = idPrefix ? `${idPrefix}_${generatedId}` : generatedId;

  const activeTheme: 'light' | 'dark' =
    theme ??
    (typeof document !== 'undefined' &&
    document.documentElement.dataset.theme === 'dark'
      ? 'dark'
      : 'light');

  const { index, style: clipStyle } = resolveClipVariant(variant, activeTheme);
  const geometry = CLIP_GEOMETRIES[index];
  const palette = CLIP_PALETTES[clipStyle];

  const pathData = part === 'front' ? geometry.frontPath : geometry.rearPath;
  const isDark = activeTheme === 'dark';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        display: 'block',
        overflow: 'visible',
        ...style,
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Metallic linear gradient along the wire */}
        <linearGradient
          id={`metal-grad-${uid}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          {palette.stops.map((s, i) => (
            <stop
              key={i}
              offset={s.offset}
              stopColor={s.color}
              stopOpacity={s.opacity ?? 1}
            />
          ))}
        </linearGradient>

        {/* Realistic subtle cast shadow for front wire falling onto paper children */}
        {part === 'front' && (
          <filter
            id={`front-shadow-${uid}`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            {/* Primary soft cast shadow */}
            <feDropShadow
              dx="0.8"
              dy="2.4"
              stdDeviation="1.8"
              floodColor={isDark ? '#000000' : '#2A1808'}
              floodOpacity={isDark ? 0.72 : 0.36}
            />
            {/* Secondary crisp contact ambient occlusion */}
            <feDropShadow
              dx="0.3"
              dy="0.8"
              stdDeviation="0.6"
              floodColor={isDark ? '#000000' : '#1A0E04'}
              floodOpacity={isDark ? 0.5 : 0.28}
            />
          </filter>
        )}

        {/* Ambient shadow for rear wire when visible above paper */}
        {part === 'rear' && (
          <filter
            id={`rear-shadow-${uid}`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feDropShadow
              dx="0.4"
              dy="1.2"
              stdDeviation="1.2"
              floodColor="#000000"
              floodOpacity={isDark ? 0.35 : 0.18}
            />
          </filter>
        )}
      </defs>

      {/* Main wire body with metallic gradient */}
      <path
        d={pathData}
        stroke={`url(#metal-grad-${uid})`}
        strokeWidth={palette.wireWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={part === 'front' ? `url(#front-shadow-${uid})` : undefined}
      />

      {/* Specular cylindrical highlight along wire ridge */}
      <path
        d={pathData}
        stroke={palette.highlight}
        strokeWidth={1.0}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-0.35, -0.35)"
        style={{ mixBlendMode: isDark ? 'screen' : 'overlay' }}
      />
    </svg>
  );
};

export interface PaperclipClaspProps {
  children?: React.ReactNode;
  variant?: ClipVariant;
  theme?: 'light' | 'dark';
  position?: 'top-right' | 'top-left' | 'top-center' | 'none';
  tilt?: number; // rotation in degrees, e.g. -4 to +6
  size?: 'sm' | 'md' | 'lg' | number;
  offset?: { x?: number | string; y?: number | string };
  isRtl?: boolean;
  standalone?: boolean;
  className?: string;
  contentClassName?: string;
  claspClassName?: string;
  ariaLabel?: string;
}

/**
 * PaperclipClasp physically sandwiches paper children:
 * - Rear loop (back wire) sits behind children at z-index: 1
 * - The paper children sit at z-index: 10
 * - Front loop (front wire) sits on top of children at z-index: 20 with subtle realistic cast shadow
 */
export const PaperclipClasp: React.FC<PaperclipClaspProps> = ({
  children,
  variant = 0,
  theme,
  position = 'top-right',
  tilt = 0,
  size = 'md',
  offset,
  isRtl = false,
  standalone = false,
  className = '',
  contentClassName = '',
  claspClassName = '',
  ariaLabel,
}) => {
  let width = 38;
  let height = 76;
  if (typeof size === 'number') {
    if (size <= 5) {
      width = Math.round(38 * size);
      height = Math.round(76 * size);
    } else {
      width = Math.round(size);
      height = Math.round(size * 2);
    }
  } else if (size === 'sm') {
    width = 28;
    height = 56;
  } else if (size === 'lg') {
    width = 48;
    height = 96;
  }

  // In the 0 0 60 120 viewBox, the top edge of paper sits at Y = 28.
  // The top overlap amount is (28 / 120) * height.
  const topOverlap = Math.round((28 / 120) * height);

  const effectivePosition =
    position === 'top-right' && isRtl
      ? 'top-left'
      : position === 'top-left' && isRtl
      ? 'top-right'
      : position;

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    top: offset?.y !== undefined ? offset.y : -topOverlap,
    transform: `rotate(${tilt}deg)`,
    transformOrigin: `50% ${topOverlap}px`,
  };

  if (effectivePosition === 'top-right') {
    positionStyle.right = offset?.x !== undefined ? offset.x : 28;
  } else if (effectivePosition === 'top-left') {
    positionStyle.left = offset?.x !== undefined ? offset.x : 28;
  } else if (effectivePosition === 'top-center') {
    positionStyle.left = '50%';
    positionStyle.marginLeft = -Math.round(width / 2);
    if (offset?.x !== undefined) {
      positionStyle.left = offset.x;
    }
  }

  // Standalone or without children: render composite clasp
  if (standalone || !children) {
    return (
      <div
        className={`relative inline-block select-none pointer-events-none ${className}`}
        style={{
          width,
          height,
          transform: `rotate(${tilt}deg)`,
          transformOrigin: `50% ${topOverlap}px`,
        }}
        aria-label={ariaLabel ?? 'Paperclip Clasp'}
        role="img"
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <PaperclipWire
            part="rear"
            variant={variant}
            theme={theme}
            width={width}
            height={height}
            className={claspClassName}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <PaperclipWire
            part="front"
            variant={variant}
            theme={theme}
            width={width}
            height={height}
            className={claspClassName}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${className}`}
      aria-label={ariaLabel}
    >
      {/* 1. Rear loop (back wire) sits behind children at z-index: 1 */}
      <div
        className={`pointer-events-none select-none ${claspClassName}`}
        style={{
          ...positionStyle,
          zIndex: 1,
        }}
        aria-hidden="true"
      >
        <PaperclipWire
          part="rear"
          variant={variant}
          theme={theme}
          width={width}
          height={height}
        />
      </div>

      {/* 2. Paper children sit at z-index: 10 */}
      <div
        className={`relative ${contentClassName}`}
        style={{ zIndex: 10 }}
      >
        {children}
      </div>

      {/* 3. Front loop (front wire) sits on top of children at z-index: 20 with subtle realistic cast shadow */}
      <div
        className={`pointer-events-none select-none ${claspClassName}`}
        style={{
          ...positionStyle,
          zIndex: 20,
        }}
        aria-hidden="true"
      >
        <PaperclipWire
          part="front"
          variant={variant}
          theme={theme}
          width={width}
          height={height}
        />
      </div>
    </div>
  );
};

export interface PaperclipClaspPartProps {
  variant?: ClipVariant;
  theme?: 'light' | 'dark';
  width?: number;
  height?: number;
  tilt?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const PaperclipClaspRear: React.FC<PaperclipClaspPartProps> = ({
  variant = 0,
  theme,
  width = 38,
  height = 76,
  tilt = 0,
  className,
  style,
}) => {
  const topOverlap = Math.round((28 / 120) * height);
  return (
    <div
      className={`pointer-events-none select-none ${className ?? ''}`}
      style={{
        zIndex: 1,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        transformOrigin: `50% ${topOverlap}px`,
        ...style,
      }}
      aria-hidden="true"
    >
      <PaperclipWire
        part="rear"
        variant={variant}
        theme={theme}
        width={width}
        height={height}
      />
    </div>
  );
};

export const PaperclipClaspFront: React.FC<PaperclipClaspPartProps> = ({
  variant = 0,
  theme,
  width = 38,
  height = 76,
  tilt = 0,
  className,
  style,
}) => {
  const topOverlap = Math.round((28 / 120) * height);
  return (
    <div
      className={`pointer-events-none select-none ${className ?? ''}`}
      style={{
        zIndex: 20,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        transformOrigin: `50% ${topOverlap}px`,
        ...style,
      }}
      aria-hidden="true"
    >
      <PaperclipWire
        part="front"
        variant={variant}
        theme={theme}
        width={width}
        height={height}
      />
    </div>
  );
};

export default PaperclipClasp;
