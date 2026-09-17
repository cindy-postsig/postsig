import { useDiscussionVisibility } from '@/app/ui/contracts/toggleDiscussion';
import { Button } from '@/components/ui/button';
import { markContractCommentsViewed } from '@/data/contracts';
import { ChatBubbleIcon } from '@radix-ui/react-icons';
import { useState } from 'react';

export default function DiscussionButton({
  userId,
  contractId,
  initialUnreadCommentsCount,
}: {
  userId?: string;
  contractId: number;
  initialUnreadCommentsCount?: number;
}) {
  const context = useDiscussionVisibility();
  const { toggleDiscussion, isDiscussionOpen } = context || {};
  const [unreadCommentsCount, setUnreadCommentsCount] = useState<
    number | undefined
  >(initialUnreadCommentsCount);

  return (
    <Button
      variant={'outline'}
      onClick={async () => {
        toggleDiscussion?.();
        setUnreadCommentsCount(0);
        try {
          if (userId) {
            await markContractCommentsViewed(contractId, userId);
          }
        } catch (e) {
          console.error('Failed to mark comments viewed', e);
        }
      }}
      className={`relative h-9 w-9 ${isDiscussionOpen && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'}`}
    >
      <ChatBubbleIcon width={18} height={18} />
      {!!unreadCommentsCount && (
        <span className="font-medium absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] leading-[1.1rem] text-destructive-foreground">
          {unreadCommentsCount > 99 ? '99+' : unreadCommentsCount}
        </span>
      )}
    </Button>
  );
}
