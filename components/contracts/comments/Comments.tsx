'use client';

import { useState, useEffect, useMemo } from 'react';
import './styles.css';
import logger from '@/utils/pino';
import {
  useEditor,
  EditorContent,
  generateHTML,
  JSONContent,
} from '@tiptap/react';
import { Node as TiptapNode } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import FileHandler from '@tiptap-pro/extension-file-handler';
import { MentionUser, createMentionSuggestion } from './suggestion';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  insertComment,
  deleteComment,
  updateComment,
  fetchOrgUsersForMentions,
  uploadAttachment,
  linkAttachmentWithComment,
  cleanupUnusedAttachments,
  fetchCommentsWithSignedAttachmentUrls,
  deleteUnusedAttachment,
} from '@/data/contracts';
import { useFormStatus } from 'react-dom';
import { UserMetadata } from '@/constants/types';
import { UserAvatar } from '@/components/ui/user-avatar';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast, useToast } from '@/components/ui/use-toast';
import 'tippy.js/dist/tippy.css';
import { Toolbar } from './Toolbar';
import { sendCommentNotifications } from '@/app/lib/contracts/utils';
import { Badge } from '@/components/ui/badge';
import { attachmentStore } from '@/utils/attachmentStore';
import { AttachmentNode } from './AttachmentNode';
import { Spinner } from '@/components/ui/spinner';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  UserData,
  processMultipleFiles,
} from '@/app/lib/contracts/attachments';
import { isValidUrl, normalizeUrl } from '@/utils/helpers';

interface CommentUser {
  id: string;
  email: string | null;
  name?: string | null;
}

export interface Comment {
  id: number;
  content: JSONContent;
  contract_id: number;
  created_at: string;
  is_deleted: boolean;
  parent_comment_id: number | null;
  updated_at: string;
  user_id: string;
  user: CommentUser;
}

interface CommentsProps {
  contractId: number;
  user: UserMetadata;
  onCountChange?: (count: number) => void;
  initialComments?: Comment[];
  commentOrder?: 'newest_first' | 'oldest_first';
}

interface SubmitButtonProps {
  editor: any;
  isUploading: boolean;
}

const EDITOR_CLASSES = {
  prose:
    'prose dark:prose-invert max-w-full text-foreground font-sans-neue prose-p:first:mt-2 prose-p:last:mb-2 prose-p:mt-3 prose-p:mb-3 leading-normal',
  editor:
    'min-h-24 w-full text-[0.925rem] rounded border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-ring/15',
  content:
    'prose dark:prose-invert prose-p:mt-3 prose-p:mb-3 max-w-none font-sans-neue leading-normal text-foreground',
  mentions:
    'mention inline-flex font-sans items-center rounded-full border px-2 py-0 text-[0.8rem] font-medium mr-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-primary bg-psblue/10',
};

const ValidatedLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute('href'),
        renderHTML: (attrs) => {
          const rawHref = attrs.href ?? '';

          // Don't render <a> at all if it's not a valid URL
          if (!isValidUrl(rawHref)) {
            return {};
          }

          return {
            href: normalizeUrl(rawHref),
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
            class: 'text-primary hover:underline',
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setLink:
        (attrs) =>
        ({ commands }) => {
          const rawHref = attrs?.href ?? '';

          if (!isValidUrl(rawHref)) {
            toast({
              variant: 'destructive',
              description:
                'That does not look like a valid URL. Try including a real domain, like "example.com" or "https://example.com".',
            });
            return false;
          }

          const safeHref = normalizeUrl(rawHref);
          const applied = commands.setMark(this.name, {
            ...attrs,
            href: safeHref,
          });
          return !!applied;
        },
    };
  },
});

const baseExtensions = [
  StarterKit,
  Underline,
  ValidatedLink.configure({
    openOnClick: true,
    HTMLAttributes: {
      class: 'text-primary hover:underline',
    },
  }),
  Mention.configure({
    HTMLAttributes: {
      class: `${EDITOR_CLASSES.mentions}`,
    },
  }),
  Image,
  AttachmentNode,
];

