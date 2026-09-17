'use client';

import { memo, useState } from 'react';
import { Cross2Icon } from '@radix-ui/react-icons';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDiscussionVisibility } from '@/app/ui/contracts/toggleDiscussion';
import Comments, { Comment } from '@/components/contracts/comments/Comments';
import { UserMetadata } from '@/constants/types';
import { CommentOrder, setContractCommentsOrder } from '@/data/contracts';

interface DiscussionViewerProps {
  contractId: number;
  user: UserMetadata;
  initialComments?: Comment[];
  initialCommentOrder?: CommentOrder;
  className?: string;
  isActive?: boolean;
}

const DiscussionViewer = memo(function DiscussionViewer({
  contractId,
  user,
  initialComments,
  initialCommentOrder = 'newest_first',
  className,
  isActive = true,
}: DiscussionViewerProps) {
  const context = useDiscussionVisibility();
  const [commentCount, setCommentCount] = useState<number>(0);
  const [commentOrder, setCommentOrder] =
    useState<CommentOrder>(initialCommentOrder);
  const [isSavingCommentOrder, setIsSavingCommentOrder] = useState(false);

  if (!context) {
    throw new Error(
      'useDiscussionVisibility must be used within a DiscussionVisibilityProvider',
    );
  }

  const { isDiscussionOpen, toggleDiscussion } = context;

  if (!isDiscussionOpen) return null;

  return (
    <div
      className={cn(
        'relative h-[calc(100vh-3.5rem)] w-1/2 shrink-0 bg-background',
        isActive ? 'z-[60]' : 'z-[50]',
        className,
      )}
      aria-label="Discussion panel"
    >
      <div className="flex h-10 items-center justify-between border-b px-2">
        <div className="flex items-center gap-2 px-2">
          <div className="font-medium font-sans text-sm">Discussion</div>
          {commentCount > 0 && (
            <Badge variant={'secondary'} className="h-5 px-1.5 text-[0.7rem]">
              {commentCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            disabled={isSavingCommentOrder}
            onClick={async () => {
              if (isSavingCommentOrder) return;

              const next: CommentOrder =
                commentOrder === 'newest_first'
                  ? 'oldest_first'
                  : 'newest_first';
              setCommentOrder(next);
              setIsSavingCommentOrder(true);
              try {
                await setContractCommentsOrder(contractId, user.userId, next);
              } catch (e) {
                console.error('Failed to save comment order', e);
              } finally {
                setIsSavingCommentOrder(false);
              }
            }}
            className="h-9 rounded-sm px-2 text-xs text-muted-foreground dark:hover:bg-accent/30"
            aria-label="Toggle comment sort order"
          >
            {commentOrder === 'newest_first' ? 'Newest' : 'Oldest'}
          </Button>
          <Button
            variant="ghost"
            onClick={toggleDiscussion}
            className="h-9 w-9 rounded-sm p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
            aria-label="Close discussion"
          >
            <Cross2Icon width={16} height={16} />
          </Button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 top-10 overflow-y-auto">
        <div className="p-4">
          <Comments
            contractId={contractId}
            user={user}
            initialComments={initialComments}
            commentOrder={commentOrder}
            onCountChange={setCommentCount}
          />
        </div>
      </div>
    </div>
  );
});

export default DiscussionViewer;
