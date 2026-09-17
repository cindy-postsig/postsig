'use client';

import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/lib/v2/chat/persistence';

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  currentSessionId: number | null;
  isLoading: boolean;
  onSelectSession: (sessionId: number) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: number) => void;
  deletingSessionId: number | null;
}

function formatSessionTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return '';
  }
}

export const ChatHistorySidebar = memo(function ChatHistorySidebar({
  sessions,
  currentSessionId,
  isLoading,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  deletingSessionId,
}: ChatHistorySidebarProps) {
  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-card min-[1920px]:w-80">
      {/* New Chat */}
      <div className="p-3 pb-2">
        <Button
          variant="ghost"
          className="w-full justify-start px-1.5 hover:bg-hover"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Chat History label */}
      <div className="py-2 pl-4 pr-3">
        <span className="font-medium font-sans-neue text-xs text-muted-foreground">
          Chat History
        </span>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="space-y-[2px] p-3 pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="font-sans-neue text-xs text-muted-foreground">
                No previous chats
              </p>
              <p className="mt-1 font-sans-neue text-[10px] text-muted-foreground/70">
                Start a conversation to see it here
              </p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === currentSessionId;
              const isDeleting = session.id === deletingSessionId;

              return (
                <div
                  key={session.id}
                  title={`${session.title}\n${formatSessionTime(session.updated_at)}`}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pl-1.5 pr-0 transition-colors',
                    isActive ? 'bg-selected' : 'hover:bg-hover',
                  )}
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className="line-clamp-1 min-w-0 flex-1 break-words font-sans-neue text-[0.875rem]">
                    {session.title}
                  </span>
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-5 w-5 shrink-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-transparent',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                          onClick={(e) => e.stopPropagation()}
                          title="More options"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="sr-only">More options</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="z-[80]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