const createExtensions = (
  users: MentionUser[],
  userData: {
    userId: string;
    organizationId: string;
    contractId: number;
    commentId?: number;
  },
  toastFn: any,
) => [
  ...baseExtensions.filter((extension) => extension.name !== 'mention'),
  Mention.configure({
    HTMLAttributes: {
      class: `${EDITOR_CLASSES.mentions}`,
      spellcheck: 'false',
    },
    // @ts-ignore
    suggestion: createMentionSuggestion(users),
  }),
  CharacterCount.configure({
    limit: 3000,
  }),
  Placeholder.configure({
    placeholder: 'Add a comment…',
  }),
  FileHandler.configure({
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    ...({
      maxFileSize: MAX_FILE_SIZE,
      onError: (error: any) => {
        console.error('File upload error:', error.message);
        let errorMessage = error.message;
        if (error.type === 'file-size') {
          errorMessage = `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`;
        }
        toastFn({
          variant: 'destructive',
          description: errorMessage,
        });
        return errorMessage;
      },
    } as any),
    onDrop: async (currentEditor, files, pos) => {
      return processMultipleFiles(currentEditor, files, userData, pos, toastFn);
    },
    onPaste: async (currentEditor, files, htmlContent) => {
      // If HTML content is provided, let other extensions handle it
      if (htmlContent) {
        return false;
      }

      try {
        const pos = currentEditor.state.selection.anchor;
        return await processMultipleFiles(
          currentEditor,
          files,
          userData,
          pos,
          toastFn,
        );
      } catch (error) {
        console.error('Error handling paste:', error);
        toastFn({
          variant: 'destructive',
          description: 'Error handling pasted files.',
        });
        return false;
      }
    },
  }),
];

const fixAnchorHrefs = (html: string) =>
  html.replace(
    /href="(?![a-z][a-z0-9+.-]*:)([^"]+)"/gi,
    (_m, href) => `href="${normalizeUrl(href)}"`,
  );

const generateContentHTML = (content: JSONContent): string => {
  const hasAttachmentsWithSignedUrls =
    checkForAttachmentsWithSignedUrls(content);

  let extensionsToUse = baseExtensions;

  if (hasAttachmentsWithSignedUrls) {
    extensionsToUse = baseExtensions.map((extension) => {
      if (extension.name === 'attachment') {
        return createStaticAttachmentExtension();
      }
      return extension;
    });
  }

  const html = generateHTML(content, extensionsToUse);
  return fixAnchorHrefs(html);
};

function checkForAttachmentsWithSignedUrls(content: JSONContent): boolean {
  let hasAttachmentsWithSignedUrls = false;

  function traverse(node: { type?: string; attrs?: any; content?: any[] }) {
    if (node.type === 'attachment' && node.attrs?.signedUrl) {
      hasAttachmentsWithSignedUrls = true;
      return true;
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (traverse(child)) {
          return true;
        }
      }
    }

    return false;
  }

  if (content) {
    traverse(content);
  }

  return hasAttachmentsWithSignedUrls;
}

