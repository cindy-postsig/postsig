import React, { memo, useState, useRef, useEffect } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import type { CustomRenderer } from 'streamdown';
import { Loader2, Copy, Check } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LazyMarkdown } from '@/components/chatbot/LazyMarkdown';
import {
  TOOL_REGISTRY,
  renderToolFromRegistry,
} from '@/components/chatbot/tool-renderers';
import { ContractLink } from '@/components/chatbot/ContractLink';
import { VendorLink } from '@/components/chatbot/VendorLink';
import {
  EnrichedMarkdownTable,
  MarkdownTableContext,
} from '@/components/chatbot/EnrichedMarkdownTable';
import {
  DSLRenderer,
  isUIBlockEnabled,
} from '@/components/chatbot/DSLRenderer';
import {
  VendorOverview,
  getVendorOverviewData,
} from '@/components/chatbot/VendorOverview';
import { parseUIBlock } from '@/lib/v2/chat/ui-dsl';
import { Button } from '@/components/ui/button';
import logger from '@/utils/pino';
import {
  linkifyContractReferences,
  getTextFromMessage,
  getToolTitle,
  getAssistantResponseMode,
  countSuccessfulToolOutputs,
  hasToolData,
  extractToolMeta,
  PROSE_CLASSES,
} from '@/components/chatbot/assistant-message-utils';

// --- MarkdownLink ---

interface MarkdownLinkProps {
  href?: string;
  children?: React.ReactNode;
}

function extractIdFromPath(pathname: string, prefix: string): number | null {
  const normalized = pathname.replace(/\/+$/, '');
  const pattern = new RegExp(`^\\/${prefix}\\/(\\d+)$`);
  const match = normalized.match(pattern);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isNaN(id) ? null : id;
}

function extractContractId(href?: string): number | null {
  if (!href) return null;
  if (href.startsWith('/')) return extractIdFromPath(href, 'contracts');
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const url = new URL(href);
      return extractIdFromPath(url.pathname, 'contracts');
    } catch {
      return null;
    }
  }
  return null;
}

function extractVendorId(href?: string): number | null {
  if (!href) return null;
  if (href.startsWith('/')) return extractIdFromPath(href, 'vendors');
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const url = new URL(href);
      return extractIdFromPath(url.pathname, 'vendors');
    } catch {
      return null;
    }
  }
  return null;
}

function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  return (
    href.startsWith('/') ||
    href.startsWith('https://') ||
    href.startsWith('http://')
  );
}

function MarkdownLink(props: MarkdownLinkProps) {
  const contractId = extractContractId(props.href);
  if (contractId !== null) {
    return (
      <ContractLink contractId={contractId}>{props.children}</ContractLink>
    );
  }

  const vendorId = extractVendorId(props.href);
  if (vendorId !== null) {
    return <VendorLink vendorId={vendorId}>{props.children}</VendorLink>;
  }

  if (!isSafeHref(props.href)) {
    return <span>{props.children}</span>;
  }

  const isExternal =
    props.href!.startsWith('https://') || props.href!.startsWith('http://');

  return (
    <a
      href={props.href}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {props.children}
    </a>
  );
}

/**
 * Visible placeholder while a ```ui block is still streaming and the JSON
 * isn't parseable yet. Prevents the raw JSON from flashing into view before
 * collapsing into the rendered component.
 */
function UIBlockSkeleton() {
  return (
    <div className="my-3 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Preparing view…</span>
    </div>
  );
}

function UIBlockFromMarkdown({
  raw,
  isStreaming,
}: {
  raw: string;
  isStreaming: boolean;
}) {
  const parsed = parseUIBlock(raw);
  const block =
    parsed.ok && isUIBlockEnabled(parsed.block) ? parsed.block : null;

  if (block) return <DSLRenderer block={block} />;
  if (isStreaming) return <UIBlockSkeleton />;
  return null;
}

const MARKDOWN_COMPONENTS = {
  a: MarkdownLink,
  table: EnrichedMarkdownTable,
} as const;

// Streamdown intercepts fenced ```ui blocks before default code rendering
// and hands us the raw text plus its own completeness flag. That flag only
// fires when animation is enabled, so we OR it with our message-level
// isStreaming from context to keep the skeleton working with animation off.
function UIBlockCustomComponent({
  code,
  isIncomplete,
}: {
  code: string;
  isIncomplete: boolean;
}) {
  const { isStreaming } = React.useContext(MarkdownTableContext);
  return (
    <UIBlockFromMarkdown raw={code} isStreaming={isIncomplete || isStreaming} />
  );
}

const UI_RENDERER: CustomRenderer = {
  language: 'ui',
  component: UIBlockCustomComponent,
};

const STREAMDOWN_PLUGINS = { renderers: [UI_RENDERER] };

// --- CopyMarkdownButton ---

function CopyMarkdownButton(props: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
    } catch (err) {
      logger.error({ err }, 'Failed to copy to clipboard');
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const icon = copied ? (
    <Check className="text-green-500 h-3.5 w-3.5" />
  ) : (
    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
  );

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleCopy}
      title="Copy response"
    >
      {icon}
    </Button>
  );
}

// --- UserMessage ---

interface UserMessageProps {
  text: string;
}

export const UserMessage = memo(function UserMessage(props: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-md bg-primary-2 px-4 py-2.5 font-sans-neue text-[length:var(--chat-msg-size,0.97rem)] text-foreground">
        {props.text}
      </div>
    </div>
  );
});

// --- Tool rendering helpers ---

