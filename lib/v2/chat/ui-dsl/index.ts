import { UIBlockSchema, type UIBlock } from './schema';

export type {
  UIBlock,
  Stat,
  Badge,
  AlertLevel,
  ChartBlock,
  StatGridBlock,
  AlertBlock,
  BarListBlock,
  CardBlock,
  CardGridBlock,
  LineageBlock,
  LineageNode,
} from './schema';
export { UIBlockSchema };

export type ParseResult =
  | { ok: true; block: UIBlock }
  | { ok: false; raw: string };

export function parseUIBlock(raw: string): ParseResult {
  try {
    const json = JSON.parse(raw);
    const result = UIBlockSchema.safeParse(json);
    if (!result.success) return { ok: false, raw };
    return { ok: true, block: result.data };
  } catch {
    return { ok: false, raw };
  }
}
