'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { Streamdown as StreamdownType } from 'streamdown';

type MarkdownProps = ComponentProps<typeof StreamdownType>;

function MarkdownFallback({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="whitespace-pre-wrap">{children}</p>;
}

const LazyMarkdown = dynamic<MarkdownProps>(
  () => import('streamdown').then((mod) => mod.Streamdown),
  {
    ssr: false,
    loading: () => <MarkdownFallback />,
  },
);

export { LazyMarkdown };
