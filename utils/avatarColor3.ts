import chroma from 'chroma-js';

/**
 * colors.ts
 *
 * This file contains a predefined color palette and a deterministic function
 * to assign one of these colors based on a string seed (like a user ID or name).
 * This ensures that a given seed always produces the same color from the palette,
 * helping to maintain consistent visual identity across the application.
 */

// 1. The Predefined Color Palette
// Extracted from the provided image, including 14 unique hex codes.
export const COLOR_PALETTE: string[] = [
  '#01637D', // Teal
  '#2986B1', // Light Blue
  '#2E5198', // Royal Blue
  '#160F5B', // Deep Purple
  '#5545AE', // Purple
  '#636D2A', // Olive Green
  '#6889BB', // Sky Blue
  '#828F3A', // Yellow Green
  '#86182A', // Burgundy
  '#A6871D', // Gold
  '#A71A45', // Crimson
  '#BE6B79', // Mauve
  '#C3A749', // Mustard
  '#CB5724', // Burnt Orange
  '#CC7736', // Orange
  '#424832', // Dark Green
  '#8C877F', // Warm Gray
];

/**
 * A simple, non-cryptographic hashing function to convert a string into an integer.
 * This ensures the mapping is deterministic: the same input string always yields the same hash.
 * @param str The string to hash (e.g., user ID, email address).
 * @returns A positive integer hash value.
 */
function stringToDeterministicHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // Use a bitwise OR to keep the result a 32-bit integer, and then add the character code.
    // 31 is a commonly used prime multiplier for simple string hashing.
    hash = (hash << 5) - hash + char;
    // Convert to 32-bit integer and ensure the result is positive
    hash |= 0;
  }
  // Ensure the final hash is a positive number
  return Math.abs(hash);
}

/**
 * Method 1: Partition UUID into thirds for R, G, B (simple XOR)
 * Better distribution than mixing all bytes together
 */
function seedToRGB_Accumulate(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Divide UUID into 3 sections
  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  // XOR bytes in each section
  const values = sections.map((section) => {
    let val = 0;
    for (let i = 0; i < section.length - 1; i += 2) {
      const byte = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(byte)) val ^= byte;
    }
    return val || 204;
  });

  return [values[0], values[1], values[2]];
}

/**
 * Method 2: Direct Hex - The UUID IS the color 🎨
 * The first 6 hex characters reveal the hidden RGB color
 */
function seedToRGB_DirectHex(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // The UUID's first 6 characters literally ARE the color
  const r = parseInt(cleaned.substring(0, 2) || 'cc', 16);
  const g = parseInt(cleaned.substring(2, 4) || 'cc', 16);
  const b = parseInt(cleaned.substring(4, 6) || 'cc', 16);

  return [r, g, b];
}

/**
 * Method 3: Partition UUID into HSL values - UNCONSTRAINED TRUE FATE
 * Each section independently determines H, S, or L
 */
function seedToRGB_HSL(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Divide UUID into 3 sections for H, S, L
  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  // XOR bytes in each section
  const values = sections.map((section) => {
    let val = 0;
    for (let i = 0; i < section.length - 1; i += 2) {
      const byte = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(byte)) val ^= byte;
    }
    return val || 128;
  });

  // Map to FULL HSL ranges - no constraints, pure UUID destiny
  const h = (values[0] * 360) / 255; // 0-360
  const s = values[1] / 255; // 0-100% saturation (FULL RANGE)
  const l = values[2] / 255; // 0-100% lightness (FULL RANGE)

  const rgb = chroma.hsl(h, s, l).rgb();
  return [rgb[0], rgb[1], rgb[2]];
}

/**
 * Method 4: Partition UUID into LAB values
 * Each section independently determines L, A, or B
 */
