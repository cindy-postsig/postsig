'use client';

import { memo } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { AssistantIcon } from '@/components/chatbot/AssistantIcon';
import { cn } from '@/lib/utils';
import { Expand, Minimize2, X, Loader2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { ContractExcerpt } from './ContractExcerpt';
import type { ExcerptData } from '@/lib/v2/chat/client';
import { ChatHistorySidebar } from '@/components/chatbot/ChatHistorySidebar';
import { WelcomeMessage } from '@/components/chatbot/WelcomeMessage';
import {
  AssistantMessage,
  UserMessage,
  getTextFromMessage,
} from '@/components/chatbot/AssistantMessage';
import { isToolLoading } from '@/components/chatbot/assistant-message-utils';
import {
  ChatInputArea,
  type ChatInputAreaHandle,
} from '@/components/chatbot/ChatInputArea';
import type { ChatSession } from '@/lib/v2/chat/persistence';

const TOOL_LOADING_MESSAGES: Record<string, string> = {
  'tool-list_contracts': 'Loading contracts...',
  'tool-get_contract': 'Pulling up contract details...',
  'tool-query_contracts': 'Filtering contracts...',
  'tool-search_contract_clauses': 'Searching contract clauses...',
  'tool-list_vendors': 'Loading vendors...',
  'tool-get_vendor': 'Pulling up vendor details...',
  'tool-get_report_data': 'Running report...',
  'tool-get_upcoming_renewals': 'Checking upcoming renewals...',
  'tool-get_renewal_summary': 'Reviewing renewal terms...',
  'tool-get_spend': 'Calculating spend...',
  'tool-get_spend_breakdown': 'Breaking down spend...',
  'tool-list_tags': 'Looking up tags...',
  'tool-get_contract_lineage': 'Tracing contract lineage...',
  'tool-update_contract': 'Updating contract...',
  'tool-add_users_to_contract': 'Adding users to contract...',
};

function getToolLoadingLabel(part: UIMessage['parts'][number]): string | null {
  if (!part.type.startsWith('tool-')) return null;
  if (!isToolLoading(part)) return null;
  return TOOL_LOADING_MESSAGES[part.type] || 'Processing...';
}

function getCurrentToolStatus(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      const label = getToolLoadingLabel(part);
      if (label) return label;
    }
  }
  return null;
}

// --- Sub-components ---

const MessageItem = memo(function MessageItem(props: {
  message: UIMessage;
  isLastStreaming: boolean;
}) {
  if (props.message.role === 'user') {
    return <UserMessage text={getTextFromMessage(props.message)} />;
  }
  return (
    <AssistantMessage
      message={props.message}
      isActivelyStreaming={props.isLastStreaming}
    />
  );
});

function StreamingIndicator(props: { messages: UIMessage[]; status: string }) {
  const isActive = props.status === 'submitted' || props.status === 'streaming';
  if (!isActive || props.messages.length === 0) return null;

  const last = props.messages[props.messages.length - 1];
  if (last?.role === 'assistant') {
    const lastPart = last.parts[last.parts.length - 1];
    if (lastPart?.type === 'text' && lastPart.text.trim()) return null;
  }

  const toolStatus = getCurrentToolStatus(props.messages);

  return (
    <div className="!mt-3 flex items-center gap-2 font-sans text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{toolStatus || 'Thinking...'}</span>
    </div>
  );
}

function findLastUserIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

