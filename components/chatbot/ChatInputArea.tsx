'use client';

import {
  memo,
  useState,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  FormEvent,
  KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ArrowUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputAreaHandle {
  setInput: (text: string) => void;
  focus: () => void;
}

interface ChatInputAreaProps {
  status: string;
  error: Error | undefined;
  isFullscreen: boolean;
  onSubmit: (text: string) => void;
  onRetry: (() => void) | null;
  /** Standalone composer (centered welcome state) vs. the bottom bar. */
  centered?: boolean;
  showDisclaimer?: boolean;
}

export const ChatInputArea = memo(
  forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(function ChatInputArea(
    {
      status,
      error,
      isFullscreen,
      onSubmit,
      onRetry,
      centered = false,
      showDisclaimer = true,
    },
    ref,
  ) {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      setInput,
      focus: () => {
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          const end = el.value.length;
          el.setSelectionRange(end, end);
        });
      },
    }));

    const isBusy = status === 'submitted' || status === 'streaming';

    const handleFormSubmit = useCallback(
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isBusy || !input.trim()) return;
        onSubmit(input);
        setInput('');
      },
      [input, onSubmit, isBusy],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.trim() && (status === 'ready' || status === 'error')) {
            onSubmit(input);
            setInput('');
          }
        }
      },
      [input, status, onSubmit],
    );

    return (
      <div
        className={cn(
          'shadow-2xl shadow-foreground/5',
          !centered && 'border-t border-border bg-card px-4 py-3',
          !centered &&
            isFullscreen &&
            'mx-auto w-full max-w-3xl min-[1920px]:max-w-5xl',
        )}
      >
        <form onSubmit={handleFormSubmit}>
          {isFullscreen ? (
            <div className="relative">
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to know?"
                className="min-h-[80px] w-full resize-none rounded-lg border-border p-4 pl-5 pr-12 font-sans-neue text-base focus-visible:border-foreground/25 focus-visible:ring-0"
                autoComplete="off"
              />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                aria-hidden={!input.trim()}
                tabIndex={input.trim() ? 0 : -1}
                className={cn(
                  'absolute bottom-2 right-2 h-8 w-8 origin-bottom-right rounded-sm bg-[#2296F3] text-white transition-all duration-150 ease-out hover:bg-[#2296F3]/90 hover:text-white',
                  input.trim()
                    ? 'scale-100 opacity-100'
                    : 'pointer-events-none scale-90 opacity-0',
                )}
                disabled={isBusy && !!input.trim()}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What would you like to know?"
              className="w-full"
              autoComplete="off"
            />
          )}
        </form>

        {showDisclaimer && (
          <p className="mt-1 h-5 text-center font-sans text-[11px] leading-5 text-muted-foreground">
            LineageAI<sup>TM</sup> Assistant can make mistakes. Please double
            check responses.
          </p>
        )}
        {error && (
          <div className="mt-2 flex items-center gap-2">
            <p className="font-sans text-xs text-destructive">
              {error.message.includes('rate') ||
              error.message.includes('busy') ||
              error.message.includes('exhausted')
                ? 'AI is temporarily busy. '
                : 'An error occurred. '}
            </p>
            {onRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="h-6 gap-1 px-2 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }),
);