function createStaticAttachmentExtension() {
  return TiptapNode.create({
    name: 'attachment',
    group: 'block',
    atom: true,

    addAttributes() {
      return {
        id: { default: null },
        filename: { default: '' },
        filetype: { default: '' },
        filesize: { default: 0 },
        path: { default: '' },
        signedUrl: { default: null },
        urlError: { default: null },
      };
    },

    renderHTML({ HTMLAttributes }) {
      const { id, filename, filetype, path, signedUrl, urlError } =
        HTMLAttributes;

      if (urlError) {
        return [
          'div',
          {
            class:
              'attachment-error rounded border border-red-200 bg-red-50 p-3 text-red-600',
            'data-attachment-id': id,
            'data-attachment-path': path,
            'data-attachment-filetype': filetype,
            'data-attachment-filename': filename,
          },
          ['p', { class: 'text-sm' }, urlError],
        ];
      }

      if (!signedUrl) {
        return [
          'div',
          {
            class: 'attachment-node',
            'data-attachment-id': id,
            'data-attachment-path': path,
            'data-attachment-filetype': filetype,
            'data-attachment-filename': filename,
          },
        ];
      }

      if (filetype?.startsWith('image/')) {
        return [
          'div',
          {
            class: 'attachment-container my-4',
            'data-attachment-id': id,
            'data-attachment-path': path,
            'data-attachment-filetype': filetype,
            'data-attachment-filename': filename,
          },
          [
            'img',
            {
              src: signedUrl,
              alt: filename,
              title: filename,
              class: 'max-w-full rounded border my-0',
            },
          ],
        ];
      }

      // For non-image files, include the FileText icon SVG
      return [
        'div',
        {
          class:
            'attachment-container my-2 inline-flex items-center gap-2 rounded border px-2 py-1',
          'data-attachment-id': id,
          'data-attachment-path': path,
          'data-attachment-filetype': filetype,
          'data-attachment-filename': filename,
        },
        [
          'div',
          { class: 'flex-shrink-0 text-primary' },
          [
            'svg',
            {
              width: '14',
              height: '14',
              viewBox: '0 0 15 15',
              fill: 'none',
              xmlns: 'http://www.w3.org/2000/svg',
            },
            [
              'path',
              {
                d: 'M3 2.5C3 2.22386 3.22386 2 3.5 2H9.08579C9.21839 2 9.34557 2.05268 9.43934 2.14645L11.8536 4.56066C11.9473 4.65443 12 4.78161 12 4.91421V12.5C12 12.7761 11.7761 13 11.5 13H3.5C3.22386 13 3 12.7761 3 12.5V2.5ZM3.5 1C2.67157 1 2 1.67157 2 2.5V12.5C2 13.3284 2.67157 14 3.5 14H11.5C12.3284 14 13 13.3284 13 12.5V4.91421C13 4.51639 12.842 4.13486 12.5607 3.85355L10.1464 1.43934C9.86514 1.15804 9.48361 1 9.08579 1H3.5ZM4.5 4C4.22386 4 4 4.22386 4 4.5C4 4.77614 4.22386 5 4.5 5H7.5C7.77614 5 8 4.77614 8 4.5C8 4.22386 7.77614 4 7.5 4H4.5ZM4.5 7C4.22386 7 4 7.22386 4 7.5C4 7.77614 4.22386 8 4.5 8H10.5C10.7761 8 11 7.77614 11 7.5C11 7.22386 10.7761 7 10.5 7H4.5ZM4.5 10C4.22386 10 4 10.2239 4 10.5C4 10.7761 4.22386 11 4.5 11H10.5C10.7761 11 11 10.7761 11 10.5C11 10.2239 10.7761 10 10.5 10H4.5Z',
                fill: 'currentColor',
              },
            ],
          ],
        ],
        [
          'div',
          { class: 'flex-1' },
          [
            'a',
            {
              href: signedUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              class:
                'font-medium line-clamp-1 text-sm text-primary no-underline hover:underline',
            },
            filename,
          ],
        ],
      ];
    },
  });
}

interface ReplyEditorProps {
  parentCommentId: number;
  onSubmit: (content: JSONContent) => Promise<void>;
  onCancel: () => void;
  users: MentionUser[];
  userData: UserData;
}

