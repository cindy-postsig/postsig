import { z } from 'zod';

const TrendSchema = z.enum(['up', 'down', 'flat']);

const StatSchema = z.object({
  label: z.string(),
  value: z.string(),
  trend: TrendSchema.optional(),
  delta: z.string().optional(),
});

const BadgeToneSchema = z.enum(['neutral', 'positive', 'warning', 'critical']);

const BadgeSchema = z.object({
  label: z.string(),
  tone: BadgeToneSchema.optional(),
});

const AlertLevelSchema = z.enum(['info', 'warn', 'critical']);

const StatGridSchema = z.object({
  type: z.literal('stat-grid'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  items: z.array(StatSchema).min(1),
});

const ChartSchema = z.object({
  type: z.literal('chart'),
  kind: z.enum(['bar', 'line', 'pie']),
  title: z.string().optional(),
  // Bar charts only: 'vertical' (default) stacks bars upward with category
  // labels on the x-axis; 'horizontal' lays bars rightward with category labels
  // on the y-axis — better for ranking many items or long labels (vendor names).
  orientation: z.enum(['vertical', 'horizontal']).optional(),
  xKey: z.string(),
  yKeys: z.array(z.string()).min(1),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(1),
});

const AlertSchema = z.object({
  type: z.literal('alert'),
  level: AlertLevelSchema,
  title: z.string().optional(),
  body: z.string(),
});

const BarListItemSchema = z.object({
  // Plain text only — to link the row, use href (do NOT put markdown in label).
  label: z.string(),
  value: z.number(),
  // Right-aligned value columns shown after the bar, e.g. ["22.1%", "$652,250"].
  // The first is emphasized. Falls back to the raw value when omitted.
  values: z.array(z.string()).optional(),
  // Makes the row label a link. Internal app paths only, e.g. "/contracts/1311".
  href: z.string().optional(),
  // Short chip before the label, e.g. a contract-type abbreviation ("SO", "MSA").
  badge: z.string().optional(),
  tone: BadgeToneSchema.optional(),
});

const BarListSchema = z.object({
  type: z.literal('bar-list'),
  title: z.string().optional(),
  items: z.array(BarListItemSchema).min(1),
  // Scale the bars against this max; defaults to the largest item value.
  max: z.number().optional(),
});

// `card`, `card-grid`, and `lineage` nest other UIBlocks / themselves, so the
// union is recursive. z.lazy lets the schema reference itself; the type is
// declared up front. Tabular data isn't a DSL primitive — the model emits
// markdown tables and MarkdownDataTable handles the enrichment.
export type UIBlock =
  | z.infer<typeof StatGridSchema>
  | z.infer<typeof ChartSchema>
  | z.infer<typeof AlertSchema>
  | z.infer<typeof BarListSchema>
  | CardBlock
  | CardGridBlock
  | LineageBlock;

interface CardBlock {
  type: 'card';
  title?: string;
  subtitle?: string;
  badges?: z.infer<typeof BadgeSchema>[];
  children: UIBlock[];
}

interface CardGridBlock {
  type: 'card-grid';
  columns?: 2 | 3;
  cards: CardBlock[];
}

interface LineageNode {
  /** The contract id — used to build the /contracts/:id link. */
  id: number;
  /** Human-readable local id (e.g. "MSA", "ADD-1", "SO-2"). */
  localId?: string;
  /**
   * Explicit display override — wins over contractType/products if set. Use
   * for contracts with a custom `name`; leave undefined to let the renderer
   * apply the standard rule (products if any, else contractType).
   */
  title?: string;
  /** Contract type, e.g. "Master Services Agreement". Used as the display
   * text only when `products` is empty. */
  contractType?: string;
  /** Product names from the tool's `flat[].products`. Joined by ", " when
   * displayed; preferred over `contractType` when non-empty. */
  products?: string[];
  /** Optional second line — rarely needed; reserve for cases the title/type
   * doesn't cover. */
  subtitle?: string;
  /** Pre-formatted date range, e.g. "Oct 2025 → Sep 2026". */
  dateRange?: string;
  /** Emphasize this node — typically the contract the user asked about. */
  highlighted?: boolean;
  children?: LineageNode[];
}

interface LineageBlock {
  type: 'lineage';
  title?: string;
  root: LineageNode;
}

const CardSchema: z.ZodType<CardBlock> = z.object({
  type: z.literal('card'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  badges: z.array(BadgeSchema).optional(),
  children: z.array(z.lazy(() => UIBlockSchema)),
});

const CardGridSchema: z.ZodType<CardGridBlock> = z.object({
  type: z.literal('card-grid'),
  columns: z.union([z.literal(2), z.literal(3)]).optional(),
  cards: z.array(CardSchema).min(1),
});

const LineageNodeSchema: z.ZodType<LineageNode> = z.object({
  id: z.number().int(),
  localId: z.string().optional(),
  title: z.string().optional(),
  contractType: z.string().optional(),
  products: z.array(z.string()).optional(),
  subtitle: z.string().optional(),
  dateRange: z.string().optional(),
  highlighted: z.boolean().optional(),
  children: z.array(z.lazy(() => LineageNodeSchema)).optional(),
});

const LineageSchema: z.ZodType<LineageBlock> = z.object({
  type: z.literal('lineage'),
  title: z.string().optional(),
  root: LineageNodeSchema,
});

export const UIBlockSchema: z.ZodType<UIBlock> = z.union([
  StatGridSchema,
  ChartSchema,
  AlertSchema,
  BarListSchema,
  CardSchema,
  CardGridSchema,
  LineageSchema,
]);

export type Stat = z.infer<typeof StatSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
export type AlertLevel = z.infer<typeof AlertLevelSchema>;
export type ChartBlock = z.infer<typeof ChartSchema>;
export type StatGridBlock = z.infer<typeof StatGridSchema>;
export type AlertBlock = z.infer<typeof AlertSchema>;
export type BarListBlock = z.infer<typeof BarListSchema>;
export type { CardBlock, CardGridBlock, LineageBlock, LineageNode };
