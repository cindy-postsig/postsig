import type { DocumentProps } from 'react-pdf';

/**
 * pdf.js's document proxy, derived from react-pdf's own callback signature:
 * `pdfjs-dist` is a nested transitive dependency and does not resolve from app
 * code, so its types are reached through the package that owns it.
 */
export type PdfDocumentProxy = Parameters<
  NonNullable<DocumentProps['onLoadSuccess']>
>[0];

/** One quarter turn — the only rotation increment the viewer offers. */
export const ROTATION_STEP = 90;

/** Orientation facts for a single page, read once when the document loads. */
export interface PageOrientation {
  /**
   * The page's own `/Rotate` entry. pdf.js already applies this by default, but
   * react-pdf's `rotate` prop *replaces* it rather than adding to it, so it has
   * to be folded back into any value we pass.
   */
  intrinsicRotation: number;
  /**
   * Clockwise turn that brings the page's own text upright, on top of what
   * pdf.js already displays. Zero for a page that reads correctly as-is —
   * including a genuine landscape page, whose wide text is already horizontal.
   */
  autoRotation: number;
}

/** Normalize any degree value into [0, 360). */
export function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Rotation the viewer adds on top of what pdf.js would do on its own: enough to
 * stand the page's text upright, plus the user's override.
 *
 * Kept separate from the absolute value because overlays drawn in page-relative
 * coordinates (Textract citation highlights) have to be rotated by exactly this
 * much — the intrinsic `/Rotate` is already baked into their coordinate space.
 */
export function resolveRotationDelta(
  orientation: PageOrientation | undefined,
  userRotation: number,
): number {
  return normalizeRotation((orientation?.autoRotation ?? 0) + userRotation);
}

/**
 * Absolute value for react-pdf's `<Page rotate>`, or `undefined` while the
 * page's orientation is still unknown so react-pdf keeps its own default.
 */
export function resolvePageRotation(
  orientation: PageOrientation | undefined,
  userRotation: number,
): number | undefined {
  if (!orientation) return undefined;
  return normalizeRotation(
    orientation.intrinsicRotation +
      resolveRotationDelta(orientation, userRotation),
  );
}

export interface NormalizedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Rotate a 0–1 normalized box clockwise within its unit square. Textract
 * bounding boxes are expressed against the page as pdf.js would display it, so
 * a page the viewer turns further needs its boxes turned by the same delta.
 */
export function rotateNormalizedBox(
  box: NormalizedBox,
  rotation: number,
): NormalizedBox {
  switch (normalizeRotation(rotation)) {
    case 90:
      return {
        left: 1 - box.top - box.height,
        top: box.left,
        width: box.height,
        height: box.width,
      };
    case 180:
      return {
        left: 1 - box.left - box.width,
        top: 1 - box.top - box.height,
        width: box.width,
        height: box.height,
      };
    case 270:
      return {
        left: box.top,
        top: 1 - box.left - box.width,
        width: box.height,
        height: box.width,
      };
    default:
      return box;
  }
}

/**
 * The part of a pdf.js text item this module reads. `getTextContent` also
 * yields marked-content markers, which carry no transform and are skipped.
 */
export interface TextLikeItem {
  str: string;
  transform: number[];
}

/**
 * On-screen angle of a text run, quantized to a quarter turn.
 *
 * A text item's transform is expressed in PDF user space (y up) and excludes
 * the viewport, so it has to be composed with `viewport.transform` — which is
 * what applies `/Rotate` and the flip to device space (y down). Only the linear
 * part matters; the translation columns move the run without turning it.
 *
 * Returns undefined for a degenerate transform that points nowhere.
 */
function screenTextAngle(
  item: TextLikeItem,
  viewportTransform: readonly number[],
): number | undefined {
  const [a, b, c, d] = viewportTransform;
  const [e, f] = item.transform;

  // Advance direction of the baseline, in device space.
  const x = a * e + c * f;
  const y = b * e + d * f;
  if (x === 0 && y === 0) return undefined;

  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeRotation(Math.round(degrees / ROTATION_STEP) * ROTATION_STEP);
}