const ReplyEditor = ({
  parentCommentId,
  onSubmit,
  onCancel,
  users,
  userData,
}: ReplyEditorProps) => {
  const { toast } = useToast();

  const replyUserData = useMemo(
    () => ({
      ...userData,
      commentId: parentCommentId,
    }),
    [userData, parentCommentId],
  );

  const extensions = useMemo(
    () => createExtensions(users, replyUserData, toast),
    [users, replyUserData, toast],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${EDITOR_CLASSES.prose} ${EDITOR_CLASSES.editor}`,
      },
    },
    autofocus: true,
  });

  if (!editor) return null;

  const handleSubmit = async () => {
    if (editor.isEmpty) return;
    await onSubmit(editor.getJSON());
    editor.commands.setContent('');
  };

  return (
    <div className="mt-4">
      <Toolbar editor={editor} userData={userData} />
      <EditorContent editor={editor} />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          Reply
        </Button>
      </div>
    </div>
  );
};

interface CommentThreadProps {
  comment: Comment & { replies?: Comment[] };
  depth?: number;
  userData: UserData;
  userId: string;
  isDeleting: boolean;
  editingCommentId: number | null;
  setEditingCommentId: (id: number | null) => void;
  handleDeleteComment: (commentId: number) => void;
  replyingToId: number | null;
  setReplyingToId: (id: number | null) => void;
  users: MentionUser[];
  handleUpdateComment: (commentId: number, content: JSONContent) => void;
  handleReply: (content: JSONContent) => Promise<void>;
}

const CommentThread = ({
  comment,
  depth = 0,
  userData,
  userId,
  isDeleting,
  editingCommentId,
  setEditingCommentId,
  handleDeleteComment,
  replyingToId,
  setReplyingToId,
  users,
  handleUpdateComment,
  handleReply,
}: CommentThreadProps) => {
  const { dateFormat } = useDateFormat();
  const indentClass = depth > 0 ? 'ml-10' : '';

  const handleReplyClick = () => {
    if (replyingToId === comment.id) {
      setReplyingToId(null);
    } else {
      setReplyingToId(comment.id);
    }
  };

  const renderCommentContent = (comment: Comment) => {
    if (editingCommentId === comment.id) {
      return (
        <EditableComment
          comment={comment}
          onSave={(content) => handleUpdateComment(comment.id, content)}
          onCancel={() => setEditingCommentId(null)}
          users={users}
          userData={userData}
        />
      );
    }

    return (
      <div
        className="prose max-w-none font-sans-neue text-[0.925rem] leading-normal text-foreground dark:prose-invert prose-p:mb-3 prose-p:mt-3 prose-p:first:mt-2 prose-p:last:mb-2"
        dangerouslySetInnerHTML={{
          __html: generateContentHTML(comment.content),
        }}
      />
    );
  };

  return (
    <div
      id={`comment-${comment.id}`}
      className={`relative mt-4 border-t pt-4 ${indentClass}`}
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={comment.user?.name}
          email={comment.user?.email}
          userId={comment.user_id}
          size="sm"
        />
        <div className="flex-1">
          <div className="flex h-7 items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="font-medium font-sans text-[0.8rem] leading-none">
                {comment.user?.name || comment.user?.email}
              </p>
              <span className="font-label text-xs text-muted-foreground/80">
                {format(new Date(comment.created_at), `${dateFormat} h:mm a`)}
              </span>
            </div>
            {comment.user_id === userId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-7 w-7 p-0 text-gray-700/80 hover:text-foreground/80"
                    disabled={isDeleting}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[70]">
                  <DropdownMenuItem
                    onClick={() => setEditingCommentId(comment.id)}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => handleDeleteComment(comment.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div>{renderCommentContent(comment)}</div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="link"
              size="sm"
              className="h-8 p-0 font-label text-xs text-muted-foreground"
              onClick={handleReplyClick}
            >
              Reply
            </Button>
          </div>
          {replyingToId === comment.id && (
            <ReplyEditor
              parentCommentId={comment.id}
              onSubmit={handleReply}
              onCancel={() => setReplyingToId(null)}
              users={users}
              userData={userData}
            />
          )}
        </div>
      </div>
      {comment.replies &&
        comment.replies.map((reply) => (
          <CommentThread
            key={reply.id}
            comment={reply}
            depth={depth + 1}
            userData={userData}
            userId={userId}
            isDeleting={isDeleting}
            editingCommentId={editingCommentId}
            setEditingCommentId={setEditingCommentId}
            handleDeleteComment={handleDeleteComment}
            replyingToId={replyingToId}
            setReplyingToId={setReplyingToId}
            users={users}
            handleUpdateComment={handleUpdateComment}
            handleReply={handleReply}
          />
        ))}
    </div>
  );
};

const EditableComment = ({
  comment,
  onSave,
  onCancel,
  users,
  userData,
}: {
  comment: Comment;
  onSave: (content: JSONContent) => void;
  onCancel: () => void;
  users: MentionUser[];
  userData: UserData;
}) => {
  const { toast } = useToast();

  const editUserData = useMemo(
    () => ({
      ...userData,
      commentId: comment.id,
    }),
    [userData, comment.id],
  );

  const extensions = useMemo(
    () => createExtensions(users, editUserData, toast),
    [users, editUserData, toast],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${EDITOR_CLASSES.prose} ${EDITOR_CLASSES.editor}`,
      },
    },
    content: comment.content,
  });

  if (!editor) {
    return null;
  }

  return (
    <div>
      <Toolbar editor={editor} userData={userData} />
      <div className="">
        <EditorContent editor={editor} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(editor.getJSON())}>
          Save
        </Button>
      </div>
    </div>
  );
};

