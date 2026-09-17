import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import 'tippy.js/themes/light.css';
import { MentionList } from './MentionList';
import { MentionOptions } from '@tiptap/extension-mention';
import { SuggestionOptions } from '@tiptap/suggestion';

export interface MentionUser {
  id: string;
  name: string | null;
  email: string | null;
  user_role?: number;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const createMentionSuggestion = (users: MentionUser[]) => ({
  items: ({ query }: { query: string }) => {
    const startsWithMatches = users.filter(
      (user) =>
        user.name?.toLowerCase().startsWith(query.toLowerCase()) ||
        (!user.name &&
          user.email?.toLowerCase().startsWith(query.toLowerCase())),
    );
    const includesMatches = users.filter(
      (user) =>
        (user.name?.toLowerCase().includes(query.toLowerCase()) &&
          !user.name?.toLowerCase().startsWith(query.toLowerCase())) ||
        (!user.name &&
          user.email?.toLowerCase().includes(query.toLowerCase()) &&
          !user.email?.toLowerCase().startsWith(query.toLowerCase())),
    );
    return [...startsWithMatches, ...includesMatches];
  },
  render: () => {
    let component: ReactRenderer<MentionListRef>;
    let popup: any;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        const editorElement = props.editor.options.element;
        const scrollParent = getScrollParent(editorElement);

        popup = tippy('body', {
          theme: 'light',
          getReferenceClientRect: props.clientRect,
          appendTo: scrollParent || document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          hideOnClick: false,
          zIndex: 9999,
          arrow: false,
        });
      },
      onUpdate: (props: any) => {
        component.updateProps(props);
        if (!props.clientRect) {
          return;
        }
        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },
      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }
        // Now TypeScript knows that component.ref has onKeyDown
        return component.ref?.onKeyDown(props);
      },
      onExit: () => {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
});

function getScrollParent(element: HTMLElement): HTMLElement | null {
  if (!element) {
    return null;
  }

  if (element.scrollHeight > element.clientHeight) {
    const { overflow, overflowY } = window.getComputedStyle(element);
    if (
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflowY === 'auto' ||
      overflowY === 'scroll'
    ) {
      return element;
    }
  }

  return getScrollParent(element.parentElement as HTMLElement);
}
