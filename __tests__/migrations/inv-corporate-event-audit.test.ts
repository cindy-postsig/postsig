import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from '@jest/globals';

const SCRIPT_PATH = path.join(
  __dirname,
  '../../scripts/inv-corporate-event-audit.sql',
);

const sql = fs.readFileSync(SCRIPT_PATH, 'utf8');

/** The script minus comment lines, so the guard reads statements only. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/**
 * The audit lists relationships recorded by workaround so a person can turn
 * them into corporate events. It must stay a report: no statement may write,
 * and every signal it promises must be produced.
 */
describe('inv-corporate-event-audit script', () => {
  it('contains no data or schema changes', () => {
    for (const token of [
      'INSERT',
      'UPDATE',
      'DELETE',
      'ALTER',
      'DROP',
      'CREATE',
    ]) {
      expect(statements).not.toMatch(new RegExp(`\\b${token}\\b`, 'i'));
    }
  });

  it('reports every signal', () => {
    for (const signal of [
      'exit_status',
      'registry_pointer',
      'text_hint',
      'already_modelled',
    ]) {
      expect(statements).toContain(`'${signal}'`);
    }
  });

  it('reads the workaround sources it documents', () => {
    expect(statements).toContain("IN ('exited_merger', 'exited_acquisition')");
    expect(statements).toContain('merged_into_company_id');
    expect(statements).toContain('inv_corporate_event_party');
    expect(statements).toMatch(
      /merg\|acqui\|spin\|roll-\?up\|holdco\|redomicil/,
    );
  });

  it('exposes the documented columns', () => {
    for (const column of [
      'organization_id',
      'company_id',
      'company_name',
      'status',
      'signal',
      'hint',
    ]) {
      expect(statements).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });
});