function SubmitButton({ editor, isUploading }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  // Check if the editor is empty
  const isEditorEmpty = !editor || editor.isEmpty;

  const isDisabled = pending || isEditorEmpty || isUploading;

  return (
    <Button type="submit" disabled={isDisabled} size="sm">
      {pending ? 'Adding...' : 'Add Comment'}
    </Button>
  );
}

const Comments: React.FC<CommentsProps> = ({
  contractId,
  user,
  onCountChange,
  initialComments,
  commentOrder = 'newest_first',
}) => {
  const [comments, setComments] = useState<Comment[]>(initialComments || []);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(
    !Array.isArray(initialComments),
  );
  const { toast } = useToast();
  const userId = user?.userId;
  const organizationId = user?.organizationId;
  const [isUploading, setIsUploading] = useState(false);

  const userData = useMemo(
    () => ({
      userId: userId || '',
      organizationId: organizationId || '',
      contractId,
    }),
    [userId, organizationId, contractId],
  );

  const extensions = useMemo(
    () => createExtensions(users, userData, toast),
    [users, userData, toast],
  );

  useEffect(() => {
    const cleanupOrphanedAttachments = async () => {
      if (!userData.userId) return;

      try {
        // Clean up attachments that don't have a comment_id for this user
        // We don't need to pass excludeIds since we haven't uploaded anything yet
        const result = await cleanupUnusedAttachments(userData.userId, []);

        if (result.deletedCount > 0) {
          logger.info(
            { deletedCount: result.deletedCount },
            `Cleaned up ${result.deletedCount} orphaned attachments on page load`,
          );
        }

        attachmentStore.clearPendingAttachments();
      } catch (error) {
        console.error(
          'Error cleaning up orphaned attachments on page load:',
          error,
        );
      }
    };

    cleanupOrphanedAttachments();
  }, [userData.userId]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const orgUsers = await fetchOrgUsersForMentions(user.organizationId, {
          currentUserEmail: user.userProfile?.email,
        });

        setUsers(orgUsers);
      } catch (error) {
        console.error('Error loading users:', error);
        toast({
          variant: 'destructive',
          description: 'Failed to load users',
        });
      }
    };

    loadUsers();
  }, [user.organizationId]);

  const editor = useEditor(
    {
      extensions,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: `${EDITOR_CLASSES.prose} ${EDITOR_CLASSES.editor}`,
        },
      },
      content: '',
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor) return () => {};

    const checkUploadingStatus = () => {
      let uploading = false;
      editor.state.doc.descendants((node: any) => {
        if (
          node.type.name === 'attachment' &&
          node.attrs &&
          node.attrs.isLoading === true
        ) {
          uploading = true;
          return false;
        }
        return true;
      });
      setIsUploading(uploading);
    };

    // Check initially
    checkUploadingStatus();

    // Subscribe to editor updates
    const unsubscribe = editor.on('update', checkUploadingStatus);

    return () => unsubscribe.off('update', checkUploadingStatus);
  }, [editor]);

  const loadComments = async (): Promise<void> => {
    try {
      setIsLoadingComments(true);
      const commentsData =
        await fetchCommentsWithSignedAttachmentUrls(contractId);
      setComments((commentsData || []) as Comment[]);
      onCountChange?.((commentsData || []).length);
    } catch (error) {
      console.error('Error loading comments:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to load comments',
      });
      setComments([]); // Set to empty array on error
      onCountChange?.(0);
    } finally {
      setIsLoadingComments(false);
    }
  };

  useEffect(() => {
    if (Array.isArray(initialComments)) {
      onCountChange?.(initialComments.length);
      setIsLoadingComments(false);
    } else {
      loadComments();
    }

    // Set up a periodic refresh every 45 minutes
    const refreshInterval = setInterval(loadComments, 45 * 60 * 1000);

    // Refresh when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadComments();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contractId]);

  useEffect(() => {
    if (!editor) return () => {};

    interface AttachmentInfo {
      id: number;
      path: string;
    }

    const handleTransaction = (props: { transaction: any }) => {
      const { transaction } = props;
      if (!transaction.docChanged) return;

      const deletedAttachments: AttachmentInfo[] = [];

      transaction.steps.forEach((step: any) => {
        if (
          step.jsonID === 'replace' &&
          step.slice &&
          step.slice.content.size === 0
        ) {
          const { from, to } = step;

          transaction.before.nodesBetween(
            from,
            to,
            (node: any, pos: number) => {
              if (node.type.name === 'attachment' && node.attrs.id) {
                deletedAttachments.push({
                  id: node.attrs.id,
                  path: node.attrs.path,
                });
              }
            },
          );
        }
      });

      Promise.all(
        deletedAttachments.map((attachment) =>
          deleteUnusedAttachment(attachment.id),
        ),
      ).catch((error) => {
        console.error('Error cleaning up attachments:', error);
      });
    };

    editor.on('transaction', handleTransaction);

    return () => {
      editor.off('transaction', handleTransaction);
    };
  }, [editor?.state.doc]);

  const handleUpdateComment = async (
    commentId: number,
    content: JSONContent,
  ) => {
    try {
      await updateComment({
        id: commentId,
        content: JSON.parse(JSON.stringify(content)),
        userId: user?.userId,
      });
      setEditingCommentId(null);
      await loadComments();
      toast({
        description: 'Comment updated successfully',
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to update comment',
      });
    }
  };

  const handleReply = async (content: JSONContent) => {
    if (!replyingToId) return;

    try {
      const serializedContent = JSON.parse(JSON.stringify(content));
      const commentData = {
        content: serializedContent,
        contractId,
        userId: user?.userId,
        parentCommentId: replyingToId,
      };

      // Create an optimistic comment
      const optimisticComment: Comment = {
        id: Date.now(),
        content: serializedContent,
        contract_id: contractId,
        created_at: new Date().toISOString(),
        is_deleted: false,
        parent_comment_id: replyingToId,
        updated_at: new Date().toISOString(),
        user_id: user?.userId || '',
        user: {
          id: user?.userId || '',
          email: user?.userProfile?.email || '',
          name: user?.userProfile?.name || '',
        },
      };

      // Update state optimistically
      setComments((prevComments) => [...prevComments, optimisticComment]);
      setReplyingToId(null);

      // Make the API call
      await insertComment(commentData);

      // Generate HTML for the comment
      const commentHtml = generateContentHTML(serializedContent);

      // Send notifications to mentioned users and the parent comment author
      const parentComment = comments.find((c) => c.id === replyingToId);
      await sendCommentNotifications({
        content: serializedContent,
        organizationId: user.organizationId,
        contractId,
        parentCommentUserId: parentComment?.user_id,
        html: commentHtml,
        currentUserEmail: user.userProfile?.email || '',
      });

      // Refresh comments from server to get the real ID
      await loadComments();
    } catch (error) {
      // If there's an error, reload comments to restore the correct state
      await loadComments();
      console.error('Error posting reply:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to add reply',
      });
    }
  };

  async function handleSubmit(_formData: FormData): Promise<void> {
    if (!editor || editor.isEmpty) return;

    const content = editor.getJSON();
    const serializedContent = JSON.parse(JSON.stringify(content));
    const commentHtml = generateContentHTML(serializedContent);

    // Capture current attachment IDs FIRST
    const currentAttachmentIds: number[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'attachment' && node.attrs.id) {
        currentAttachmentIds.push(node.attrs.id);
      }
      return true;
    });

    try {
      // Post the comment
      const commentData = {
        content: serializedContent,
        contractId,
        userId: user?.userId,
      };
      const result = await insertComment(commentData);

      editor.commands.clearContent(true);
      editor.commands.focus('end');

      if (result.id && currentAttachmentIds.length > 0) {
        // Link attachments
        const promises = currentAttachmentIds.map((attachmentId) =>
          linkAttachmentWithComment({ attachmentId, commentId: result.id }),
        );
        await Promise.all(promises);

        // After linking is complete, clean up
        await cleanupUnusedAttachments(user?.userId, currentAttachmentIds);
      }

      // Only send notifications if there are mentions in the comment
      const hasMentions = serializedContent.content?.some(
        (node: any) =>
          node.type === 'mention' ||
          node.content?.some((childNode: any) => childNode.type === 'mention'),
      );

      if (hasMentions) {
        await sendCommentNotifications({
          content: serializedContent,
          organizationId: user.organizationId,
          contractId,
          html: commentHtml,
          currentUserEmail: user.userProfile?.email || '',
        });
      }

      await loadComments();
    } catch (error) {
      console.error('Error posting comment:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to add comment',
      });
      await loadComments();
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!userId || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteComment(commentId, userId);
      await loadComments();
      toast({
        description: 'Comment deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast({
        variant: 'destructive',
        description: 'Failed to delete comment',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Organize comments into a hierarchical structure
  const organizeComments = (comments: Comment[]): Comment[] => {
    // Guard against undefined or null comments
    if (!comments || !Array.isArray(comments)) {
      return [];
    }

    const commentMap = new Map<number, Comment & { replies?: Comment[] }>();
    const topLevelComments: (Comment & { replies?: Comment[] })[] = [];

    // First pass: Create a map of all comments
    comments.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: Organize into hierarchy
    comments.forEach((comment) => {
      const commentWithReplies = commentMap.get(comment.id)!;
      if (comment.parent_comment_id === null) {
        topLevelComments.push(commentWithReplies);
      } else {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies?.push(commentWithReplies);
        }
      }
    });

    return topLevelComments;
  };

  const _linkPendingAttachmentsWithComment = async (commentId: number) => {
    if (!editor) return { linkedIds: [] };

    // Get attachment IDs that are currently in the editor
    const currentAttachmentIds: number[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'attachment' && node.attrs.id) {
        currentAttachmentIds.push(node.attrs.id);
      }
      return true;
    });

    // If no attachments in the editor, nothing to link
    if (currentAttachmentIds.length === 0) {
      return { linkedIds: [] };
    }

    logger.debug(
      {
        currentAttachmentIds,
      },
      'Linking current attachments to comment:',
    );

    try {
      // Only link the attachments that are still in the editor
      const promises = currentAttachmentIds.map((attachmentId) =>
        linkAttachmentWithComment({
          attachmentId,
          commentId,
        }),
      );

      await Promise.all(promises);

      // Clear the pending attachments store since we've processed them
      attachmentStore.clearPendingAttachments();

      // Return the list of IDs that were linked to the comment
      return { linkedIds: currentAttachmentIds };
    } catch (error) {
      console.error('Error associating attachments with comment:', error);
      return { linkedIds: [] };
    }
  };

  const _scrollToComment = (commentId: string) => {
    const element = document.getElementById(`comment-${commentId}`);
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const sortedComments = useMemo(() => {
    const list = [...comments];
    list.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return commentOrder === 'oldest_first' ? aTime - bTime : bTime - aTime;
    });
    return list;
  }, [comments, commentOrder]);

  const organizedComments = organizeComments(sortedComments);

  return (
    <div className="-mb-12 border-t bg-gray-700/5 dark:bg-black/10">
      <div className="space-y-6 p-6">
        <div>
          <div className="space-y-4 pb-2">
            <form action={handleSubmit}>
              <input type="hidden" name="userId" value={userId} />
              <Toolbar editor={editor} userData={userData} />
              <EditorContent editor={editor} />
              <div className="mt-4 flex justify-end">
                <SubmitButton editor={editor} isUploading={isUploading} />
              </div>
            </form>
          </div>
          {isLoadingComments && organizedComments.length === 0 ? (
            <div className="mt-6 flex justify-center py-12">
              <Spinner className="h-6 w-6 text-muted-foreground" />
            </div>
          ) : organizedComments.length > 0 ? (
            <div className="mt-6 space-y-4 pb-12">
              {organizedComments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  depth={0}
                  userData={userData}
                  userId={userId}
                  isDeleting={isDeleting}
                  editingCommentId={editingCommentId}
                  setEditingCommentId={setEditingCommentId}
                  handleDeleteComment={handleDeleteComment}
                  replyingToId={replyingToId}
                  setReplyingToId={setReplyingToId}
                  users={users}
                  handleUpdateComment={handleUpdateComment}
                  handleReply={handleReply}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Comments;
