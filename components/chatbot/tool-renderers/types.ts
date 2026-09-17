import type { ComponentType, ReactNode } from 'react';

export interface ToolRendererProps {
  state: string;
  output?: unknown;
  isStillStreaming: boolean;
  keyProp: string;
}

export interface ToolRendererConfig {
  loading: ComponentType;
  renderSummary: (data: unknown, key: string) => ReactNode;
  errorLabel: string;
}
