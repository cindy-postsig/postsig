# Color Algorithm Calibration

## Analysis Date

2025-11-02

## Color Palette (24 colors)

Updated from original Pantone palette to new curated sophisticated colors.

## LCH Analysis Results

### Lightness (L)

- **Min:** 17.5
- **Max:** 80.0
- **Average:** 44.9
- **Median:** 40.6
- **Range:** Dark charcoals to soft creams

### Chroma (C) - Saturation

- **Min:** 1.0
- **Max:** 63.5
- **Average:** 24.2
- **Median:** 24.8
- **Range:** Nearly gray to moderately saturated

### Hue (H)

- **Coverage:** Full spectrum (0-360°)
- **Distribution:** Well-distributed across all color families

## Algorithm Calibration

### getAvatarColorSophisticated()

**Previous ranges:**

- Lightness: 25-58
- Chroma: 15-48

**New calibrated ranges:**

- **Lightness: 18-76** (captures 95% of palette, median-centered)
- **Chroma: 2-60** (muted to rich, median-centered)
- **Hue: 0-360** (full spectrum)

**Fallback values:**

- Uses median palette values: L=41, C=25

## Key Characteristics Captured

1. **Sophisticated & Understated**
   - Lower chroma values prevent neon/garish colors
   - Wide lightness range allows variety

2. **Rich Depth with Variety**
   - Includes both dark (L=18) and light (L=76) tones
   - Most colors cluster around median (L=40.6)

3. **Muted but Not Washed Out**
   - Chroma range 2-60 balances subtlety with richness
   - Median chroma of 24.8 ensures visible color

4. **Full Spectrum Coverage**
   - All hues represented for maximum user distinctness
   - No color families excluded

## Testing

Visit `/dev/color-algorithm` to see:

- Original palette analysis with LCH values
- Real customer UUID colors (53 users)
- 100-color test grid for distribution
- Live parameter tuning controls