function seedToRGB_LAB(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Divide UUID into 3 sections for L, A, B
  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  // XOR bytes in each section
  const values = sections.map((section) => {
    let val = 0;
    for (let i = 0; i < section.length - 1; i += 2) {
      const byte = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(byte)) val ^= byte;
    }
    return val || 128;
  });

  // Map to LAB ranges (L: 30-70, A&B: -80 to 80 for reasonable colors)
  const l = 30 + (values[0] / 255) * 40;
  const a = (values[1] / 255) * 160 - 80;
  const b = (values[2] / 255) * 160 - 80;

  const rgb = chroma.lab(l, a, b).rgb();
  return [
    Math.max(0, Math.min(255, rgb[0])),
    Math.max(0, Math.min(255, rgb[1])),
    Math.max(0, Math.min(255, rgb[2])),
  ];
}

/**
 * Method 5: Partition-based hashing
 * Divides UUID into thirds, hashes each section separately for R, G, B
 */
function seedToRGB_XOR(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Divide UUID into 3 sections for R, G, B
  const third = Math.floor(cleaned.length / 3);
  const rSection = cleaned.substring(0, third);
  const gSection = cleaned.substring(third, third * 2);
  const bSection = cleaned.substring(third * 2);

  // Hash each section independently using FNV-1a style hash
  const hashSection = (section: string, prime: number): number => {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < section.length; i++) {
      hash ^= section.charCodeAt(i);
      hash = (hash * prime) >>> 0; // Multiply by prime and ensure 32-bit
    }
    return hash & 0xff;
  };

  const r = hashSection(rSection, 16777619);
  const g = hashSection(gSection, 16777619);
  const b = hashSection(bSection, 16777619);

  return [r || 204, g || 204, b || 204];
}

/**
 * Method 6: Golden Ratio Spiral ✨
 * Use φ (golden ratio) to select magical positions in the UUID
 */
function seedToRGB_GoldenSpiral(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');
  const PHI = 1.618033988749895;

  // Use golden ratio to select 3 "special" positions for R, G, B
  const positions = [
    Math.floor(cleaned.length * 0.236) * 2, // 1 - 1/φ ≈ 0.236
    Math.floor(cleaned.length * 0.618) * 2, // 1/φ ≈ 0.618
    Math.floor(cleaned.length * 0.854) * 2, // 1 - 1/φ² ≈ 0.854
  ];

  return positions.map((pos) => {
    return parseInt(cleaned.substring(pos, pos + 2) || 'cc', 16);
  }) as [number, number, number];
}

/**
 * Method 7: Fibonacci Weave 🌀
 * Weave together hex values at Fibonacci positions
 */
function seedToRGB_FibonacciWeave(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Fibonacci sequence up to 32: 1, 1, 2, 3, 5, 8, 13, 21
  const fib = [1, 1, 2, 3, 5, 8, 13, 21];

  const values = [0, 0, 0];

  fib.forEach((f, idx) => {
    if (f * 2 < cleaned.length) {
      const byte = parseInt(cleaned.substring(f * 2, f * 2 + 2), 16);
      if (!isNaN(byte)) {
        values[idx % 3] ^= byte;
      }
    }
  });

  return values.map((v) => v || 128) as [number, number, number];
}

/**
 * Method 8: Prime Constellation ⭐
 * Sum hex values at prime-numbered positions (cosmic alignment!)
 */
function seedToRGB_PrimeConstellation(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Prime positions in a 32-char UUID: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];

  const values = [0, 0, 0];

  primes.forEach((prime, idx) => {
    if (prime < cleaned.length) {
      const byte = parseInt(cleaned.substring(prime, prime + 2), 16);
      if (!isNaN(byte)) {
        values[idx % 3] = (values[idx % 3] + byte) % 256;
      }
    }
  });

  return values.map((v) => v || 128) as [number, number, number];
}

/**
 * Method 9: Harmonic Resonance 🎵
 * Treat UUID sections as musical frequencies, find color harmonies
 */
function seedToRGB_HarmonicResonance(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Divide into 3 sections, calculate "frequency" of each
  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  return sections.map((section) => {
    // Sum all bytes, then find harmonic (modulo with musical ratio)
    let sum = 0;
    for (let i = 0; i < section.length - 1; i += 2) {
      const byte = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(byte)) sum += byte;
    }

    // Apply harmonic ratios (perfect fifth = 3/2, major third = 5/4)
    const harmonic = (sum * 3) % 256; // Multiply by 3 for harmonic richness

    return harmonic || 128;
  }) as [number, number, number];
}

