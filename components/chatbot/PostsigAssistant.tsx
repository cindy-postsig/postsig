'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';
import { useChat, Chat, type UIMessage } from '@ai-sdk/react';
import { PREDEFINED_CHATBOT_ROUTES } from '@/lib/config/routes';
import { useModeFromPath } from '@/contexts/ModeContext';

import { AssistantIcon } from '@/components/chatbot/AssistantIcon';
import { getTextFromMessage } from '@/components/chatbot/AssistantMessage';
import { type ChatInputAreaHandle } from '@/components/chatbot/ChatInputArea';
import { ChatContent } from '@/components/chatbot/ChatContent';
import {
  extractExcerptsFromMessages,
  generateSessionTitle,
} from '@/components/chatbot/postsig-assistant-utils';
import {
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useInvalidateChatSessions,
  useUpdateChatSession,
} from '@/hooks/api/useChatSessions';
import { useChatMessages } from '@/hooks/api/useChatMessages';
import type { ChatSession } from '@/lib/v2/chat/persistence';
import { toUIMessage } from '@/lib/v2/chat/persistence/ui-messages';
import { createChatTransport } from '@/lib/v2/chat/tools/utils';

interface NavigationAction {
  action: 'navigate';
  path: string;
}

// One Chat per session, kept alive so its stream keeps running when the user
// switches to another chat.
interface ChatEntry {
  chat: Chat<UIMessage>;
  dbSessionId: number | null;
  // Guards against re-hydrating a chat that already has live or loaded messages.
  hydrated: boolean;
  lastFailedText: string | null;
}

