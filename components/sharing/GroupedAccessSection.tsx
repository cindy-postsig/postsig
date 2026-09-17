import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { UserItem } from './UserItem';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email?: string;
  signedUp?: boolean;
}

interface GroupedAccessSectionProps {
  value: string;
  icon: React.ReactNode;
  title: string | React.ReactNode;
  users: User[];
  helpText?: string;
  className?: string;
  onRemoveUser?: (userId: string) => void;
  getUserBadge?: (user: User) =>
    | {
        label: string;
        variant?: 'outline' | 'default' | 'secondary' | 'destructive';
      }
    | undefined;
}

export function GroupedAccessSection({
  value,
  icon,
  title,
  users,
  helpText,
  className,
  onRemoveUser,
  getUserBadge,
}: GroupedAccessSectionProps) {
  return (
    <Accordion type="multiple">
      <AccordionItem value={value} className="border-0">
        <AccordionTrigger
          className={cn('font-normal py-2 pr-2 hover:no-underline', className)}
        >
          <div className="flex flex-1 items-center gap-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
              {icon}
            </div>
            <div className="flex items-center gap-3 text-sm">
              {typeof title === 'string' ? <span>{title}</span> : title}
              <Badge
                variant={'secondary'}
                className="h-5 w-5 items-center justify-center p-0 text-[0.7rem] leading-[normal]"
              >
                {users.length}
              </Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className={cn('pb-0', className)}>
          <div className="mb-2 ml-6 space-y-0.5">
            {helpText && (
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                {helpText}
              </p>
            )}
            {users.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No members
              </p>
            ) : (
              users.map((user) => {
                const badge = getUserBadge?.(user);
                const badges = badge ? [badge] : [];
                return (
                  <UserItem
                    key={user.id}
                    user={user}
                    avatarSize="xs"
                    className="text-[0.825rem]"
                    variant="compact"
                    badges={badges}
                    onRemove={
                      badge?.label === 'Uploader' ? undefined : onRemoveUser
                    }
                  />
                );
              })
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
