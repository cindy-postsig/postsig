'use client';
import { Component, useEffect, useState, useRef, type ReactNode } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import logger from '@/utils/pino';

/**
 * next/image throws synchronously during render when a logo resolves to a host
 * that isn't allow-listed in next.config's images.remotePatterns. That throw
 * isn't caught by <Image>'s onError, so without a boundary it crashes the whole
 * route. Falling back to the letter avatar keeps an unknown logo provider from
 * taking down the page.
 */
class ImageErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    logger.warn({ error }, 'VendorIcon image failed to render, using fallback');
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// Shared cache across all VendorIcon instances to prevent duplicate API calls
const logoCache = new Map<string, Promise<string | null>>();
const MAX_CACHE_ENTRIES = 500;

// Concurrency limiter: cap concurrent /api/vendors/logo fetches at 6
// (matches browser per-origin connection limit)
const MAX_CONCURRENT_FETCHES = 6;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    fetchQueue.push(() => {
      activeFetches++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeFetches--;
  const next = fetchQueue.shift();
  if (next) next();
}

// Find the closest scrollable ancestor for IntersectionObserver root
function findScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function cacheSet(key: string, value: Promise<string | null>) {
  if (logoCache.size >= MAX_CACHE_ENTRIES) {
    // Simple FIFO eviction
    const firstKey = logoCache.keys().next().value;
    if (firstKey) logoCache.delete(firstKey);
  }
  logoCache.set(key, value);
}

interface VendorIconProps {
  name: string;
  domain?: string;
  width?: number;
  height?: number;
  className?: string;
  lazy?: boolean;
}

const VendorIcon = ({
  name = '',
  domain,
  width = 36,
  height = 36,
  className,
  lazy = false,
}: VendorIconProps) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBackground, setNeedsBackground] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isVisible, setIsVisible] = useState(!lazy);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const rounded = width < 64 ? 'rounded-sm' : 'rounded';

  // IntersectionObserver for lazy loading
  useEffect(() => {
    if (!lazy || isVisible) return;

    const el = containerRef.current;
    if (!el) return;

    const scrollParent = findScrollParent(el);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        root: scrollParent,
        rootMargin: '200px',
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;

    async function fetchLogo() {
      setLoading(true);
      setImageError(false);
      try {
        if (name.toLowerCase().includes('postsig')) {
          if (!cancelled) setLogoUrl('/PSAppIcon.png');
          if (!cancelled) setLoading(false);
          return;
        }

        // Normalize cache key and sanitize query inputs
        const normName = (name || '').trim().toLowerCase();
        const normDomain = (domain || '').trim().toLowerCase();
        // Prefer domain-based key to maximize cache hits across name variants
        const cacheKey = normDomain
          ? `domain:${normDomain}`
          : `name:${normName}`;

        // Check if we already have a pending or completed request for this logo
        if (!logoCache.has(cacheKey)) {
          // Create new promise and store it in cache
          const logoPromise = (async () => {
            await acquireSlot();
            try {
              const params = new URLSearchParams();
              if (normName) params.append('name', normName);
              if (normDomain) params.append('domain', normDomain);

              const response = await fetch(
                `/api/vendors/logo?${params.toString()}`,
              );
              if (!response.ok) return null;
              const data = await response.json();
              return data.url as string | null;
            } catch {
              return null; // treat network errors as no logo
            } finally {
              releaseSlot();
            }
          })().catch((err) => {
            // Remove poisoned entry so future attempts can retry
            logoCache.delete(cacheKey);
            throw err;
          });

          cacheSet(cacheKey, logoPromise);
        }

        // Wait for the cached promise to resolve
        const url = await logoCache.get(cacheKey);
        if (!cancelled) setLogoUrl(url || null);
      } catch (error) {
        logger.error({ error, name, domain }, 'Error fetching logo');
        if (!cancelled) setLogoUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLogo();

    return () => {
      cancelled = true;
    };
  }, [name, domain, isVisible]);

  // Cache for analyzed logos
  const imageAnalysisCache = useRef<Record<string, boolean>>({});

  // Analyze logo colors when logo URL is set and theme changes
  useEffect(() => {
    if (!logoUrl) {
      setNeedsBackground(false);
      return;
    }

    // Always reset in light mode
    if (!isDarkMode) {
      setNeedsBackground(false);
      return;
    }

    // Check cache first
    const cacheKey = `${logoUrl}-${isDarkMode}`;
    if (imageAnalysisCache.current[cacheKey] !== undefined) {
      setNeedsBackground(imageAnalysisCache.current[cacheKey]);
      return;
    }

    // Use the browser's HTMLImageElement and Canvas for detailed pixel analysis
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = logoUrl;

    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        // Resize to smaller dimensions for performance
        const maxDimension = 100; // Limit size for performance
        const scale = Math.min(
          1,
          maxDimension / Math.max(img.width, img.height),
        );

        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Draw image scaled down
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Get image data - sample fewer pixels for performance
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Variables to track dark pixels and transparent areas
        let darkPixelCount = 0;
        let transparentPixelCount = 0;
        let totalPixels = 0;
        let coloredDarkPixels = 0;

        // Sample pixels (step by 4 for RGBA and by sampling rate for performance)
        const samplingRate = canvas.width > 50 ? 4 : 1; // Sample every 4th pixel for larger images

        for (let i = 0; i < data.length; i += 4 * samplingRate) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip fully transparent pixels
          if (a < 20) {
            transparentPixelCount++;
            continue;
          }

          totalPixels++;

          // Calculate brightness (perceived luminance)
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

          // Check if the pixel is dark
          if (brightness < 0.3) {
            darkPixelCount++;

            // Check if it's colored dark pixel and not just grayscale
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min > 30) {
              coloredDarkPixels++;
            }
          }
        }

        // Calculate ratios
        const darkRatio = darkPixelCount / (totalPixels || 1); // Avoid division by zero
        const coloredDarkRatio =
          darkPixelCount > 0 ? coloredDarkPixels / darkPixelCount : 0;
        const hasTransparency = transparentPixelCount > 0;

        // Need background if:
        // 1. Image has dark pixels AND transparency
        // 2. Dark pixels are not primarily colored (e.g., black not blue)
        const needsBackground =
          isDarkMode &&
          hasTransparency &&
          darkRatio > 0.5 &&
          coloredDarkRatio < 0.3;

        // Cache the result
        imageAnalysisCache.current[cacheKey] = needsBackground;

        // Update state
        setNeedsBackground(needsBackground);
      } catch (e) {
        logger.error({ error: e, logoUrl }, 'Error analyzing logo colors');
        setNeedsBackground(isDarkMode); // Fallback to dark mode check if analysis fails
      }
    };

    img.onerror = () => {
      logger.warn({ logoUrl }, 'Error loading image for color analysis');
      setNeedsBackground(isDarkMode); // Fallback to dark mode check if image loading fails
    };
  }, [logoUrl, isDarkMode]);

  // Letter fallback element (used for lazy pre-visible state and when no logo)
  const letterFallback = (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        position: 'relative',
        width: width,
        height: height,
        minWidth: width,
        minHeight: height,
        fontSize: height / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundSize: 'cover',
        color: 'white',
      }}
      className={`${className} ${rounded} bg-gray-700 pt-[1px]`}
    >
      {name && name.replace(/['"]/g, '').charAt(0)}
    </div>
  );

  // When lazy and not yet visible, show the letter fallback (no fetch triggered)
  if (lazy && !isVisible) {
    return letterFallback;
  }

  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{
          display: 'inline-block',
          position: 'relative',
          width: width,
          height: height,
          minWidth: width,
          minHeight: height,
          backgroundColor: 'rgba(0,0,0,.06)',
        }}
        className={`${className} ${rounded}`}
      ></div>
    );
  }

  if (logoUrl && !imageError) {
    // Apply a light background in dark mode if needed
    const backgroundClass = needsBackground
      ? 'bg-white/80 rounded-sm'
      : 'bg-background';

    return (
      <ImageErrorBoundary key={domain || name} fallback={letterFallback}>
        <div
          ref={containerRef}
          style={{
            display: 'inline-block',
            position: 'relative',
            width: width,
            height: height,
            minWidth: width,
            minHeight: height,
          }}
          className={`${className} ${backgroundClass}`}
        >
          <Image
            src={logoUrl}
            alt={`${name} logo`}
            fill
            style={{
              objectFit: 'contain',
              objectPosition: 'left',
              border: needsBackground
                ? 'none'
                : '1px solid rgba(127,127,127,.15)',
            }}
            className={`${rounded}`}
            onError={() => {
              setImageError(true);
            }}
          />
        </div>
      </ImageErrorBoundary>
    );
  } else {
    return letterFallback;
  }
};

export default VendorIcon;
