import {
  ROTATION_STEP,
  normalizeRotation,
  readPageOrientations,
  resolveAutoRotation,
  resolveDocumentAutoRotation,
  resolvePageRotation,
  resolveRotationDelta,
  rotateNormalizedBox,
  type PageOrientation,
  type PdfDocumentProxy,
} from '@/components/pdf/page-rotation';

/** A page that already reads correctly — nothing to correct. */
const upright: PageOrientation = {
  intrinsicRotation: 0,
  autoRotation: 0,
};
/** A page whose text lies on its side and needs a quarter turn to stand up. */
const sideways: PageOrientation = {
  intrinsicRotation: 0,
  autoRotation: 90,
};

/**
 * pdf.js's device-space transform for an unrotated page at scale 1: identity
 * with the y axis flipped, since PDF user space counts upward and the screen
 * counts downward.
 */
const UNROTATED_VIEWPORT = [1, 0, 0, -1, 0, 792];

/** A text run of `length` characters advancing along `[dx, dy]` in user space. */
const textRun = (length: number, dx: number, dy: number) => ({
  str: 'x'.repeat(length),
  transform: [dx, dy, -dy, dx, 0, 0],
});

describe('normalizeRotation', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-450)).toBe(270);
  });
});

describe('resolveRotationDelta', () => {
  it('applies the correction a sideways page needs and nothing for an upright one', () => {
    expect(resolveRotationDelta(sideways, 0)).toBe(ROTATION_STEP);
    expect(resolveRotationDelta(upright, 0)).toBe(0);
  });

  it('stacks the user override on top of the automatic rotation', () => {
    expect(resolveRotationDelta(sideways, 90)).toBe(180);
    // Three more quarter turns bring the page back to how pdf.js renders it.
    expect(resolveRotationDelta(sideways, 270)).toBe(0);
    expect(resolveRotationDelta(upright, 180)).toBe(180);
  });

  it('treats unknown orientation as needing no automatic rotation', () => {
    expect(resolveRotationDelta(undefined, 0)).toBe(0);
    expect(resolveRotationDelta(undefined, 90)).toBe(90);
  });
});

describe('resolvePageRotation', () => {
  it('rotates a sideways page a quarter turn', () => {
    expect(resolvePageRotation(sideways, 0)).toBe(90);
  });

  it('leaves an upright page alone, however wide its page box is', () => {
    expect(resolvePageRotation(upright, 0)).toBe(0);
  });

  it('folds in the page’s intrinsic /Rotate, which the prop would replace', () => {
    // A page already flagged /Rotate 90 whose text still lies sideways needs
    // 90 + 90; passing a bare 90 would silently undo the intrinsic rotation.
    expect(
      resolvePageRotation({ intrinsicRotation: 90, autoRotation: 90 }, 0),
    ).toBe(180);
    expect(
      resolvePageRotation({ intrinsicRotation: 270, autoRotation: 0 }, 0),
    ).toBe(270);
    expect(
      resolvePageRotation({ intrinsicRotation: 270, autoRotation: 90 }, 0),
    ).toBe(0);
  });

  it('returns undefined while orientation is unknown so react-pdf keeps its default', () => {
    expect(resolvePageRotation(undefined, 0)).toBeUndefined();
    expect(resolvePageRotation(undefined, 90)).toBeUndefined();
  });
});

