/**
 * Generates a deterministic color for a user avatar based on their unique identifier
 * Uses a simple hash that creates better distribution for UUIDs
 */

import chroma from 'chroma-js';

export interface ColorBand {
  start: number;
  end: number;
}

export interface AvatarColorConfig {
  excludedBands?: ColorBand[];
  minColorDistance?: number;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Default color configuration
 * Excludes certain problematic color ranges and ensures minimum spacing
 */
const DEFAULT_CONFIG: AvatarColorConfig = {
  excludedBands: [],
  minColorDistance: 0, // Use all hues for maximum distinctness
};

// HSL Saturation range (0-100): lower = more muted/gray, higher = more vibrant
const SATURATION_MIN = 0;
const SATURATION_MAX = 130;

// HSL Lightness range (0-100): lower = darker, higher = lighter
const LIGHTNESS_MIN = 25;
const LIGHTNESS_MAX = 70;

// LCH Chroma range (0-130+): lower = more gray/muted, higher = more vibrant/rich
// Recommended ranges: 20-40 (muted), 40-60 (medium), 60-80 (vibrant)
// For "dusty pink" vs "barbie pink": keep chroma 15-30
// Lower values avoid gamut issues at darker lightness levels
export const LCH_CHROMA_MIN = 0;
export const LCH_CHROMA_MAX = 51;

// LCH Lightness range (0-100): lower = darker, higher = lighter
// Recommended ranges: 40-60 (dark), 50-70 (medium), 60-80 (light)
// Wide range for distinctness while keeping muted colors
// Starting at 40 avoids most gamut issues
export const LCH_LIGHTNESS_MIN = 30;
export const LCH_LIGHTNESS_MAX = 56;

// New "vibrant then filter" approach settings
// HSL Lightness range for base vibrant colors (0-100)
export const VIBRANT_LIGHTNESS_MIN = 45;
export const VIBRANT_LIGHTNESS_MAX = 80;
// HSL Saturation for base vibrant colors (0-100)
export const VIBRANT_SATURATION = 60;
// Desaturation amount: 0=vibrant, 1=fully gray (0-1)
export const DESATURATION_AMOUNT = 0.6;

// Predefined color palette approach
// Curated colors for sophisticated, understated avatar backgrounds
export const COLOR_PALETTE = [
  '#01637D',
  '#0273A7',
  '#282D3C',
  '#2A2B2D',
  '#2C2E44',
  '#2F2D30',
  '#3B5488',
  '#424832',
  '#4B6D42',
  '#594743',
  '#595F34',
  '#6B2831',
  '#6F789B',
  '#706C70',
  '#78202E',
  '#838182',
  '#CEBB7A',
  '#D46331',
  '#A3155C',
  '#C3A749',
] as const;

/**
 * New palette-based approach: Maps userId to a color from predefined palette
 * This ensures all colors are curated and visually appealing
 */
export function getAvatarColorPalette(userId: string): string {
  const hash = simpleHash(userId);
  const colorIndex = hash % COLOR_PALETTE.length;
  return COLOR_PALETTE[colorIndex];
}

/**
 * Sophisticated generative algorithm inspired by the COLOR_PALETTE
 * Generates colors that match the aesthetic of the curated palette:
 * - Sophisticated and understated (not bright or garish)
 * - Rich depth with variety (dark to medium tones)
 * - Muted but not washed out (controlled chroma)
 *
 * LCH ranges derived from analyzing COLOR_PALETTE (20 colors):
 * - Lightness: 18-76 (median: 37.4, avg: 39.0) - darker palette
 * - Chroma: 1-64 (median: 25.8, avg: 25.4) - muted to rich
 * - Hue: Full spectrum (360 degrees)
 *
 * Algorithm uses median-centered ranges for authentic palette feel
 */
export function getAvatarColorSophisticated(userId: string): string {
  const hash = simpleHash(userId);

  // Hue: Full spectrum for maximum distinctness
  const hue = hash % 360;

  // Lightness: 18-76 range (captures full palette)
  // Centered around median of 37.4, favoring darker, sophisticated tones
  const LIGHTNESS_MIN = 18;
  const LIGHTNESS_MAX = 76;
  const lightnessHash = (hash ^ (hash >> 8)) & 0xffff;
  const lightnessRange = LIGHTNESS_MAX - LIGHTNESS_MIN;
  const lightness = LIGHTNESS_MIN + (lightnessHash / 65535) * lightnessRange;

  // Chroma: 1-64 range (muted to moderately saturated)
  // Centered around median of 25.8, avoiding both pure grays and neon
  const CHROMA_MIN = 1;
  const CHROMA_MAX = 64;
  const chromaHash = (hash ^ (hash >> 16)) & 0xffff;
  const chromaRange = CHROMA_MAX - CHROMA_MIN;
  const chromaValue = CHROMA_MIN + (chromaHash / 65535) * chromaRange;

  try {
    const color = chroma.lch(lightness, chromaValue, hue);
    // chroma.css() automatically clips out-of-gamut colors
    return color.css();
  } catch (e) {
    // Fallback to median values from palette analysis
    return chroma.lch(37, 26, hue).css();
  }
}

/**
 * Check if a hue falls within any excluded band
 */
function isHueExcluded(hue: number, excludedBands: ColorBand[]): boolean {
  return excludedBands.some((band) => hue >= band.start && hue <= band.end);
}

/**
 * Generate valid hues that respect excluded bands and minimum distance
 * This creates a reduced set of allowed hues for better distribution
 */
function getValidHues(config: AvatarColorConfig = DEFAULT_CONFIG): number[] {
  const validHues: number[] = [];
  const excludedBands = config.excludedBands || [];
  const minDistance = config.minColorDistance || 0;

  let lastHue = -minDistance;

  for (let hue = 0; hue < 360; hue++) {
    if (!isHueExcluded(hue, excludedBands) && hue - lastHue >= minDistance) {
      validHues.push(hue);
      lastHue = hue;
    }
  }

  return validHues;
}

/**
 * Generate a single HSL color based on user ID only
 * Uses only userId for consistent colors across the app
 * Optionally accepts a configuration to exclude certain hue ranges or enforce minimum spacing
 */
export function getAvatarColor(
  userId: string,
  config: AvatarColorConfig = DEFAULT_CONFIG,
): string {
  const originalHash = simpleHash(userId);
  let hash = originalHash;

  // Get valid hues based on configuration
  const validHues = getValidHues(config);
  const hue =
    validHues.length > 0 ? validHues[hash % validHues.length] : hash % 360;

  // Generate saturation from hash within constrained range
  hash = Math.floor(hash / 360);
  const saturationRange = SATURATION_MAX - SATURATION_MIN;
  const saturation = SATURATION_MIN + (hash % saturationRange);

  // Generate lightness from hash within constrained range
  hash = Math.floor(hash / saturationRange);
  const lightnessRange = LIGHTNESS_MAX - LIGHTNESS_MIN;
  const lightness = LIGHTNESS_MIN + (hash % lightnessRange);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Generate a perceptually uniform color using LCH color space
 * LCH ensures equal hue differences look equally distinct to human eyes
 *
 * LCH parameters:
 * - L (Lightness): 0-100, similar to HSL lightness
 * - C (Chroma): 0-150+, similar to saturation (how colorful)
 * - H (Hue): 0-360, color wheel position
 */
export function getAvatarColorLCH(userId: string): string {
  // Use sophisticated generative algorithm
  return getAvatarColorSophisticated(userId);
}

/**
 * Legacy algorithmic approach (kept for reference/testing)
 * Generates colors using vibrant base + desaturation filter
 */
export function getAvatarColorAlgorithmic(userId: string): string {
  const originalHash = simpleHash(userId);
  const hue = originalHash % 360;

  // New approach: Start with vibrant colors, then apply desaturation filter
  // This avoids gamut issues while maintaining distinctness
  const lightnessHash = (originalHash ^ (originalHash >> 8)) & 0xffff;
  const lightnessRange = VIBRANT_LIGHTNESS_MAX - VIBRANT_LIGHTNESS_MIN;
  const lightness =
    VIBRANT_LIGHTNESS_MIN + (lightnessHash / 65535) * lightnessRange;

  try {
    // Create vibrant base color (always in gamut since we use HSL)
    const vibrantColor = chroma.hsl(
      hue,
      VIBRANT_SATURATION / 100,
      lightness / 100,
    );

    // Apply desaturation filter by mixing with gray
    // Higher value = more muted (0=vibrant, 1=fully gray)
    const gray = chroma.hsl(hue, 0, lightness / 100);
    const mutedColor = chroma.mix(
      vibrantColor,
      gray,
      DESATURATION_AMOUNT,
      'lch',
    );

    // chroma.css() automatically clips out-of-gamut colors
    return mutedColor.css();
  } catch (e) {
    // Fallback to simple muted HSL
    return `hsl(${hue}, 20%, 50%)`;
  }
}

/**
 * Original HSL approach with S/L bands (for comparison)
 * This was the original implementation before switching to LCH
 */
export function getAvatarColorHSLOriginal(userId: string): string {
  const originalHash = simpleHash(userId);
  let hash = originalHash;

  // Use a large prime modulo for better hue distribution
  const hue = hash % 359;

  // Saturation and lightness arrays - creates discrete color buckets
  const saturationValues = [0.1, 0.3, 0.45];
  const lightnessValues = [0.4, 0.5, 0.65];

  // Use different parts of hash for S and L selection
  hash = Math.ceil(hash / 360);
  const saturation = saturationValues[hash % saturationValues.length];
  hash = Math.ceil(hash / saturationValues.length);
  const lightness = lightnessValues[hash % lightnessValues.length];

  return `hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`;
}

/**
 * Generate a gradient background for avatars
 * Creates two harmonious colors for a subtle gradient effect
 */
export function getAvatarGradient(userId: string): string {
  const hash = simpleHash(userId);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 30) % 360; // Offset by 30 degrees for complementary color

  return `linear-gradient(135deg, hsl(${hue1}, 60%, 45%), hsl(${hue2}, 60%, 55%))`;
}

/**
 * Generate a soft LCH gradient for avatars
 * Creates a subtle gradient using perceptually uniform colors
 * Options for gradient type: 'monochrome' (same hue) or 'analogous' (nearby hues)
 */
export function getAvatarGradientLCH(
  userId: string,
  type: 'monochrome' | 'analogous' = 'monochrome',
  config: AvatarColorConfig = DEFAULT_CONFIG,
): string {
  const originalHash = simpleHash(userId);
  let hash = originalHash;

  // Get base color using same logic as solid color
  const validHues = getValidHues(config);
  const baseHue =
    validHues.length > 0 ? validHues[hash % validHues.length] : hash % 360;

  hash = Math.floor(hash / 360);
  const chromaRange = LCH_CHROMA_MAX - LCH_CHROMA_MIN;
  const baseChroma = LCH_CHROMA_MIN + (hash % chromaRange);

  hash = Math.floor(hash / chromaRange);
  const lightnessRange = LCH_LIGHTNESS_MAX - LCH_LIGHTNESS_MIN;
  const baseLightness = LCH_LIGHTNESS_MIN + (hash % lightnessRange);

  // Create gradient colors
  let color1, color2;

  if (type === 'monochrome') {
    // Same hue, slightly different lightness for subtle effect
    const lightnessOffset = 8;
    color1 = chroma.lch(
      Math.max(LCH_LIGHTNESS_MIN, baseLightness - lightnessOffset),
      baseChroma,
      baseHue,
    );
    color2 = chroma.lch(
      Math.min(LCH_LIGHTNESS_MAX, baseLightness + lightnessOffset),
      baseChroma,
      baseHue,
    );
  } else {
    // Analogous: use different hash sections for more variation
    const hueHash2 = simpleHash(userId + '-gradient');
    const chromaHash2 = simpleHash(userId + '-gradient-chroma');

    // Second color gets its own independent values
    const hue2 = (baseHue + 30 + (hueHash2 % 60)) % 360; // 30-90 degrees offset
    const chroma2 = LCH_CHROMA_MIN + (chromaHash2 % chromaRange);

    color1 = chroma.lch(baseLightness, baseChroma, baseHue);
    color2 = chroma.lch(baseLightness, chroma2, hue2);
  }

  try {
    return `linear-gradient(135deg, ${color1.css()}, ${color2.css()})`;
  } catch (e) {
    // Fallback to solid color if gradient fails
    return chroma.lch(baseLightness, baseChroma, baseHue).css();
  }
}