/**
 * Method 10: Crystalline Growth 💎
 * Each hex "seed" grows into adjacent values (cellular automaton style)
 */
function seedToRGB_CrystallineGrowth(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  return sections.map((section) => {
    // Parse first byte as "seed crystal"
    let crystal = parseInt(section.substring(0, 2), 16) || 128;

    // Let it "grow" by interacting with neighbors
    for (let i = 2; i < section.length - 1; i += 2) {
      const neighbor = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(neighbor)) {
        // Crystal growth rule: XOR with neighbor, then rotate bits
        crystal = ((crystal ^ neighbor) << 1) | ((crystal ^ neighbor) >>> 7);
        crystal &= 0xff; // Keep in byte range
      }
    }

    return crystal;
  }) as [number, number, number];
}

/**
 * Method 11: Celestial Orbit 🌙
 * Map hex values to orbital mechanics, find color from gravitational center
 */
function seedToRGB_CelestialOrbit(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  const third = Math.floor(cleaned.length / 3);
  const sections = [
    cleaned.substring(0, third),
    cleaned.substring(third, third * 2),
    cleaned.substring(third * 2),
  ];

  return sections.map((section) => {
    // Each byte is a "celestial body" with mass
    let centerX = 0;
    let centerY = 0;
    let totalMass = 0;

    for (let i = 0; i < section.length - 1; i += 2) {
      const byte = parseInt(section.substring(i, i + 2), 16);
      if (!isNaN(byte)) {
        // Position based on index, mass based on value
        const angle = (i / section.length) * Math.PI * 2;
        centerX += Math.cos(angle) * byte;
        centerY += Math.sin(angle) * byte;
        totalMass += byte;
      }
    }

    // Find the gravitational center
    const orbitalColor = Math.abs(Math.floor((centerX + centerY) / 2)) % 256;

    return orbitalColor || 128;
  }) as [number, number, number];
}

/**
 * Method 12: Paint Palette Blend - RGB Mixing 🎨
 * Extract 5 colors (6 hex chars each) and blend them like light
 */
function seedToRGB_PaintBlend_RGB(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Extract 5 colors from the UUID (every 6 chars)
  const colors: [number, number, number][] = [];
  for (let i = 0; i + 6 <= cleaned.length; i += 6) {
    const r = parseInt(cleaned.substring(i, i + 2), 16);
    const g = parseInt(cleaned.substring(i + 2, i + 4), 16);
    const b = parseInt(cleaned.substring(i + 4, i + 6), 16);
    colors.push([r, g, b]);
  }

  // RGB averaging (additive mixing like light)
  const avgR = colors.reduce((sum, c) => sum + c[0], 0) / colors.length;
  const avgG = colors.reduce((sum, c) => sum + c[1], 0) / colors.length;
  const avgB = colors.reduce((sum, c) => sum + c[2], 0) / colors.length;

  return [Math.round(avgR), Math.round(avgG), Math.round(avgB)];
}

/**
 * Method 13: Paint Palette Blend - LAB Mixing 🖌️
 * Extract colors and blend in LAB space (perceptually uniform)
 */
function seedToRGB_PaintBlend_LAB(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Extract 5 colors from the UUID
  const colors: [number, number, number][] = [];
  for (let i = 0; i + 6 <= cleaned.length; i += 6) {
    const r = parseInt(cleaned.substring(i, i + 2), 16);
    const g = parseInt(cleaned.substring(i + 2, i + 4), 16);
    const b = parseInt(cleaned.substring(i + 4, i + 6), 16);
    colors.push([r, g, b]);
  }

  // Convert each to LAB and average
  const labColors = colors.map((rgb) => chroma(rgb).lab());

  const avgL =
    labColors.reduce((sum, lab) => sum + lab[0], 0) / labColors.length;
  const avgA =
    labColors.reduce((sum, lab) => sum + lab[1], 0) / labColors.length;
  const avgB =
    labColors.reduce((sum, lab) => sum + lab[2], 0) / labColors.length;

  // Convert back to RGB
  const resultRgb = chroma.lab(avgL, avgA, avgB).rgb();

  return [
    Math.round(Math.max(0, Math.min(255, resultRgb[0]))),
    Math.round(Math.max(0, Math.min(255, resultRgb[1]))),
    Math.round(Math.max(0, Math.min(255, resultRgb[2]))),
  ];
}