describe('resolveAutoRotation', () => {
  it('leaves upright text alone', () => {
    expect(resolveAutoRotation([textRun(50, 1, 0)], UNROTATED_VIEWPORT)).toBe(
      0,
    );
  });

  it('turns text that reads bottom-to-top a quarter turn clockwise', () => {
    // Advancing up the page in user space renders as text climbing the screen —
    // the sideways contract page the geometry heuristic used to miss entirely.
    expect(resolveAutoRotation([textRun(50, 0, 1)], UNROTATED_VIEWPORT)).toBe(
      90,
    );
  });

  it('turns text that reads top-to-bottom a quarter turn anticlockwise', () => {
    expect(resolveAutoRotation([textRun(50, 0, -1)], UNROTATED_VIEWPORT)).toBe(
      270,
    );
  });

  it('flips upside-down text', () => {
    expect(resolveAutoRotation([textRun(50, -1, 0)], UNROTATED_VIEWPORT)).toBe(
      180,
    );
  });

  it('follows the bulk of the text, not a stray rotated stamp', () => {
    const items = [textRun(400, 1, 0), textRun(20, 0, 1)];
    expect(resolveAutoRotation(items, UNROTATED_VIEWPORT)).toBe(0);
    expect(resolveAutoRotation([...items].reverse(), UNROTATED_VIEWPORT)).toBe(
      0,
    );
  });

  it('rotates a page whose sideways text outweighs an upright stamp', () => {
    const items = [textRun(15, 1, 0), textRun(600, 0, 1)];
    expect(resolveAutoRotation(items, UNROTATED_VIEWPORT)).toBe(90);
  });

  it('reads the angle through the viewport, so /Rotate is already accounted for', () => {
    // Viewport for a /Rotate 90 page: user-space +x now points down the screen.
    const rotatedViewport = [0, 1, 1, 0, 0, 0];
    expect(resolveAutoRotation([textRun(50, 1, 0)], rotatedViewport)).toBe(270);
  });

  it('ignores blank runs, marked content, and degenerate transforms', () => {
    expect(
      resolveAutoRotation(
        [
          { str: '   ', transform: [0, 1, -1, 0, 0, 0] },
          { type: 'beginMarkedContent', id: null },
          { str: 'ignored', transform: [0, 0, 0, 0, 0, 0] },
        ],
        UNROTATED_VIEWPORT,
      ),
    ).toBeUndefined();
  });

  it('declines to answer for a page with no measurable text', () => {
    expect(resolveAutoRotation([], UNROTATED_VIEWPORT)).toBeUndefined();
  });
});

describe('resolveDocumentAutoRotation', () => {
  it('takes the rotation most of the readable pages agree on', () => {
    // The shape of the Fitch contract: two scanned pages, four that read 90.
    expect(
      resolveDocumentAutoRotation([undefined, undefined, 90, 90, 90, 90]),
    ).toBe(90);
  });

  it('counts pages rather than deferring to the first one seen', () => {
    expect(resolveDocumentAutoRotation([0, 90, 90, 90])).toBe(90);
  });

  it('falls back to no rotation when nothing in the document is legible', () => {
    expect(resolveDocumentAutoRotation([undefined, undefined])).toBe(0);
    expect(resolveDocumentAutoRotation([])).toBe(0);
  });
});

describe('rotateNormalizedBox', () => {
  // A box hugging the top-left corner, deliberately non-square so width and
  // height swapping is visible.
  const box = { left: 0.1, top: 0.2, width: 0.3, height: 0.4 };

  it('is a no-op at 0 and 360', () => {
    expect(rotateNormalizedBox(box, 0)).toEqual(box);
    expect(rotateNormalizedBox(box, 360)).toEqual(box);
  });

  it('moves a top-left box to the top-right at 90 degrees', () => {
    expect(rotateNormalizedBox(box, 90)).toEqual({
      left: 1 - 0.2 - 0.4,
      top: 0.1,
      width: 0.4,
      height: 0.3,
    });
  });

  it('mirrors both axes at 180 degrees and keeps the box shape', () => {
    expect(rotateNormalizedBox(box, 180)).toEqual({
      left: 1 - 0.1 - 0.3,
      top: 1 - 0.2 - 0.4,
      width: 0.3,
      height: 0.4,
    });
  });

  it('moves a top-left box to the bottom-left at 270 degrees', () => {
    expect(rotateNormalizedBox(box, 270)).toEqual({
      left: 0.2,
      top: 1 - 0.1 - 0.3,
      width: 0.4,
      height: 0.3,
    });
  });

  it('returns to the original box after four quarter turns', () => {
    const turned = [90, 90, 90, 90].reduce(
      (acc) => rotateNormalizedBox(acc, 90),
      box,
    );
    expect(turned.left).toBeCloseTo(box.left);
    expect(turned.top).toBeCloseTo(box.top);
    expect(turned.width).toBeCloseTo(box.width);
    expect(turned.height).toBeCloseTo(box.height);
  });

  it('keeps a rotated box inside the unit square', () => {
    for (const rotation of [90, 180, 270]) {
      const r = rotateNormalizedBox(box, rotation);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(1);
      expect(r.top + r.height).toBeLessThanOrEqual(1);
    }
  });
});

