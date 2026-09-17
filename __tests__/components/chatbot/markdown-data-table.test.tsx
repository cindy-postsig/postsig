/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { UIMessage } from '@ai-sdk/react';
import React from 'react';

import { MarkdownDataTable } from '@/components/chatbot/MarkdownDataTable';
import {
  SPEND_TABLE_COLUMN_SPECS,
  SPEND_TOTAL_ROW_LABEL,
} from '@/lib/v2/chat/guidance/spend-guidance';
import { PAYMENT_TERMS_TABLE_COLUMN_SPECS } from '@/lib/v2/chat/guidance/payment-terms-guidance';

jest.mock('@/components/chatbot/ContractLink', () => ({
  ContractLink: ({
    contractId,
    children,
  }: {
    contractId: number;
    children?: React.ReactNode;
  }) => <a href={`/contracts/${contractId}`}>{children ?? contractId}</a>,
}));

function asPart(part: unknown): UIMessage['parts'][number] {
  return part as UIMessage['parts'][number];
}

describe('MarkdownDataTable', () => {
  it('renders spend synthesis tables with spend summary formatting', () => {
    const toolParts: UIMessage['parts'] = [
      asPart({
        type: 'tool-calculate_spend',
        state: 'output-available',
        output: {
          type: 'vendor_total',
          vendorName: 'Bloomberg',
          contractCount: 1,
          totals: {
            totalContractValueUSD: 1000,
            currentBudgetUSD: 500,
            projectedBudgetUSD: 550,
          },
          contracts: [
            {
              contractId: 101,
              vendorName: 'Bloomberg',
              contractType: 'Terminal',
              currentBudgetUSD: 500,
              projectedBudgetUSD: 550,
              totalContractValueUSD: 1000,
            },
          ],
        },
      }),
    ];

    render(
      <MarkdownDataTable toolParts={toolParts}>
        <thead>
          <tr>
            {SPEND_TABLE_COLUMN_SPECS.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>101</td>
            <td>Bloomberg</td>
            <td>Terminal</td>
            <td>$500</td>
            <td>$550</td>
            <td>$1,000</td>
          </tr>
          <tr>
            <td>{SPEND_TOTAL_ROW_LABEL}</td>
            <td></td>
            <td></td>
            <td>$500</td>
            <td>$550</td>
            <td>$1,000</td>
          </tr>
        </tbody>
      </MarkdownDataTable>,
    );

    expect(screen.getAllByText('Bloomberg').length).toBeGreaterThan(0);
    const contractLinks = screen.getAllByRole('link', { name: '101' });
    expect(
      contractLinks.some((el) => el.getAttribute('href') === '/contracts/101'),
    ).toBe(true);
    expect(screen.queryByText('Current Spend')).not.toBeNull();
    expect(screen.queryByText('Projected Spend')).not.toBeNull();
    expect(screen.queryByText(SPEND_TOTAL_ROW_LABEL)).not.toBeNull();
    expect(screen.getAllByText('$1,000').length).toBeGreaterThan(0);
  });

  it('renders payment terms synthesis tables with payment terms summary formatting', () => {
    const toolParts: UIMessage['parts'] = [
      asPart({
        type: 'tool-summarize_payment_terms',
        state: 'output-available',
        output: {
          type: 'payment_terms_summary',
          vendorName: 'Bloomberg',
          contractCount: 2,
          lineageGroups: 1,
          contracts: [
            {
              id: 101,
              contractType: 'MSA',
              billingFrequency: 'Annual',
              currency: 'USD',
              paymentTerms: 'Net 30',
              termStartDate: '2025-01-01',
              termEndDate: '2025-12-31',
              hasPaymentTerms: true,
              link: '/contracts/101',
              isRoot: true,
              governedBy: 101,
            },
            {
              id: 102,
              contractType: 'Order Form',
              billingFrequency: 'Monthly',
              currency: 'USD',
              paymentTerms: 'Net 15',
              termStartDate: '2025-02-01',
              termEndDate: '2026-01-31',
              hasPaymentTerms: true,
              link: '/contracts/102',
              isRoot: false,
              governedBy: 101,
            },
          ],
          summary: 'Found 2 Bloomberg contract(s) in 1 lineage group(s).',
        },
      }),
    ];

    render(
      <MarkdownDataTable toolParts={toolParts}>
        <thead>
          <tr>
            {PAYMENT_TERMS_TABLE_COLUMN_SPECS.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>101</td>
            <td>Annual</td>
            <td>USD</td>
            <td>Jan 2025 – Dec 2025</td>
            <td>Net 30</td>
          </tr>
          <tr>
            <td>102</td>
            <td>Monthly</td>
            <td>USD</td>
            <td>Feb 2025 – Jan 2026</td>
            <td>Net 15</td>
          </tr>
        </tbody>
      </MarkdownDataTable>,
    );

    expect(screen.queryByText('Bloomberg Payment Terms')).not.toBeNull();
    expect(screen.getByRole('link', { name: '101' }).getAttribute('href')).toBe(
      '/contracts/101',
    );
    expect(screen.queryByText('Governs')).not.toBeNull();
    expect(screen.queryByText('Billing')).not.toBeNull();
    expect(screen.queryByText('Payment Terms')).not.toBeNull();
    expect(screen.queryByText('Net 30')).not.toBeNull();
  });

  it('renders query contracts synthesis tables with query summary formatting', () => {
    const toolParts: UIMessage['parts'] = [
      asPart({
        type: 'tool-query_price_increase',
        state: 'output-available',
        output: {
          type: 'price_increase',
          count: 2,
          totalIncreaseUSD: 400,
          contracts: [
            {
              id: 201,
              vendor: 'Bloomberg',
              contractType: 'Terminal',
              currentBudgetUSD: 1000,
              projectedBudgetUSD: 1200,
              increaseUSD: 200,
              increasePercent: 20,
              termEndDate: '2025-12-31',
            },
            {
              id: 202,
              vendor: 'MSCI',
              contractType: 'Data Feed',
              currentBudgetUSD: 1500,
              projectedBudgetUSD: 1700,
              increaseUSD: 200,
              increasePercent: 13.33,
              termEndDate: '2026-03-31',
            },
          ],
        },
      }),
    ];

    render(
      <MarkdownDataTable toolParts={toolParts}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Vendor</th>
            <th>Current Spend</th>
            <th>Projected Spend</th>
            <th>Increase</th>
            <th>Increase %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>201</td>
            <td>Bloomberg</td>
            <td>$1,000</td>
            <td>$1,200</td>
            <td>$200</td>
            <td>20%</td>
          </tr>
          <tr>
            <td>202</td>
            <td>MSCI</td>
            <td>$1,500</td>
            <td>$1,700</td>
            <td>$200</td>
            <td>13.33%</td>
          </tr>
        </tbody>
      </MarkdownDataTable>,
    );

    expect(screen.queryByText('2 contracts with escalators')).not.toBeNull();
    expect(screen.queryByText('Total Increase: $400')).not.toBeNull();
    // Vendor name links to the contract in the table
    expect(
      screen.getByRole('link', { name: 'Bloomberg' }).getAttribute('href'),
    ).toBe('/contracts/201');
    // Spend values render in separate table columns
    expect(screen.queryByText('$1,000')).not.toBeNull();
    expect(screen.queryByText('$1,200')).not.toBeNull();
  });

  it('renders larger query contract result sets with the generic data table', () => {
    const toolParts: UIMessage['parts'] = [
      asPart({
        type: 'tool-query_price_increase',
        state: 'output-available',
        output: {
          type: 'price_increase',
          count: 4,
          totalIncreaseUSD: 700,
          contracts: [
            {
              id: 201,
              vendor: 'Bloomberg',
              contractType: 'Terminal',
              currentBudgetUSD: 1000,
              projectedBudgetUSD: 1200,
              increaseUSD: 200,
              increasePercent: 20,
              termEndDate: '2025-12-31',
            },
            {
              id: 202,
              vendor: 'MSCI',
              contractType: 'Data Feed',
              currentBudgetUSD: 1500,
              projectedBudgetUSD: 1700,
              increaseUSD: 200,
              increasePercent: 13.33,
              termEndDate: '2026-03-31',
            },
            {
              id: 203,
              vendor: 'FactSet',
              contractType: 'Analytics',
              currentBudgetUSD: 900,
              projectedBudgetUSD: 1000,
              increaseUSD: 100,
              increasePercent: 11.11,
              termEndDate: '2026-06-30',
            },
            {
              id: 204,
              vendor: 'S&P',
              contractType: 'Index License',
              currentBudgetUSD: 1800,
              projectedBudgetUSD: 2000,
              increaseUSD: 200,
              increasePercent: 11.11,
              termEndDate: '2026-09-30',
            },
          ],
        },
      }),
    ];

    render(
      <MarkdownDataTable toolParts={toolParts}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Vendor</th>
            <th>Current Spend</th>
            <th>Projected Spend</th>
            <th>Increase</th>
            <th>Increase %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>201</td>
            <td>Bloomberg</td>
            <td>$1,000</td>
            <td>$1,200</td>
            <td>$200</td>
            <td>20%</td>
          </tr>
          <tr>
            <td>202</td>
            <td>MSCI</td>
            <td>$1,500</td>
            <td>$1,700</td>
            <td>$200</td>
            <td>13.33%</td>
          </tr>
          <tr>
            <td>203</td>
            <td>FactSet</td>
            <td>$900</td>
            <td>$1,000</td>
            <td>$100</td>
            <td>11.11%</td>
          </tr>
          <tr>
            <td>204</td>
            <td>S&amp;P</td>
            <td>$1,800</td>
            <td>$2,000</td>
            <td>$200</td>
            <td>11.11%</td>
          </tr>
        </tbody>
      </MarkdownDataTable>,
    );

    expect(screen.queryByText('4 contracts with escalators')).not.toBeNull();
    expect(screen.getByRole('link', { name: '201' }).getAttribute('href')).toBe(
      '/contracts/201',
    );
    expect(screen.queryByRole('link', { name: 'Terminal' })).toBeNull();
    expect(screen.queryByText(/Current: \$1,000/)).toBeNull();
    expect(screen.queryByText('Increase %')).not.toBeNull();
  });
});