/** Heaviest key in a weight map, or undefined when nothing was weighed. */
function dominantKey(weights: ReadonlyMap<number, number>): number | undefined {
  let dominant: number | undefined;
  let dominantWeight = 0;

  for (const [key, weight] of weights) {
    if (weight > dominantWeight) {
      dominant = key;
      dominantWeight = weight;
    }
  }

  return dominant;
}

/**
 * Clockwise turn that stands a page's text upright, decided by whichever
 * quarter-turn orientation carries the most characters. Sampling the dominant
 * run rather than the first one keeps a rotated exhibit stamp — or a sideways
 * table label on an otherwise upright page — from flipping the whole page.
 *
 * Returns undefined when no text carries a usable angle — a scanned image page
 * has nothing to measure, and its page box says nothing either, since a sideways
 * scan is stored in the same upright box as a straight one.
 */
export function resolveAutoRotation(
  items: readonly (TextLikeItem | unknown)[],
  viewportTransform: readonly number[],
): number | undefined {
  const weightByAngle = new Map<number, number>();

  for (const item of items) {
    if (!isTextLikeItem(item)) continue;

    const weight = item.str.trim().length;
    if (weight === 0) continue;

    const angle = screenTextAngle(item, viewportTransform);
    if (angle === undefined) continue;

    weightByAngle.set(angle, (weightByAngle.get(angle) ?? 0) + weight);
  }

  const dominantAngle = dominantKey(weightByAngle);
  if (dominantAngle === undefined) return undefined;

  // The correction is the inverse of how far the text is already turned.
  return normalizeRotation(-dominantAngle);
}

/**
 * Turn to assume for a page whose own text cannot answer: whichever correction
 * the document's readable pages mostly agree on.
 *
 * A scanned page is almost always bound alongside pages of the same scan, so
 * inheriting the document's answer beats leaving it the one page facing the
 * wrong way. Falls back to no rotation when nothing in the document is legible.
 */
export function resolveDocumentAutoRotation(
  pageRotations: readonly (number | undefined)[],
): number {
  const pagesPerRotation = new Map<number, number>();

  for (const rotation of pageRotations) {
    if (rotation === undefined) continue;
    pagesPerRotation.set(rotation, (pagesPerRotation.get(rotation) ?? 0) + 1);
  }

  return dominantKey(pagesPerRotation) ?? 0;
}

function isTextLikeItem(item: unknown): item is TextLikeItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as Partial<TextLikeItem>;
  return (
    typeof candidate.str === 'string' && Array.isArray(candidate.transform)
  );
}

/**
 * Read every page's orientation from an already-loaded document. This parses
 * each page's text positions but renders nothing, so it is cheap enough to
 * await before the first paint, which keeps a sideways page from flashing in
 * its wrong orientation and then spinning.
 *
 * Pages that cannot be measured — scanned images, or text that fails to parse —
 * take the document's answer rather than staying behind at zero.
 */
export async function readPageOrientations(
  pdf: PdfDocumentProxy,
): Promise<Record<number, PageOrientation>> {
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });

      let autoRotation: number | undefined;
      try {
        const { items } = await page.getTextContent();
        autoRotation = resolveAutoRotation(items, viewport.transform);
      } catch {
        autoRotation = undefined;
      }

      return {
        pageNumber: index + 1,
        intrinsicRotation: normalizeRotation(page.rotate),
        autoRotation,
      };
    }),
  );

  const documentRotation = resolveDocumentAutoRotation(
    pages.map((page) => page.autoRotation),
  );

  return Object.fromEntries(
    pages.map((page) => [
      page.pageNumber,
      {
        intrinsicRotation: page.intrinsicRotation,
        autoRotation: page.autoRotation ?? documentRotation,
      },
    ]),
  );
}
