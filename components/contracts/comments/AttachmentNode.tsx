import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AttachmentView } from './AttachmentView';

interface AttachmentAttributes {
  id: string;
  filename: string;
  filetype: string;
  filesize: number;
  path: string;
  signedUrl?: string;
  urlError?: string;
  width?: number;
  height?: number;
  isLoading?: boolean;
}

export const AttachmentNode = Node.create<{ attrs: AttachmentAttributes }>({
  name: 'attachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  content: '',

  addAttributes() {
    return {
      id: {
        default: null,
      },
      filename: {
        default: '',
      },
      filetype: {
        default: '',
      },
      filesize: {
        default: 0,
      },
      path: {
        default: '',
      },
      signedUrl: {
        default: null,
      },
      urlError: {
        default: null,
      },
      // New attributes for image dimensions
      width: {
        default: null,
      },
      height: {
        default: null,
      },
      // Explicit loading state
      isLoading: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-attachment-id]',
        getAttrs: (node) => {
          if (typeof node === 'string' || !(node instanceof HTMLElement)) {
            return {};
          }
          return {
            id: node.getAttribute('data-attachment-id'),
            path: node.getAttribute('data-attachment-path'),
            filetype: node.getAttribute('data-attachment-filetype'),
            filename: node.getAttribute('data-attachment-filename'),
            signedUrl: node.getAttribute('data-attachment-signed-url'),
            width: node.getAttribute('data-attachment-width')
              ? parseInt(node.getAttribute('data-attachment-width') || '0', 10)
              : null,
            height: node.getAttribute('data-attachment-height')
              ? parseInt(node.getAttribute('data-attachment-height') || '0', 10)
              : null,
          };
        },
      },
      // Also handle the case when the attachment might be rendered in a different format
      {
        tag: '.attachment-node',
        getAttrs: (node) => {
          if (typeof node === 'string' || !(node instanceof HTMLElement)) {
            return {};
          }
          return {
            id: node.getAttribute('data-attachment-id'),
            path: node.getAttribute('data-attachment-path'),
            filetype: node.getAttribute('data-attachment-filetype'),
            filename: node.getAttribute('data-attachment-filename'),
            signedUrl: node.getAttribute('data-attachment-signed-url'),
            width: node.getAttribute('data-attachment-width')
              ? parseInt(node.getAttribute('data-attachment-width') || '0', 10)
              : null,
            height: node.getAttribute('data-attachment-height')
              ? parseInt(node.getAttribute('data-attachment-height') || '0', 10)
              : null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          class: 'attachment-node',
          contenteditable: 'false', // Helps prevent accidental editing
          tabindex: '0', // Makes it focusable for keyboard navigation
        },
        {
          'data-attachment-id': HTMLAttributes.id,
          'data-attachment-path': HTMLAttributes.path,
          'data-attachment-filetype': HTMLAttributes.filetype,
          'data-attachment-filename': HTMLAttributes.filename,
          'data-attachment-signed-url': HTMLAttributes.signedUrl,
          'data-attachment-width': HTMLAttributes.width,
          'data-attachment-height': HTMLAttributes.height,
        },
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView);
  },

  // This improves keyboard navigation
  addKeyboardShortcuts() {
    return {
      // Prevent Backspace/Delete from immediately deleting the node
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;

        // If something is selected, let default behavior handle it
        if (!empty) return false;

        // Check if the cursor is right after an attachment node
        const nodeBefore = $from.nodeBefore;
        if (nodeBefore && nodeBefore.type.name === this.name) {
          // If so, select the node instead of deleting it
          const nodePos = $from.pos - nodeBefore.nodeSize;
          this.editor.commands.setNodeSelection(nodePos);
          return true;
        }

        return false;
      },
      Delete: () => {
        const { $from, empty } = this.editor.state.selection;

        // If something is selected, let default behavior handle it
        if (!empty) return false;

        // Check if the cursor is right before an attachment node
        const nodeAfter = $from.nodeAfter;
        if (nodeAfter && nodeAfter.type.name === this.name) {
          // If so, select the node instead of deleting it
          this.editor.commands.setNodeSelection($from.pos);
          return true;
        }

        return false;
      },
    };
  },
});
