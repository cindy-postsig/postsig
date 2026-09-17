# Avatar Colors Configuration Guide

Your app uses **LCH color space** for perceptually uniform avatar colors. This ensures that colors are equally distinct to the human eye.

## Quick Reference

All configuration is in `utils/avatarColor.ts`

### Adjust Color Richness/Vibrancy (Chroma)

**Lines 49-50:**

```typescript
export const LCH_CHROMA_MIN = 30;
export const LCH_CHROMA_MAX = 50;
```

**Recommended ranges:**

- **15-30**: Very muted, subtle, corporate
- **30-50**: Muted, professional (current)
- **50-70**: Medium vibrancy
- **70-90**: Vibrant, bold, playful

### Adjust Darkness/Lightness

**Lines 54-55:**

```typescript
export const LCH_LIGHTNESS_MIN = 50;
export const LCH_LIGHTNESS_MAX = 70;
```

**Recommended ranges:**

- **30-50**: Dark colors (better for light backgrounds)
- **50-70**: Medium tone (current)
- **70-85**: Light, pastel colors
- **85-95**: Very light (better for dark backgrounds)

### Exclude Color Ranges

**Lines 31-34:**

```typescript
excludedBands: [
  { start: 45, end: 80 }, // Muddy yellow-green range
],
```

**Common problematic ranges:**

- **0-15, 345-360**: Reds (can be too aggressive)
- **45-80**: Yellow-greens (can look muddy)
- **165-195**: Cyans (can look washed out)

## Testing Your Changes

1. Visit `/dev/avatar-colors` in your dev environment
2. Use the "Test Your Own Hash/User ID" section to try different inputs
3. Check the color spectrum to see the overall distribution
4. Adjust values in `avatarColor.ts` and refresh to see changes

## Examples

### More Vibrant Colors

```typescript
export const LCH_CHROMA_MIN = 50;
export const LCH_CHROMA_MAX = 70;
```

### Darker Colors

```typescript
export const LCH_LIGHTNESS_MIN = 35;
export const LCH_LIGHTNESS_MAX = 55;
```

### Very Muted, Light (Pastel)

```typescript
export const LCH_CHROMA_MIN = 20;
export const LCH_CHROMA_MAX = 35;
export const LCH_LIGHTNESS_MIN = 70;
export const LCH_LIGHTNESS_MAX = 85;
```

## Why LCH?

**HSL Problem:** A 10° hue shift in yellow looks very different from a 10° shift in blue.

**LCH Solution:** Equal hue distances = equal perceived differences. Colors are truly evenly spaced.

**Result:** Your 5-15 users will have maximally distinct avatar colors!