function createChatKey(): string {
  return `new-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

interface PostsigAssistantProps {
  userName?: string;
}

// Stable references to prevent child re-renders
const NOOP = () => {};
const EMPTY_SESSIONS: ChatSession[] = [];

export function PostsigAssistant({
  userName = 'there',
}: PostsigAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const mode = useModeFromPath();
  const {
    isOpen,
    setIsOpen,
    isFullscreen,
    setIsFullscreen,
    pendingPrompt,
    shouldAutoSubmit,
    clearPendingPrompt,
    currentSessionId,
    setCurrentSessionId,
    startNewChat,
  } = useChatStore();

  const chatInputRef = useRef<ChatInputAreaHandle>(null);
  const [showExcerpt, setShowExcerpt] = useState(false);
  const [currentContext] = useState<string | undefined>(undefined);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(
    null,
  );
  const pendingNavPathRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const currentContextRef = useRef(currentContext);
  currentContextRef.current = currentContext;

  const currentSessionIdRef = useRef<number | null>(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  // Keyed by `s${sessionId}`, or a client key for a new chat with no row yet.
  const chatsRef = useRef<Map<string, ChatEntry>>(new Map());
  const newChatKeyRef = useRef<string>(createChatKey());
  const activeEntryRef = useRef<ChatEntry | null>(null);
  // onFinish/onError are bound when a Chat is constructed; route them through
  // refs so they run the latest logic instead of a stale closure.
  const finishRef = useRef<(entry: ChatEntry, message: UIMessage) => void>(
    () => {},
  );
  const errorRef = useRef<(entry: ChatEntry, err: Error) => void>(() => {});

  const { data: sessionsData, isLoading: isLoadingSessions } =
    useChatSessions();
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const updateSession = useUpdateChatSession();
  const invalidateChatSessions = useInvalidateChatSessions();

  const sessions = sessionsData?.sessions ?? EMPTY_SESSIONS;

  const sessionTitleSetRef = useRef<number | null>(null);
  // Prevents overwriting live messages when the query cache updates from a save
  const lastLoadedSessionRef = useRef<number | null>(null);

  const handleFinish = (entry: ChatEntry, message: UIMessage) => {
    entry.lastFailedText = null;
    const assistantContent = getTextFromMessage(message);
    // The server persisted this turn and bumped the session's updated_at.
    invalidateChatSessions();

    // Auto-navigation only applies to the chat the user is currently viewing.
    if (entry.dbSessionId !== currentSessionIdRef.current) return;

    try {
      if (
        typeof assistantContent === 'string' &&
        /\{"action"\s*:\s*"navigate"/.test(assistantContent)
      ) {
        const potentialJson = assistantContent.substring(
          assistantContent.indexOf('{'),
          assistantContent.lastIndexOf('}') + 1,
        );
        const parsed: NavigationAction = JSON.parse(potentialJson);
        if (parsed.action === 'navigate' && parsed.path) {
          const isStaticPredefined = PREDEFINED_CHATBOT_ROUTES.includes(
            parsed.path as (typeof PREDEFINED_CHATBOT_ROUTES)[number],
          );
          const isContractByIdRoute = /^\/contracts\/[^/]+$/.test(parsed.path);
          const isVendorByIdRoute = /^\/vendors\/[^/]+$/.test(parsed.path);

          if (isStaticPredefined || isContractByIdRoute || isVendorByIdRoute) {
            if (pathnameRef.current === parsed.path) {
              setIsOpen(false);
              setIsFullscreen(false);
              return;
            }
            pendingNavPathRef.current = parsed.path;
            router.push(parsed.path);
            entry.chat.messages = [
              ...entry.chat.messages.slice(0, -1),
              {
                id: String(Date.now()),
                role: 'assistant',
                parts: [
                  { type: 'text', text: `Navigating you to ${parsed.path}...` },
                ],
              },
            ];
          } else {
            entry.chat.messages = [
              ...entry.chat.messages.slice(0, -1),
              {
                id: String(Date.now()),
                role: 'assistant',
                parts: [
                  {
                    type: 'text',
                    text: `I can only navigate to predefined pages, specific contract pages (e.g., /contracts/some-id), or specific vendor pages (e.g., /vendors/some-id). I found a path ${parsed.path}, but it's not on my list or in the correct format.`,
                  },
                ],
              },
            ];
          }
        }
      }
    } catch {
      // not a navigation response
    }
  };
  finishRef.current = handleFinish;

  const handleStreamError = (entry: ChatEntry, err: Error) => {
    entry.chat.messages = [
      ...entry.chat.messages,
      {
        id: String(Date.now()),
        role: 'assistant',
        parts: [{ type: 'text', text: `An error occurred: ${err.message}` }],
      },
    ];
  };
  errorRef.current = handleStreamError;

  const createEntry = (
    dbSessionId: number | null,
    initialMessages: UIMessage[],
  ): ChatEntry => {
    const entry: ChatEntry = {
      chat: undefined as unknown as Chat<UIMessage>,
      dbSessionId,
      hydrated: dbSessionId === null,
      lastFailedText: null,
    };
    entry.chat = new Chat<UIMessage>({
      messages: initialMessages,
      transport: createChatTransport({
        api: '/api/v2/chat/stream',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            sessionId: entry.dbSessionId,
            message: messages[messages.length - 1],
            context: currentContextRef.current,
          },
        }),
      }),
      onFinish: ({ message }) => finishRef.current(entry, message),
      onError: (err) => errorRef.current(entry, err),
    });
    return entry;
  };

  const activeKey =
    currentSessionId === null ? newChatKeyRef.current : `s${currentSessionId}`;
  let activeEntry = chatsRef.current.get(activeKey);
  if (!activeEntry) {
    activeEntry = createEntry(currentSessionId, []);
    chatsRef.current.set(activeKey, activeEntry);
  }
  activeEntryRef.current = activeEntry;

  const { messages, status, error, clearError } = useChat({
    chat: activeEntry.chat,
    experimental_throttle: 50,
  });

  // Hydrate from the DB only on first open; a chat already in the registry
  // keeps its in-memory state so a live/background stream isn't interrupted.
  const needsHydration = currentSessionId !== null && !activeEntry.hydrated;
  const { data: messagesData } = useChatMessages(
    needsHydration ? currentSessionId : null,
  );
  const isLoadingSession = needsHydration;

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastExchangeRef = useRef<HTMLDivElement>(null!);
  const shouldScrollToExchangeRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  const savedScrollRatioRef = useRef<number | null>(null);

  const excerpts = useMemo(
    () => extractExcerptsFromMessages(messages),
    [messages],
  );

  useEffect(() => {
    if (currentSessionId === null) return;
    const entry = chatsRef.current.get(`s${currentSessionId}`);
    if (!entry || entry.hydrated) {
      lastLoadedSessionRef.current = currentSessionId;
      return;
    }
    if (!messagesData?.messages) return;

    entry.chat.messages = messagesData.messages.map(toUIMessage);
    entry.hydrated = true;
    shouldScrollToBottomRef.current = true;
    sessionTitleSetRef.current = currentSessionId;
    lastLoadedSessionRef.current = currentSessionId;
  }, [messagesData, currentSessionId]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      const sendKey =
        currentSessionId === null
          ? newChatKeyRef.current
          : `s${currentSessionId}`;
      const entry = chatsRef.current.get(sendKey);
      if (!entry) return;

      clearError();
      entry.lastFailedText = text;
      shouldScrollToExchangeRef.current = true;

      // The stream endpoint persists into the session, so it must exist first.
      let sessionId = entry.dbSessionId;
      if (!sessionId) {
        const result = await createSession.mutateAsync('New Chat');
        sessionId = result.session.id;
        entry.dbSessionId = sessionId;
        chatsRef.current.delete(sendKey);
        chatsRef.current.set(`s${sessionId}`, entry);
        // Only pull the user onto the new session if they haven't moved away.
        if (
          currentSessionIdRef.current === null &&
          newChatKeyRef.current === sendKey
        ) {
          lastLoadedSessionRef.current = sessionId;
          setCurrentSessionId(sessionId);
        }
      }

      if (sessionTitleSetRef.current !== sessionId) {
        updateSession.mutate({ sessionId, title: generateSessionTitle(text) });
        sessionTitleSetRef.current = sessionId;
      }

      try {
        await entry.chat.sendMessage({ text });
      } catch {
        entry.lastFailedText = text;
      }
    },
    [
      clearError,
      currentSessionId,
      createSession,
      setCurrentSessionId,
      updateSession,
    ],
  );

  const handleRetry = useCallback(() => {
    const entry = activeEntryRef.current;
    if (!entry?.lastFailedText) return;
    clearError();

    const msgs = entry.chat.messages;
    const last = msgs[msgs.length - 1];
    if (
      last?.role === 'assistant' &&
      getTextFromMessage(last).includes('error occurred')
    ) {
      entry.chat.messages = msgs.slice(0, -1);
    }

    shouldScrollToExchangeRef.current = true;
    // Re-send the same message id so the server reuses the stored user turn.
    entry.chat.regenerate();
  }, [clearError]);

  useEffect(() => {
    if (pendingPrompt) {
      if (shouldAutoSubmit && status === 'ready') {
        handleSendMessage(pendingPrompt);
      } else {
        chatInputRef.current?.setInput(pendingPrompt);
      }
      clearPendingPrompt();
    }
  }, [
    pendingPrompt,
    shouldAutoSubmit,
    status,
    handleSendMessage,
    clearPendingPrompt,
  ]);

  useEffect(() => {
    if (isOpen) {
      chatInputRef.current?.focus();
    }
  }, [isOpen, isFullscreen]);

  // Re-focus after the composer remounts (welcome ↔ bottom bar).
  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (hasMessages) chatInputRef.current?.focus();
  }, [hasMessages]);

  // An effect, not handleNewChat's sync focus, since the composer remounts.
  useEffect(() => {
    if (isOpen && currentSessionId === null) chatInputRef.current?.focus();
  }, [currentSessionId, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k' && e.shiftKey) {
        e.preventDefault();
        if (isOpen && isFullscreen) {
          setIsOpen(false);
          setIsFullscreen(false);
        } else {
          setIsOpen(true);
          setIsFullscreen(true);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === 'k' && !e.shiftKey) {
        e.preventDefault();
        if (isOpen && !isFullscreen) {
          setIsOpen(false);
        } else {
          setIsOpen(true);
          setIsFullscreen(false);
        }
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, setIsOpen, setIsFullscreen]);

  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (!viewport) return;

    if (shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = false;
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'instant',
        });
      });
      return;
    }

    if (shouldScrollToExchangeRef.current && lastExchangeRef.current) {
      shouldScrollToExchangeRef.current = false;
      const elRect = lastExchangeRef.current.getBoundingClientRect();
      const vpRect = viewport.getBoundingClientRect();
      const targetTop = viewport.scrollTop + (elRect.top - vpRect.top) - 16;
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
      });
      return;
    }
  }, [messages]);

  useEffect(() => {
    if (savedScrollRatioRef.current === null) return;
    const ratio = savedScrollRatioRef.current;
    savedScrollRatioRef.current = null;

    const viewport = scrollAreaRef.current;
    if (!viewport) return;

    requestAnimationFrame(() => {
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      viewport.scrollTo({ top: ratio * maxScroll, behavior: 'instant' });
    });
  }, [isFullscreen]);

  useEffect(() => {
    if (pendingNavPathRef.current && pathname === pendingNavPathRef.current) {
      pendingNavPathRef.current = null;
      setIsOpen(false);
      setIsFullscreen(false);
    }
  }, [pathname, setIsOpen, setIsFullscreen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsFullscreen(false);
  }, [setIsOpen, setIsFullscreen]);

  const handleToggleFullscreen = useCallback(() => {
    const viewport = scrollAreaRef.current;
    if (viewport && viewport.scrollHeight > viewport.clientHeight) {
      savedScrollRatioRef.current =
        viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight);
    }
    const current = useChatStore.getState().isFullscreen;
    setIsFullscreen(!current);
  }, [setIsFullscreen]);

  const handleHideExcerpt = useCallback(() => {
    setShowExcerpt(false);
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: number) => {
      if (sessionId === currentSessionId) return;
      shouldScrollToBottomRef.current = true;
      setCurrentSessionId(sessionId);
    },
    [currentSessionId, setCurrentSessionId],
  );

  const handleNewChat = useCallback(() => {
    newChatKeyRef.current = createChatKey();
    startNewChat();
    sessionTitleSetRef.current = null;
    chatInputRef.current?.focus();
  }, [startNewChat]);

  const handleDeleteSession = useCallback(
    async (sessionId: number) => {
      setDeletingSessionId(sessionId);
      try {
        await deleteSession.mutateAsync(sessionId);
        const entry = chatsRef.current.get(`s${sessionId}`);
        if (entry) {
          entry.chat.stop();
          chatsRef.current.delete(`s${sessionId}`);
        }
        if (sessionId === currentSessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          setCurrentSessionId(remaining[0]?.id ?? null);
        }
      } finally {
        setDeletingSessionId(null);
      }
    },
    [deleteSession, currentSessionId, sessions, setCurrentSessionId],
  );

  const handleSelectPrompt = useCallback((prompt: string) => {
    chatInputRef.current?.setInput(prompt);
    chatInputRef.current?.focus();
  }, []);

  // CPM-only assistant; venture mode uses Sigpilot. Hide on investor routes and
  // shared routes (e.g. /account) when the active module is venture.
  if (mode === 'venture') return null;

  if (isFullscreen && isOpen) {
    return (
      <>
        <button
          className="fixed bottom-6 right-6 z-50 hidden h-12 w-12 overflow-hidden rounded-bl-xl rounded-tl-xl rounded-tr-xl shadow-lg"
          onClick={() => setIsOpen(true)}
        >
          <AssistantIcon alt="Open Lineage AI Assistant" />
        </button>

        <div className="fixed inset-0 z-[70]">
          <ChatContent
            messages={messages}
            status={status}
            error={error}
            scrollAreaRef={scrollAreaRef}
            lastExchangeRef={lastExchangeRef}
            chatInputRef={chatInputRef}
            isFullscreen={true}
            isLoadingSession={isLoadingSession}
            onToggleFullscreen={handleToggleFullscreen}
            onClose={handleClose}
            excerpts={excerpts}
            showExcerpt={showExcerpt}
            onHideExcerpt={handleHideExcerpt}
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoadingSessions={isLoadingSessions}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={handleDeleteSession}
            deletingSessionId={deletingSessionId}
            onSelectPrompt={handleSelectPrompt}
            onSubmit={handleSendMessage}
            onRetry={error ? handleRetry : null}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <button
        className="fixed bottom-6 right-6 z-50 h-12 w-12 overflow-hidden rounded-bl-lg rounded-tl-xl rounded-tr-xl shadow-xl transition-opacity hover:opacity-90"
        onClick={() => setIsOpen(true)}
        title="Open Lineage AI Assistant (⌘K)"
      >
        <AssistantIcon alt="Open Lineage AI Assistant (⌘K for sidebar, ⌘⇧K for fullscreen)" />
      </button>
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-[70] flex h-full w-full flex-col border-l bg-background shadow-xl transition-transform duration-300 ease-in-out sm:max-w-md',
          isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        aria-hidden={!isOpen}
      >
        <ChatContent
          messages={messages}
          status={status}
          error={error}
          scrollAreaRef={scrollAreaRef}
          lastExchangeRef={lastExchangeRef}
          chatInputRef={chatInputRef}
          isFullscreen={false}
          isLoadingSession={isLoadingSession}
          onToggleFullscreen={handleToggleFullscreen}
          onClose={handleClose}
          excerpts={[]}
          showExcerpt={false}
          onHideExcerpt={NOOP}
          sessions={sessions}
          currentSessionId={currentSessionId}
          isLoadingSessions={isLoadingSessions}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
          deletingSessionId={deletingSessionId}
          onSelectPrompt={handleSelectPrompt}
          onSubmit={handleSendMessage}
          onRetry={error ? handleRetry : null}
        />
      </div>
    </>
  );
}