describe('readPageOrientations', () => {
  interface FakePage {
    rotate: number;
    /** Baseline advance direction of this page's text, in user space. */
    textDirection?: [number, number];
    textError?: boolean;
  }

  /** Minimal stand-in for the pdf.js document proxy this helper consumes. */
  const fakePdf = (pages: FakePage[]) =>
    ({
      numPages: pages.length,
      getPage: (pageNumber: number) => {
        const page = pages[pageNumber - 1];
        return Promise.resolve({
          rotate: page.rotate,
          getViewport: () => ({ transform: UNROTATED_VIEWPORT }),
          getTextContent: () =>
            page.textError
              ? Promise.reject(new Error('unreadable text content'))
              : Promise.resolve({
                  items: page.textDirection
                    ? [textRun(50, ...page.textDirection)]
                    : [],
                }),
        });
      },
    }) as unknown as PdfDocumentProxy;

  it('records the correction each page needs alongside its intrinsic rotation', async () => {
    const orientations = await readPageOrientations(
      fakePdf([
        { rotate: 0, textDirection: [1, 0] },
        { rotate: 0, textDirection: [0, 1] },
        { rotate: 90, textDirection: [0, 1] },
      ]),
    );

    expect(orientations).toEqual({
      1: { intrinsicRotation: 0, autoRotation: 0 },
      2: { intrinsicRotation: 0, autoRotation: 90 },
      3: { intrinsicRotation: 90, autoRotation: 90 },
    });
  });

  it('is keyed by 1-based page number', async () => {
    const orientations = await readPageOrientations(
      fakePdf([{ rotate: 0, textDirection: [1, 0] }]),
    );
    expect(Object.keys(orientations)).toEqual(['1']);
  });

  it('gives a scanned page the rotation the readable pages agree on', async () => {
    // The Fitch contract: pages 1–2 are image-only scans, 3–6 read sideways.
    const orientations = await readPageOrientations(
      fakePdf([
        { rotate: 0 },
        { rotate: 0 },
        { rotate: 0, textDirection: [0, 1] },
        { rotate: 0, textDirection: [0, 1] },
        { rotate: 0, textDirection: [0, 1] },
        { rotate: 0, textDirection: [0, 1] },
      ]),
    );

    expect(
      Object.values(orientations).map(({ autoRotation }) => autoRotation),
    ).toEqual([90, 90, 90, 90, 90, 90]);
  });

  it('leaves a document with no readable text alone', async () => {
    const orientations = await readPageOrientations(fakePdf([{ rotate: 0 }]));
    expect(orientations[1].autoRotation).toBe(0);
  });

  it('keeps the document loading when a page’s text cannot be read', async () => {
    const orientations = await readPageOrientations(
      fakePdf([
        { rotate: 0, textError: true },
        { rotate: 0, textDirection: [0, 1] },
        { rotate: 0, textDirection: [0, 1] },
      ]),
    );

    // The unreadable page inherits rather than standing alone at zero.
    expect(orientations[1].autoRotation).toBe(90);
    expect(orientations[2].autoRotation).toBe(90);
  });

  it('normalizes an out-of-range intrinsic rotation', async () => {
    const orientations = await readPageOrientations(
      fakePdf([{ rotate: -90, textDirection: [1, 0] }]),
    );
    expect(orientations[1].intrinsicRotation).toBe(270);
  });
});
