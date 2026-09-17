'use client';

import type { ReactNode } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import type {
  SynthesisToolOutput,
  SynthesisSection,
} from '@/lib/v2/chat/client';
import { isToolError } from '@/lib/v2/chat/client';
import { ContractLink } from '@/components/chatbot/ContractLink';

const CONTRACT_REFERENCE_PATTERN = /\[Contract #(\d+)\]/g;

function parseContractReferences(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(CONTRACT_REFERENCE_PATTERN.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const contractId = parseInt(match[1], 10);
    parts.push(
      <ContractLink
        key={`${contractId}-${match.index}`}
        contractId={contractId}
      >
        Contract #{contractId}
      </ContractLink>,
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function TextWithContractLinks({ text }: { text: string }) {
  return <>{parseContractReferences(text)}</>;
}

export function SynthesisSummary({ data }: { data: SynthesisToolOutput }) {
  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <div className="flex items-center gap-1 text-xs text-red-600">
        <AlertCircle className="h-3 w-3" />
        {data.error}
      </div>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Vendor Intelligence Synthesis
        </CardTitle>
        <CardDescription className="text-xs">
          {data.vendorName} • Generated {formatTimestamp(data.generatedAt)}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md bg-background/50 p-3">
          <h4 className="font-semibold mb-2 text-xs text-muted-foreground">
            Executive Summary
          </h4>
          <p className="text-sm leading-relaxed">
            <TextWithContractLinks text={data.executiveSummary} />
          </p>
        </div>

        <Accordion
          type="multiple"
          defaultValue={
            data.sections[0]?.title ? [data.sections[0].title] : undefined
          }
        >
          {data.sections.map((section) => (
            <AccordionItem key={section.title} value={section.title}>
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  {section.title}
                  <Badge variant="outline" className="text-xs">
                    {section.dataSource}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <SectionContent section={section} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {data.recommendations && data.recommendations.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
            <h4 className="font-semibold mb-2 flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3 w-3" />
              Recommendations
            </h4>
            <ul className="space-y-1 text-sm">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-mono text-amber-600 dark:text-amber-500">
                    •
                  </span>
                  <span>
                    <TextWithContractLinks text={rec} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DataSourcesBadges
          available={data.availableData}
          missing={data.missingData}
          partial={data.partialResults}
        />
      </CardContent>
    </Card>
  );
}

function SectionContent({ section }: { section: SynthesisSection }) {
  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        <TextWithContractLinks text={section.content} />
      </p>
      {section.insights.length > 0 && (
        <div>
          <h5 className="font-semibold mb-1 text-xs">Key Insights:</h5>
          <ul className="space-y-1">
            {section.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-primary">→</span>
                <span>
                  <TextWithContractLinks text={insight} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DataSourcesBadges({
  available,
  missing,
  partial,
}: {
  available: string[];
  missing: string[];
  partial: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
      <span className="text-muted-foreground">Data sources:</span>
      {available.map((source) => (
        <Badge key={source} variant="secondary" className="text-xs">
          <CheckCircle2 className="text-green-600 dark:text-green-500 mr-1 h-3 w-3" />
          {source}
        </Badge>
      ))}
      {missing.length > 0 && (
        <>
          {missing.map((source) => (
            <Badge
              key={source}
              variant="outline"
              className="text-xs opacity-50"
            >
              {source}
            </Badge>
          ))}
        </>
      )}
      {partial && (
        <span className="ml-auto text-xs text-amber-600 dark:text-amber-500">
          ⚠ Partial results
        </span>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function SynthesisSummaryLoading() {
  return (
    <Card className="animate-pulse border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Synthesizing vendor intelligence...
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-20 rounded-md bg-muted/50" />
          <div className="h-12 rounded-md bg-muted/30" />
          <div className="h-12 rounded-md bg-muted/30" />
        </div>
      </CardContent>
    </Card>
  );
}
