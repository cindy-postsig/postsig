import React from 'react';

export const Streamdown = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'streamdown-mock' }, children);

export const TableCopyDropdown = () =>
  React.createElement('button', { 'data-testid': 'table-copy-dropdown' });

export const TableDownloadDropdown = () =>
  React.createElement('button', { 'data-testid': 'table-download-dropdown' });

export type CustomRenderer = unknown;