function renderToolPart(
  part: UIMessage['parts'][number],
  messageId: string,
  index: number,
  isStreaming: boolean,
): React.ReactNode {
  const key = messageId + '-part-' + String(index);
  if (part.type === 'text') return null;

  const config = TOOL_REGISTRY[part.type];
  if (config) {
    const tp = part as { state: string; output?: unknown };
    return renderToolFromRegistry(config, tp, key, isStreaming);
  }

  return null;
}

// --- Sub-components ---

function ToolAccordionEntry(props: {
  part: UIMessage['parts'][number];
  messageId: string;
  partIndex: number;
  itemIndex: number;
  isStreaming: boolean;
}) {
  const output = renderToolPart(
    props.part,
    props.messageId,
    props.partIndex,
    props.isStreaming,
  );
  if (!output || !hasToolData(props.part)) return null;

  const meta = extractToolMeta(props.part);
  const value = 'tool-' + String(props.itemIndex);

  return (
    <AccordionItem value={value} className="rounded-md border">
      <AccordionTrigger className="px-4 py-2 text-sm hover:no-underline">
        {meta.title}
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">{output}</AccordionContent>
    </AccordionItem>
  );
}

function TextPartsList(props: {
  parts: UIMessage['parts'];
  messageId: string;
  toolParts: UIMessage['parts'];
  isStreaming?: boolean;
}) {
  const toolParts = props.toolParts;
  const isStreaming = !!props.isStreaming;
  const tableContextValue = React.useMemo(
    () => ({ toolParts, isStreaming }),
    [toolParts, isStreaming],
  );

  const text = props.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .filter((t) => t.trim())
    .join('\n\n');
  if (!text.trim()) return null;

  const normalized = text.replace(/\\+([[\]()/#])/g, '$1');
  const linked = linkifyContractReferences(normalized);

  return (
    <MarkdownTableContext.Provider value={tableContextValue}>
      <LazyMarkdown
        key={props.messageId + '-text'}
        components={MARKDOWN_COMPONENTS}
        parseIncompleteMarkdown
        plugins={STREAMDOWN_PLUGINS}
      >
        {linked}
      </LazyMarkdown>
    </MarkdownTableContext.Provider>
  );
}

function CollapsedToolOutputs(props: {
  toolParts: UIMessage['parts'];
  toolPartIndices: number[];
  messageId: string;
  isStreaming: boolean;
}) {
  return (
    <div className="mt-4">
      <Accordion type="multiple" className="space-y-2">
        {props.toolParts.map((part, i) => (
          <ToolAccordionEntry
            key={props.messageId + '-tool-' + String(i)}
            part={part}
            messageId={props.messageId}
            partIndex={props.toolPartIndices[i]}
            itemIndex={i}
            isStreaming={props.isStreaming}
          />
        ))}
      </Accordion>
    </div>
  );
}

function InlineToolOutputs(props: {
  parts: UIMessage['parts'];
  messageId: string;
  isStreaming: boolean;
}) {
  return (
    <>
      {props.parts.map((part, i) =>
        renderToolPart(part, props.messageId, i, props.isStreaming),
      )}
    </>
  );
}

interface AssistantContentProps {
  message: UIMessage;
  textParts: UIMessage['parts'];
  toolParts: UIMessage['parts'];
  toolPartIndices: number[];
  toolOutputCount: number;
  isStreaming: boolean;
}

function AssistantMessageContent(props: AssistantContentProps) {
  const m = props.message;
  const responseMode = getAssistantResponseMode(m.parts);
  const vendorHeroes = getVendorOverviewData(m.parts);

  return (
    <>
      {vendorHeroes.map((data, i) => (
        <VendorOverview key={m.id + '-vendor-' + String(i)} data={data} />
      ))}
      <TextPartsList
        parts={props.textParts}
        messageId={m.id}
        toolParts={props.toolParts}
        isStreaming={props.isStreaming}
      />
      {responseMode === 'tool_only' && (
        <InlineToolOutputs
          parts={m.parts}
          messageId={m.id}
          isStreaming={props.isStreaming}
        />
      )}
    </>
  );
}

// --- AssistantMessage ---

interface AssistantMessageProps {
  message: UIMessage;
  isActivelyStreaming: boolean;
}

export const AssistantMessage = memo(function AssistantMessage(
  props: AssistantMessageProps,
) {
  const m = props.message;
  const isStreaming = props.isActivelyStreaming;
  const textParts = m.parts.filter((p) => p.type === 'text');
  const toolParts: UIMessage['parts'] = [];
  const toolPartIndices: number[] = [];
  for (let i = 0; i < m.parts.length; i++) {
    if (m.parts[i].type !== 'text') {
      toolParts.push(m.parts[i]);
      toolPartIndices.push(i);
    }
  }
  const toolOutputCount = countSuccessfulToolOutputs(m.parts);
  const copyText = getTextFromMessage(m).trim();
  const body = (
    <AssistantMessageContent
      message={m}
      textParts={textParts}
      toolParts={toolParts}
      toolPartIndices={toolPartIndices}
      toolOutputCount={toolOutputCount}
      isStreaming={isStreaming}
    />
  );
  return (
    <div className="font-sans-neue text-[length:var(--chat-msg-size,0.97rem)] text-foreground">
      <div className={PROSE_CLASSES}>{body}</div>
      {copyText && !isStreaming ? (
        <div className="mt-1">
          <CopyMarkdownButton text={copyText} />
        </div>
      ) : null}
    </div>
  );
});

// Re-export utility functions needed by PostsigAssistant
export { getTextFromMessage, getToolTitle, countSuccessfulToolOutputs };
