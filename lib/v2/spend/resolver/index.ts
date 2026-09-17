export { resolveFeeSegments } from './resolveFeeSegments';
export type { LineageGraph, ResolveOptions } from './resolveFeeSegments';
export { buildSpendLineage, lineageFor, EMPTY_LINEAGE } from './lineage';
export type { SpendLineage, ContractLineage, LineageMember } from './lineage';
export {
  getTermLength,
  reconcileTermLength,
  segmentSpanMonths,
} from './termLength';
export type { TermLengthResult } from './termLength';
export { INFERENCE_REASONS } from './shapes';
export { annualFeeRepeats } from './initialTerm';