function ExchangeGroup(props: {
  messages: UIMessage[];
  startIdx: number;
  lastIdx: number;
  status: string;
  isFullscreen: boolean;
  lastExchangeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const minHCls = props.isFullscreen
    ? 'min-h-[calc(100vh-15.75rem)]'
    : 'min-h-[calc(100vh-12rem)]';

  return (
    <div ref={props.lastExchangeRef} className={`space-y-10 ${minHCls}`}>
      {props.messages.map((m, idx) => {
        const globalIdx = props.startIdx + idx;
        const isStreaming =
          props.status === 'streaming' || props.status === 'submitted';
        return (
          <div key={m.id}>
            <MessageItem
              message={m}
              isLastStreaming={globalIdx === props.lastIdx && isStreaming}
            />
          </div>
        );
      })}
      <StreamingIndicator messages={props.messages} status={props.status} />
    </div>
  );
}

function MessageList(props: {
  messages: UIMessage[];
  status: string;
  isFullscreen: boolean;
  onSelectPrompt: (prompt: string) => void;
  lastExchangeRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (props.messages.length === 0) {
    return (
      <WelcomeMessage
        onSelectPrompt={props.onSelectPrompt}
        isFullscreen={props.isFullscreen}
      />
    );
  }

  const lastUserIdx = findLastUserIndex(props.messages);
  const lastIdx = props.messages.length - 1;
  const before = lastUserIdx > 0 ? props.messages.slice(0, lastUserIdx) : [];
  const exchange =
    lastUserIdx >= 0 ? props.messages.slice(lastUserIdx) : props.messages;

  return (
    <div className="space-y-10">
      {before.map((m) => (
        <div key={m.id}>
          <MessageItem message={m} isLastStreaming={false} />
        </div>
      ))}
      {lastUserIdx >= 0 ? (
        <ExchangeGroup
          messages={exchange}
          startIdx={lastUserIdx}
          lastIdx={lastIdx}
          status={props.status}
          isFullscreen={props.isFullscreen}
          lastExchangeRef={props.lastExchangeRef}
        />
      ) : (
        exchange.map((m, idx) => {
          const isStreaming =
            props.status === 'streaming' || props.status === 'submitted';
          return (
            <div key={m.id}>
              <MessageItem
                message={m}
                isLastStreaming={idx === lastIdx && isStreaming}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function ChatHeader(props: {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}) {
  const icon = props.isFullscreen ? (
    <Minimize2 className="h-4 w-4" />
  ) : (
    <Expand className="h-4 w-4" />
  );
  const label = props.isFullscreen ? 'Minimize' : 'Expand';

  return (
    <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <span className="block h-6 w-6 shrink-0 overflow-hidden rounded-sm">
          <AssistantIcon alt="Lineage AI Assistant" />
        </span>
        <span className="font-medium font-sans text-sm">
          LineageAI<sup className="top-[-.75em] text-[0.5rem]">TM</sup>{' '}
          Assistant
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={props.onToggleFullscreen}
        >
          {icon}
          <span className="sr-only">{label}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </div>
  );
}

// --- Main ChatContent ---

export interface ChatContentProps {
  messages: UIMessage[];
  status: string;
  error: Error | undefined;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  lastExchangeRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<ChatInputAreaHandle | null>;
  isFullscreen: boolean;
  isLoadingSession: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  excerpts: ExcerptData[];
  showExcerpt: boolean;
  onHideExcerpt: () => void;
  sessions: ChatSession[];
  currentSessionId: number | null;
  isLoadingSessions: boolean;
  onSelectSession: (sessionId: number) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: number) => void;
  deletingSessionId: number | null;
  onSelectPrompt: (prompt: string) => void;
  onSubmit: (text: string) => void;
  onRetry: (() => void) | null;
}

export const ChatContent = memo(function ChatContent(props: ChatContentProps) {
  const scrollCls = props.isFullscreen
    ? 'flex-grow pt-8 px-8'
    : 'flex-grow pt-8 px-4';
  const innerCls = props.isFullscreen
    ? 'pb-8 mx-auto max-w-3xl min-[1920px]:max-w-5xl flex min-h-full flex-col'
    : 'pb-4 flex min-h-full flex-col';
  const showExcerpts =
    props.isFullscreen && props.showExcerpt && props.excerpts.length > 0;

  const msgFontSize = props.isFullscreen ? '0.97rem' : '0.9rem';

  return (
    <div
      className="flex h-full flex-col bg-background"
      style={{ ['--chat-msg-size' as string]: msgFontSize }}
    >
      <ChatHeader
        isFullscreen={props.isFullscreen}
        onToggleFullscreen={props.onToggleFullscreen}
        onClose={props.onClose}
      />
      <ContentBody
        chatProps={props}
        scrollCls={scrollCls}
        innerCls={innerCls}
        showExcerpts={showExcerpts}
      />
    </div>
  );
});

function SidebarSection(props: { chatProps: ChatContentProps }) {
  const p = props.chatProps;
  if (!p.isFullscreen) return null;
  return (
    <ChatHistorySidebar
      sessions={p.sessions}
      currentSessionId={p.currentSessionId}
      isLoading={p.isLoadingSessions}
      onSelectSession={p.onSelectSession}
      onNewChat={p.onNewChat}
      onDeleteSession={p.onDeleteSession}
      deletingSessionId={p.deletingSessionId}
    />
  );
}

function ChatArea(props: {
  chatProps: ChatContentProps;
  scrollCls: string;
  innerCls: string;
}) {
  const p = props.chatProps;

  // New chat in fullscreen: center the welcome + composer as a group. The
  // sidebar keeps the composer on the bottom bar (the layout below).
  if (!p.isLoadingSession && p.messages.length === 0 && p.isFullscreen) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="m-auto w-full px-4 py-8">
          <WelcomeMessage
            onSelectPrompt={p.onSelectPrompt}
            isFullscreen={p.isFullscreen}
            composer={
              <ChatInputArea
                ref={p.chatInputRef}
                status={p.status}
                error={p.error}
                isFullscreen={p.isFullscreen}
                onSubmit={p.onSubmit}
                onRetry={p.onRetry}
                centered
                showDisclaimer={false}
              />
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={p.scrollAreaRef}
        className={cn(props.scrollCls, 'overflow-y-auto overscroll-contain')}
      >
        <div className={props.innerCls}>
          {p.isLoadingSession ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          ) : (
            <MessageList
              messages={p.messages}
              status={p.status}
              isFullscreen={p.isFullscreen}
              onSelectPrompt={p.onSelectPrompt}
              lastExchangeRef={p.lastExchangeRef}
            />
          )}
        </div>
      </div>
      <ChatInputArea
        ref={p.chatInputRef}
        status={p.status}
        error={p.error}
        isFullscreen={p.isFullscreen}
        onSubmit={p.onSubmit}
        onRetry={p.onRetry}
        showDisclaimer={p.messages.length > 0}
      />
    </div>
  );
}

function ContentBody(props: {
  chatProps: ChatContentProps;
  scrollCls: string;
  innerCls: string;
  showExcerpts: boolean;
}) {
  const p = props.chatProps;
  return (
    <div className="flex flex-1 overflow-hidden">
      <SidebarSection chatProps={p} />
      <ChatArea
        chatProps={p}
        scrollCls={props.scrollCls}
        innerCls={props.innerCls}
      />
      {props.showExcerpts && (
        <ContractExcerpt excerpts={p.excerpts} onHide={p.onHideExcerpt} />
      )}
    </div>
  );
}
