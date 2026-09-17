'use client';

import { create } from 'zustand';

export interface ChatSession {
  id: number;
  organizationId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  // UI State
  isOpen: boolean;
  isFullscreen: boolean;
  pendingPrompt: string | null;
  shouldAutoSubmit: boolean;

  // Session State
  currentSessionId: number | null;
  sessions: ChatSession[];
  isLoadingSessions: boolean;

  // UI Actions
  setIsOpen: (open: boolean) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  openWithPrompt: (
    prompt: string,
    fullscreen?: boolean,
    autoSubmit?: boolean,
  ) => void;
  clearPendingPrompt: () => void;
  close: () => void;

  // Session Actions
  setCurrentSessionId: (id: number | null) => void;
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  updateSessionTitle: (id: number, title: string) => void;
  removeSession: (id: number) => void;
  setIsLoadingSessions: (loading: boolean) => void;

  // Convenience Actions
  startNewChat: () => void;
  selectSession: (id: number) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // UI State - Initial values
  isOpen: false,
  isFullscreen: false,
  pendingPrompt: null,
  shouldAutoSubmit: false,

  // Session State - Initial values
  currentSessionId: null,
  sessions: [],
  isLoadingSessions: false,

  // UI Actions
  setIsOpen: (open) => set({ isOpen: open }),

  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  openWithPrompt: (prompt, fullscreen = true, autoSubmit = false) =>
    set({
      pendingPrompt: prompt,
      shouldAutoSubmit: autoSubmit,
      isOpen: true,
      isFullscreen: fullscreen,
    }),

  clearPendingPrompt: () =>
    set({
      pendingPrompt: null,
      shouldAutoSubmit: false,
    }),

  close: () =>
    set({
      isOpen: false,
      isFullscreen: false,
      pendingPrompt: null,
      shouldAutoSubmit: false,
    }),

  // Session Actions
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
    })),

  updateSessionTitle: (id, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
    })),

  removeSession: (id) =>
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      const newCurrentId =
        state.currentSessionId === id
          ? (newSessions[0]?.id ?? null)
          : state.currentSessionId;
      return {
        sessions: newSessions,
        currentSessionId: newCurrentId,
      };
    }),

  setIsLoadingSessions: (loading) => set({ isLoadingSessions: loading }),

  // Convenience Actions
  startNewChat: () =>
    set({
      currentSessionId: null,
    }),

  selectSession: (id) => set({ currentSessionId: id }),
}));
