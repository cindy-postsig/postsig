import {
  buildRefinementLookup,
  deriveRefinedNodeMerges,
  findRefinementMatch,
  type RefinementNode,
} from '@/lib/v2/org-units/refinement';

const node = (
  id: number,
  level: RefinementNode['level'],
  name: string,
  parentId: number | null = null,
): RefinementNode => ({ id, level, name, parent_id: parentId });

// Berenberg-shaped: one division, two BUs, and "Research" under BU1 — plus a
// second branch where the same department name is a genuinely different unit.
const DIVISION = node(1, 'division', 'Markets');
const BU1 = node(2, 'business_unit', 'Equities', 1);
const BU2 = node(3, 'business_unit', 'Fixed Income', 1);
const DEEP_RESEARCH = node(4, 'department', 'Research', 2);

const lookup = (...nodes: RefinementNode[]) => buildRefinementLookup(nodes);

describe('findRefinementMatch', () => {
  it('attaches a short-path step to the unique refined node', () => {
    // Step: Research directly under Markets; the real node sits under BU1.
    const match = findRefinementMatch(
      lookup(DIVISION, BU1, DEEP_RESEARCH),
      DIVISION.id,
      'department',
      'Research',
    );
    expect(match).toEqual({ kind: 'attach', node: DEEP_RESEARCH });
  });

  it('re-parents a shallower node when a more precise path arrives', () => {
    // Step: Research under BU1; the existing node sits directly under Markets.
    const shallow = node(4, 'department', 'Research', 1);
    const match = findRefinementMatch(
      lookup(DIVISION, BU1, shallow),
      BU1.id,
      'department',
      'Research',
    );
    expect(match).toEqual({ kind: 'reparent', node: shallow });
  });

  it('attaches a root step to the unique positioned node when the walk allows it', () => {
    // An HR row with every higher level blank means the same group,
    // not a new one. The walk opts in; the default stays off.
    const lk = lookup(DIVISION, BU1, DEEP_RESEARCH);
    expect(
      findRefinementMatch(lk, null, 'department', 'Research', true),
    ).toEqual({ kind: 'attach', node: DEEP_RESEARCH });
    expect(findRefinementMatch(lk, null, 'department', 'Research')).toBeNull();
  });

  it('leaves an ambiguous root step to path identity', () => {
    // The same name under two branches: a root step cannot say which.
    const other = node(5, 'department', 'Research', 3);
    expect(
      findRefinementMatch(
        lookup(DIVISION, BU1, BU2, DEEP_RESEARCH, other),
        null,
        'department',
        'Research',
        true,
      ),
    ).toBeNull();
  });

  it('treats a root node as the shallower form of a positioned step, and matches a root step only on request', () => {
    const rootResearch = node(4, 'department', 'Research', null);
    expect(
      findRefinementMatch(
        lookup(DIVISION, rootResearch),
        DIVISION.id,
        'department',
        'Research',
      ),
    ).toEqual({ kind: 'reparent', node: rootResearch });
    // The reverse is off by default: a path with no higher levels at all can
    // be an explicit clear (the business-group null override), and only the
    // caller knows which it is.
    expect(
      findRefinementMatch(
        lookup(DIVISION, BU1, DEEP_RESEARCH),
        null,
        'department',
        'Research',
      ),
    ).toBeNull();
  });

  it('keeps same-name nodes on diverging branches distinct', () => {
    // Research exists under BU1; the step is under BU2 — sibling branches
    // refine nothing, so this is a different department.
    expect(
      findRefinementMatch(
        lookup(DIVISION, BU1, BU2, DEEP_RESEARCH),
        BU2.id,
        'department',
        'Research',
      ),
    ).toBeNull();
  });

  it('falls back to path identity when the match is ambiguous', () => {
    const alsoResearch = node(5, 'department', 'Research', 3);
    expect(
      findRefinementMatch(
        lookup(DIVISION, BU1, BU2, DEEP_RESEARCH, alsoResearch),
        DIVISION.id,
        'department',
        'Research',
      ),
    ).toBeNull();
  });

  it('never matches a node on the step’s own ancestor chain', () => {
    // A corrupt tree could put a same-name node above the step; matching it
    // would re-parent a node under its own descendant.
    const weird = node(9, 'department', 'Research', null);
    const child = node(10, 'team', 'Desk', 9);
    expect(
      findRefinementMatch(
        lookup(weird, child),
        child.id,
        'department',
        'Research',
      ),
    ).toBeNull();
  });
});

describe('deriveRefinedNodeMerges', () => {
  it('pairs a shallower ghost with its unique refined survivor, one direction only', () => {
    const ghost = node(5, 'department', 'Research', 1);
    expect(
      deriveRefinedNodeMerges([DIVISION, BU1, DEEP_RESEARCH, ghost]),
    ).toEqual([{ ghostId: ghost.id, survivorId: DEEP_RESEARCH.id }]);
  });

  it('pairs nothing across diverging branches or ambiguous chains', () => {
    const alsoResearch = node(5, 'department', 'Research', 3);
    expect(
      deriveRefinedNodeMerges([
        DIVISION,
        BU1,
        BU2,
        DEEP_RESEARCH,
        alsoResearch,
      ]),
    ).toEqual([]);

    const ghost = node(6, 'department', 'Research', 1);
    // Two deeper candidates: the ghost's match is ambiguous, so it stays.
    expect(
      deriveRefinedNodeMerges([
        DIVISION,
        BU1,
        BU2,
        DEEP_RESEARCH,
        alsoResearch,
        ghost,
      ]),
    ).toEqual([]);
  });

  it('ignores cost centers entirely', () => {
    const cc = node(7, 'cost_center', '70133 - Sales');
    const cc2 = node(8, 'cost_center', '70133 - Sales', null);
    expect(deriveRefinedNodeMerges([cc, cc2, DIVISION])).toEqual([]);
  });
});

describe('deriveRefinedNodeMerges root ghosts', () => {
  const ENTITY = node(10, 'entity', 'Acme');
  const POSITIONED = node(11, 'business_group', 'Testing', 10);
  const ROOT_GHOST = node(12, 'business_group', 'Testing', null);

  it('leaves a parentless duplicate alone by default', () => {
    expect(deriveRefinedNodeMerges([ENTITY, POSITIONED, ROOT_GHOST])).toEqual(
      [],
    );
  });

  it('folds it into the positioned node when asked', () => {
    expect(
      deriveRefinedNodeMerges([ENTITY, POSITIONED, ROOT_GHOST], true),
    ).toEqual([{ ghostId: 12, survivorId: 11 }]);
  });
});
