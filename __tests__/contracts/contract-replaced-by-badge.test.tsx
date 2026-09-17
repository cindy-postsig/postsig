/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import ContractReplacedByBadge from '@/components/contracts/ContractReplacedByBadge';
import { buildReplacementPromptCopy } from '@/lib/contracts/replacementPrompt';

describe('ContractReplacedByBadge', () => {
  it('names the replacing contract and links to it', () => {
    render(
      <ContractReplacedByBadge newContractId={9} newContractNumber="SO-1042" />,
    );

    const link = screen.getByRole('link', { name: /Replaced by SO-1042/ });
    expect(link.getAttribute('href')).toBe('/contracts/9');
  });
});

describe('buildReplacementPromptCopy', () => {
  const summary = {
    id: 9,
    orderNumber: 'SO-1042',
    vendorName: 'Acme Corp',
    firstProductName: 'Widget Pro',
    startDate: '2026-02-01',
  };

  it('formats the date in the viewer pattern', () => {
    // Formatted server-side so the client bundle carries no locale dependency.
    expect(buildReplacementPromptCopy(summary, 'dd/MM/yyyy').contractDate).toBe(
      '01/02/2026',
    );
    expect(buildReplacementPromptCopy(summary, 'MM/dd/yyyy').contractDate).toBe(
      '02/01/2026',
    );
  });

  it('falls back to a contract label when there is no order number', () => {
    // The banner asks the user to compare against a named contract; a blank
    // name would leave them nothing to open.
    expect(
      buildReplacementPromptCopy(
        { ...summary, orderNumber: null },
        'dd/MM/yyyy',
      ).contractNumber,
    ).toBe('Contract 9');
  });

  it('treats a literal "null" order number as absent', () => {
    expect(
      buildReplacementPromptCopy(
        { ...summary, orderNumber: 'null' },
        'dd/MM/yyyy',
      ).contractNumber,
    ).toBe('Contract 9');
  });

  it('carries a missing date through as null rather than a fallback string', () => {
    expect(
      buildReplacementPromptCopy({ ...summary, startDate: null }, 'dd/MM/yyyy')
        .contractDate,
    ).toBeNull();
  });

  it('keeps a missing product null so the banner can omit the clause', () => {
    const copy = buildReplacementPromptCopy(
      { ...summary, firstProductName: null },
      'dd/MM/yyyy',
    );

    expect(copy.firstProductName).toBeNull();
    expect(copy.vendorName).toBe('Acme Corp');
  });
});
