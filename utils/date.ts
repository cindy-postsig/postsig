import { differenceInHours, formatDistanceToNow, format } from 'date-fns';
import { DATE_FORMAT_DEFAULT } from '@/lib/date-format';

export function formatDateTime(
  dateString: string,
  pattern: string = DATE_FORMAT_DEFAULT,
): {
  text: string;
  isRecent: boolean;
} {
  const date = new Date(dateString);
  const hoursAgo = differenceInHours(new Date(), date);
  if (hoursAgo < 1) {
    return {
      text: formatDistanceToNow(date, { addSuffix: true }),
      isRecent: true,
    };
  }
  return {
    text: `${format(date, pattern)}, ${format(date, 'h:mm a')}`,
    isRecent: false,
  };
}
