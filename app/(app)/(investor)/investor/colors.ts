import type { InvestmentStage, CashPosition } from './types';

// Partial: synthetic stages (Reclassification, Reverse/Forward Split) fall back
// to the default gray in getStageColor rather than carrying their own color.
// Every other stage, granular ones included, carries its own entry.
export const STAGE_COLORS: Partial<Record<InvestmentStage, string>> = {
  'Pre-Seed': '#8C877F', // Warm Gray
  Seed: '#8C9A3B', // Green
  'Series Seed': '#6F8A2E', // Olive
  'Series A': '#2B3FB0', // Blue
  'Series B': '#5545AE', // Purple
  'Series C': '#2A7A64', // Teal Green
  'Series D': '#9F3E9E', // Magenta
  'Series E': '#BFAD25', // Gold
  'Series F': '#302881', // Indigo
  'Series G': '#255044', // Deep Teal
  IPO: '#2B2B34', // Near Black
  'Winding Down': '#CB5724', // Burnt Orange
  Dissolved: '#86182A', // Burgundy
  Acquired: '#516590', // Slate Blue
  Merged: '#828EA6', // Light Slate Blue

  // Sub-stages step lighter than the stage they are named after; extensions sit
  // a shade darker. Every stage carries its own colour — none inherits.
  'Pre-Seed Extension': '#726D66',
  'Seed-1': '#A7B746',
  'Seed-2': '#B5C363',
  'Seed-3': '#C3CF81',
  'Seed-4': '#D1DA9E',
  'Seed-5': '#DFE5BC',
  'Seed Extension': '#6A752D',
  'Series Seed-1': '#88A938',
  'Series Seed-2': '#9EC248',
  'Series Seed-3': '#AECC66',
  'Series Seed-4': '#BED685',
  'Series Seed-5': '#CFE0A3',
  'Series Seed Extension': '#506421',
  'Series A-1': '#364DCE',
  'Series A-2': '#576AD6',
  'Series A-3': '#7887DE',
  'Series A-4': '#98A4E6',
  'Series A-5': '#B9C1EE',
  'Series A Extension': '#213087',
  'Series B-1': '#6C5DBF',
  'Series B-2': '#867ACA',
  'Series B-3': '#A197D6',
  'Series B-4': '#BCB5E2',
  'Series B-5': '#D6D2ED',
  'Series B Extension': '#433789',
  'Series C-1': '#34987D',
  'Series C-2': '#3FB796',
  'Series C-3': '#59C6A8',
  'Series C-4': '#77D0B8',
  'Series C-5': '#95DBC8',
  'Series C Extension': '#1D5445',
  'Series D-1': '#B94CB8',
  'Series D-2': '#C56AC4',
  'Series D-3': '#D087D0',
  'Series D-4': '#DCA4DB',
  'Series D-5': '#E7C2E7',
  'Series D Extension': '#7A307A',
  'Series E-1': '#D8C535',
  'Series E-2': '#DECF57',
  'Series E-3': '#E5D979',
  'Series E-4': '#ECE29B',
  'Series E-5': '#F2ECBE',
  'Series E Extension': '#94861D',
  'Series F-1': '#3C32A0',
  'Series F-2': '#473BBF',
  'Series F-3': '#6258CB',
  'Series F-4': '#8077D5',
  'Series F-5': '#9D96DF',
  'Series F Extension': '#221C5A',
  'Series G-1': '#326C5C',
  'Series G-2': '#3F8873',
  'Series G-3': '#4CA48B',
  'Series G-4': '#62B69F',
  'Series G-5': '#7EC3B0',
  'Series G Extension': '#152D26',
};

export const CASH_POSITION_COLORS: Record<CashPosition, string> = {
  '0-3 months': '#A71A45', // Crimson - critical
  '4-6 months': '#CB5724', // Burnt Orange - warning
  '7-12 months': '#2986B1', // Light Blue - okay
  '12+ months': '#636D2A', // Olive Green - healthy
};

export const SECURITY_COLORS: Record<string, string> = {
  common: '#160F5B',
  preferred: '#396CD1',
  'series-seed': '#828F3A',
  'series-seed-2': '#636D2A',
  'series-seed-3': '#4A5320',
  'series-a': '#2986B1',
  'series-b': '#5545AE',
  'series-c': '#160F5B',
  'series-d': '#01637D',
  'series-e': '#5545AE',
  'series-f': '#160F5B',
  'series-g': '#828F3A',
  'outstanding-reserved-options': '#6b7280',
  'employee-options': '#A71A45',
  'advisor-warrants': '#86182A',
  'options-warrants': '#689848',
};

export function getStageColor(stage: InvestmentStage): string {
  return STAGE_COLORS[stage] || '#8C877F';
}

export function getCashPositionColor(position?: CashPosition): string {
  if (!position) return '#8C877F';
  return CASH_POSITION_COLORS[position] || '#8C877F';
}

export function getSecurityColor(securityId: string): string {
  return SECURITY_COLORS[securityId] || '#8C877F';
}

const LIGHT_BACKGROUND_SECURITIES = new Set<string>([]);

export function getSecurityLabelColor(securityId: string): string {
  return LIGHT_BACKGROUND_SECURITIES.has(securityId) ? '#1f2937' : 'white';
}
