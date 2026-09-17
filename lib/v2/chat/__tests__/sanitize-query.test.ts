import { sanitizeQuery } from '../sanitize-query';

describe('sanitizeQuery', () => {
  it('replaces org name with ACME (case-insensitive)', () => {
    const result = sanitizeQuery({
      query: 'What contracts does Acme Corp have?',
      organizationName: 'Acme Corp',
      orgUserNames: [],
    });
    expect(result).toBe('What contracts does [ACME] have?');
  });

  it('replaces full user names with John Doe', () => {
    const result = sanitizeQuery({
      query: 'Show me contracts assigned to Alice Smith',
      organizationName: '',
      orgUserNames: ['Alice Smith'],
    });
    expect(result).toBe('Show me contracts assigned to [John Doe]');
  });

  it('replaces standalone first/last names with John Doe', () => {
    const result = sanitizeQuery({
      query: 'Ask Alice about the renewal',
      organizationName: '',
      orgUserNames: ['Alice Smith'],
    });
    expect(result).toBe('Ask [John Doe] about the renewal');
  });

  it('longest-first prevents partial replacement artifacts', () => {
    const result = sanitizeQuery({
      query: 'Mary Jane Watson signed the contract',
      organizationName: '',
      orgUserNames: ['Mary Jane Watson', 'Mary Jane'],
    });
    expect(result).toBe('[John Doe] signed the contract');
  });

  it('whole-word boundary: "Al" matches "Al" but not "also"', () => {
    const result = sanitizeQuery({
      query: 'Al also reviewed the document',
      organizationName: '',
      orgUserNames: ['Al'],
    });
    expect(result).toBe('[John Doe] also reviewed the document');
  });

  it('handles regex special chars in names (apostrophes, hyphens)', () => {
    const result = sanitizeQuery({
      query: "O'Brien and Mary-Jane checked in",
      organizationName: '',
      orgUserNames: ["Tim O'Brien", 'Mary-Jane Parker'],
    });
    expect(result).toBe('[John Doe] and [John Doe] checked in');
  });

  it('handles empty query gracefully', () => {
    const result = sanitizeQuery({
      query: '',
      organizationName: 'TestOrg',
      orgUserNames: ['Alice Smith'],
    });
    expect(result).toBe('');
  });

  it('handles empty org name gracefully', () => {
    const result = sanitizeQuery({
      query: 'Show me all contracts',
      organizationName: '',
      orgUserNames: [],
    });
    expect(result).toBe('Show me all contracts');
  });

  it('handles empty user list gracefully', () => {
    const result = sanitizeQuery({
      query: 'What is the status of my contract?',
      organizationName: 'TestOrg',
      orgUserNames: [],
    });
    expect(result).toBe('What is the status of my contract?');
  });

  it('replaces both org name and user names in the same query', () => {
    const result = sanitizeQuery({
      query: 'Does Globex have any contracts with Homer Simpson?',
      organizationName: 'Globex',
      orgUserNames: ['Homer Simpson'],
    });
    expect(result).toBe('Does [ACME] have any contracts with [John Doe]?');
  });

  it('handles multiple occurrences of the same name', () => {
    const result = sanitizeQuery({
      query: 'Alice sent the doc to Alice',
      organizationName: '',
      orgUserNames: ['Alice Smith'],
    });
    expect(result).toBe('[John Doe] sent the doc to [John Doe]');
  });

  it('does not corrupt output when a name token matches the placeholder', () => {
    const result = sanitizeQuery({
      query: 'John Smith approved the request',
      organizationName: '',
      orgUserNames: ['John Smith'],
    });
    expect(result).toBe('[John Doe] approved the request');
  });

  it('handles multiple users where one name is a substring of the placeholder', () => {
    const result = sanitizeQuery({
      query: 'Jane Doe and John Smith met today',
      organizationName: '',
      orgUserNames: ['Jane Doe', 'John Smith'],
    });
    expect(result).toBe('[John Doe] and [John Doe] met today');
  });

  it('skips single-character name tokens', () => {
    const result = sanitizeQuery({
      query: 'I need a report from J Smith',
      organizationName: '',
      orgUserNames: ['J Smith'],
    });
    expect(result).toBe('I need a report from [John Doe]');
  });

  it('replaces email addresses with placeholder', () => {
    const result = sanitizeQuery({
      query: 'Send it to alice@globex.com and bob.smith@example.org',
      organizationName: '',
      orgUserNames: [],
    });
    expect(result).toBe('Send it to [user@example.com] and [user@example.com]');
  });

  it('replaces emails before name replacement', () => {
    const result = sanitizeQuery({
      query: 'Contact alice.smith@globex.com or Alice Smith directly',
      organizationName: 'Globex',
      orgUserNames: ['Alice Smith'],
    });
    expect(result).toBe('Contact [user@example.com] or [John Doe] directly');
  });
});