/**
 * Method 14: Paint Palette Blend - Multiplicative (Subtractive) 🖍️
 * Blend like overlaying transparent paint layers
 */
function seedToRGB_PaintBlend_Multiply(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Extract colors
  const colors: [number, number, number][] = [];
  for (let i = 0; i + 6 <= cleaned.length; i += 6) {
    const r = parseInt(cleaned.substring(i, i + 2), 16);
    const g = parseInt(cleaned.substring(i + 2, i + 4), 16);
    const b = parseInt(cleaned.substring(i + 4, i + 6), 16);
    colors.push([r, g, b]);
  }

  // Multiplicative blending (like overlaying paints)
  // Normalize to 0-1, multiply, then scale back
  let r = 1.0;
  let g = 1.0;
  let b = 1.0;

  colors.forEach((color) => {
    r *= color[0] / 255;
    g *= color[1] / 255;
    b *= color[2] / 255;
  });

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Method 15: Many Pigments Blend 🌈
 * Extract 16 colors (every 2 hex chars) and blend them all!
 */
function seedToRGB_ManyPigments(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Extract ALL possible 2-char segments as grayscale values
  const pigments: number[] = [];
  for (let i = 0; i + 2 <= cleaned.length; i += 2) {
    const value = parseInt(cleaned.substring(i, i + 2), 16);
    pigments.push(value);
  }

  // Distribute pigments across R, G, B channels and blend
  let r = 0,
    g = 0,
    b = 0;
  let rCount = 0,
    gCount = 0,
    bCount = 0;

  pigments.forEach((pigment, idx) => {
    if (idx % 3 === 0) {
      r += pigment;
      rCount++;
    } else if (idx % 3 === 1) {
      g += pigment;
      gCount++;
    } else {
      b += pigment;
      bCount++;
    }
  });

  return [
    Math.round(r / Math.max(rCount, 1)),
    Math.round(g / Math.max(gCount, 1)),
    Math.round(b / Math.max(bCount, 1)),
  ];
}

/**
 * Method 16: Weighted Palette Blend 🎭
 * Later colors in UUID have more influence (like painting layers)
 */
function seedToRGB_WeightedBlend(seed: string): [number, number, number] {
  const cleaned = seed.replace(/[^a-fA-F0-9]/g, '');

  // Extract colors with increasing weights
  const colors: [number, number, number][] = [];
  for (let i = 0; i + 6 <= cleaned.length; i += 6) {
    const r = parseInt(cleaned.substring(i, i + 2), 16);
    const g = parseInt(cleaned.substring(i + 2, i + 4), 16);
    const b = parseInt(cleaned.substring(i + 4, i + 6), 16);
    colors.push([r, g, b]);
  }

  // Weight: later colors are more important (like painting layers on top)
  let totalR = 0,
    totalG = 0,
    totalB = 0;
  let totalWeight = 0;

  colors.forEach((color, idx) => {
    const weight = idx + 1; // 1, 2, 3, 4, 5...
    totalR += color[0] * weight;
    totalG += color[1] * weight;
    totalB += color[2] * weight;
    totalWeight += weight;
  });

  return [
    Math.round(totalR / totalWeight),
    Math.round(totalG / totalWeight),
    Math.round(totalB / totalWeight),
  ];
}

// Current default method - switch between these to experiment!
function seedToRGB(seed: string): [number, number, number] {
  /**
   * 🎨 THE COLOR EXTRACTION GALLERY 🎨
   *
   * CLASSIC METHODS:
   * Accumulate: Simple XOR per partition - reliable baseline
   * DirectHex: First 6 hex chars ARE the color - most literal!
   * HSL: Unconstrained 0-100% ranges - true fate (can be extreme)
   * LAB: Perceptually uniform L:30-70 - constrained but balanced
   * XOR (FNV-1a): Cryptographic hash - best distribution
   *
   * ✨ MAGICAL METHODS ✨
   * GoldenSpiral: φ (golden ratio) positions - divine proportion
   * FibonacciWeave: Fibonacci sequence positions - nature's pattern
   * PrimeConstellation: Prime number positions - cosmic alignment
   * HarmonicResonance: Musical frequency harmonies - symphonic color
   * CrystallineGrowth: Cellular automaton growth - organic emergence
   * CelestialOrbit: Gravitational center of mass - orbital mechanics
   *
   * 🖌️ PAINT BLENDING METHODS (Uses ENTIRE UUID!) 🖌️
   * PaintBlend_RGB: Extract 5 colors, blend like light (additive)
   * PaintBlend_LAB: Extract 5 colors, blend perceptually (LAB space)
   * PaintBlend_Multiply: Extract 5 colors, overlay like paint (subtractive)
   * ManyPigments: Extract 16 pigments (all 2-char chunks), blend together
   * WeightedBlend: Extract 5 colors, later ones have more weight (layers)
   */

  //return seedToRGB_PaintBlend_LAB(seed); // ⭐ NEW! Uses entire UUID!
  // return seedToRGB_DirectHex(seed);
  // return seedToRGB_Accumulate(seed);
  // return seedToRGB_HSL(seed);
  // return seedToRGB_LAB(seed);
  // return seedToRGB_XOR(seed);

  // ✨ MAGICAL METHODS ✨
  // return seedToRGB_GoldenSpiral(seed);
  // return seedToRGB_FibonacciWeave(seed);
  // return seedToRGB_PrimeConstellation(seed);
  return seedToRGB_HarmonicResonance(seed);
  // return seedToRGB_CrystallineGrowth(seed);
  // return seedToRGB_CelestialOrbit(seed);

  // 🖌️ PAINT BLENDING (USES ENTIRE UUID!) 🖌️
  // return seedToRGB_PaintBlend_RGB(seed);
  // return seedToRGB_PaintBlend_LAB(seed);
  // return seedToRGB_PaintBlend_Multiply(seed);
  //return seedToRGB_ManyPigments(seed);
  // return seedToRGB_WeightedBlend(seed);
}

/**
 * Finds the closest color in the palette to a target color using LAB color space.
 * LAB is perceptually uniform, so distance matches human color perception.
 * @param targetRGB The RGB color to match [r, g, b].
 * @returns The closest color from COLOR_PALETTE.
 */
function findClosestColor(targetRGB: [number, number, number]): string {
  const targetLab = chroma(targetRGB).lab();
  let minDistance = Infinity;
  let closestColor = COLOR_PALETTE[0];

  for (const paletteColor of COLOR_PALETTE) {
    const paletteLab = chroma(paletteColor).lab();

    // Calculate Euclidean distance in LAB space
    const distance = Math.sqrt(
      Math.pow(targetLab[0] - paletteLab[0], 2) +
        Math.pow(targetLab[1] - paletteLab[1], 2) +
        Math.pow(targetLab[2] - paletteLab[2], 2),
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
  }

  return closestColor;
}

/**
 * Finds the closest palette color to the HarmonicResonance-derived color.
 * This reveals which palette color the UUID "naturally gravitates toward" 🎵
 * @param seed The seed string (e.g., UUID).
 * @returns The closest color from COLOR_PALETTE.
 */
function findClosestColorHarmonic(seed: string): string {
  const harmonicRGB = seedToRGB_HarmonicResonance(seed);
  return findClosestColor(harmonicRGB);
}

/**
 * Returns color information based on a seed string (works great with UUIDs).
 * Extracts RGB values from the seed and finds the closest matching palette color.
 * @param seed The string to use as a seed (e.g., UUID, email).
 * @returns An object containing:
 *   - color: The desaturated palette color (recommended for UI)
 *   - derived: The pure color extracted directly from the seed
 *   - palette: The base palette color before desaturation
 *   - harmonic: The palette color closest to HarmonicResonance color
 */
export function getColor(seed: string): {
  color: string;
  derived: string;
  palette: string;
  harmonic: string;
} {
  if (!seed || COLOR_PALETTE.length === 0) {
    return {
      color: '#cccccc',
      derived: '#cccccc',
      palette: '#cccccc',
      harmonic: '#cccccc',
    };
  }

  // 1. Convert the seed to a deterministic hash number.
  const hash = stringToDeterministicHash(seed.toLowerCase());

  // 2. Use the modulo operator to map the hash to a valid index in the palette array.
  const index = hash % COLOR_PALETTE.length;

  // 3. Return the color at that index.
  const paletteColor = COLOR_PALETTE[index];

  // Extract the "hidden" RGB color from the seed
  const derivedRGB = seedToRGB(seed.toLowerCase());
  // Convert to HSL for more intuitive control over saturation and lightness
  const derivedColor = chroma(derivedRGB)
    .set('hsl.s', 0.22) // Reduce saturation significantly but not completely
    .set('hsl.l', 0.5) // Adjust lightness to a middle value
    .hex();

  // Find the closest palette color to this derived color
  //const paletteColor = findClosestColor(derivedRGB);

  // Find the closest palette color to the HarmonicResonance color
  const harmonicPalette = findClosestColorHarmonic(seed.toLowerCase());

  // Reduce saturation for the recommended UI color
  const uiColor = chroma(paletteColor).desaturate(0.4).hex();

  return {
    color: uiColor, // Desaturated palette match (recommended)
    derived: derivedColor, // Pure color from UUID
    palette: paletteColor, // Base palette color
    harmonic: harmonicPalette, // Palette color closest to HarmonicResonance
  };
}

export function getColorWithShade(seed: string): string {
  const hash = stringToDeterministicHash(seed);
  const baseColor = COLOR_PALETTE[hash % COLOR_PALETTE.length];

  // Use different parts of the hash for different variations
  const hueShift = ((hash >> 10) % 21) - 10; // -10 to +10 degrees
  const lightness = ((hash >> 20) % 21) - 10; // -10 to +10% lightness

  return chroma(baseColor)
    .set('hsl.h', `+${hueShift}`)
    .set('hsl.l', `+${lightness * 0.01}`)
    .hex();
}

const PHI = 1.618033988749895; // Golden ratio

function goldenRatioHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash += str.charCodeAt(i) * Math.pow(PHI, i % 10);
  }
  return Math.abs(Math.floor(hash));
}

export function getColorGolden(seed: string): string {
  const hash = goldenRatioHash(seed);
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function getColorChroma(
  seed: string,
  variant: 'base' | 'light' | 'dark' | 'saturated' = 'base',
): string {
  const hash = stringToDeterministicHash(seed.toLowerCase());
  const baseColor = COLOR_PALETTE[hash % COLOR_PALETTE.length];

  switch (variant) {
    case 'light':
      return chroma(baseColor).brighten(0.5).hex();
    case 'dark':
      return chroma(baseColor).darken(0.5).hex();
    case 'saturated':
      return chroma(baseColor).saturate(1).hex();
    default:
      return baseColor;
  }
}

// Or use the hash to deterministically pick a variant:
export function getColorWithAutoVariant(seed: string): string {
  const hash = stringToDeterministicHash(seed);
  const baseColor = COLOR_PALETTE[hash % COLOR_PALETTE.length];

  // Use a second hash property for variation
  const variation = (hash >> 8) % 100; // Shift bits to get different number

  if (variation < 70) return baseColor; // 70% base
  if (variation < 85) return chroma(baseColor).brighten(0.3).hex(); // 15% light
  return chroma(baseColor).darken(0.3).hex(); // 15% dark
}
