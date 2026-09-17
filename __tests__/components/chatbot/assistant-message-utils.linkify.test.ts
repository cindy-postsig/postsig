import { describe, expect, it } from '@jest/globals';

import { linkifyContractReferences } from '@/components/chatbot/assistant-message-utils';

describe('linkifyContractReferences', () => {
  describe('strips backtick-wrapped contract references', () => {
    it('unwraps `contract-123` backtick format', () => {
      const input = 'See `contract-45` for details';
      const result = linkifyContractReferences(input);
      expect(result).toBe('See [Contract #45](/contracts/45) for details');
    });

    it('unwraps `Contract #123` backtick format', () => {
      const input = 'Check `Contract #99` now';
      const result = linkifyContractReferences(input);
      expect(result).toBe('Check [Contract #99](/contracts/99) now');
    });

    it('unwraps `[Contract #123](/contracts/123)` backtick format', () => {
      const input = 'Here is `[Contract #45](/contracts/45)` for you';
      const result = linkifyContractReferences(input);
      expect(result).toBe('Here is [Contract #45](/contracts/45) for you');
    });

    it('unwraps `vendor-123` backtick format', () => {
      const input = 'See `vendor-7` details';
      const result = linkifyContractReferences(input);
      expect(result).toBe('See [Vendor #7](/vendors/7) details');
    });

    it('unwraps `Vendor #123` backtick format', () => {
      const input = 'See `Vendor #12` page';
      const result = linkifyContractReferences(input);
      expect(result).toBe('See [Vendor #12](/vendors/12) page');
    });

    it('unwraps `[Vendor #123](/vendors/123)` backtick format', () => {
      const input = 'Link: `[Vendor #5](/vendors/5)` here';
      const result = linkifyContractReferences(input);
      expect(result).toBe('Link: [Vendor #5](/vendors/5) here');
    });
  });

  describe('transforms contract references without backticks', () => {
    it('transforms contract-123 to markdown link', () => {
      expect(linkifyContractReferences('See contract-45')).toBe(
        'See [Contract #45](/contracts/45)',
      );
    });

    it('transforms Contract #123 to markdown link', () => {
      expect(linkifyContractReferences('See Contract #10 now')).toBe(
        'See [Contract #10](/contracts/10) now',
      );
    });

    it('does not double-process existing markdown links', () => {
      const input = 'See [Contract #45](/contracts/45) now';
      expect(linkifyContractReferences(input)).toBe(input);
    });

    it('transforms [Contract #123] without link to markdown link', () => {
      expect(linkifyContractReferences('[Contract #7]')).toBe(
        '[Contract #7](/contracts/7)',
      );
    });
  });

  describe('does not break unrelated backtick content', () => {
    it('preserves inline code that is not a reference', () => {
      const input = 'Use `NET-30` payment terms';
      expect(linkifyContractReferences(input)).toBe(input);
    });

    it('preserves inline code with arbitrary content', () => {
      const input = 'Run `npm install` first';
      expect(linkifyContractReferences(input)).toBe(input);
    });
  });
});
