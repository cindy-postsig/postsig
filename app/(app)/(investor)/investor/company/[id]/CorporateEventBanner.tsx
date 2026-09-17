import Link from 'next/link';
import { GitMerge } from 'lucide-react';
import { formatDate } from '@/lib/date-format';
import type {
  InvCorporateEventSummary,
  InvCorporateEventType,
} from '@/lib/v2/inv/types';

const PREDECESSOR_VERB: Record<InvCorporateEventType, string> = {
  merger: 'Merged into',
  acquisition: 'Acquired by',
  spin_off: 'Spun off into',
  reorganization: 'Reorganized into',
};

interface CorporateEventBannerProps {
  events?: InvCorporateEventSummary[];
  /** ISO date (yyyy-MM-dd) used to tell future-dated events apart. */
  today?: string;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function NameList({
  companies,
}: {
  companies: InvCorporateEventSummary['counterparts'];
}) {
  return (
    <>
      {companies.map((c, i) => (
        <span key={c.companyId}>
          {i > 0 && ', '}
          <Link
            href={`/investor/company/${c.publicId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {c.name}
          </Link>
        </span>
      ))}
    </>
  );
}

export function CorporateEventBanner({
  events,
  today = isoToday(),
}: CorporateEventBannerProps) {
  if (!events || events.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 text-sm text-foreground/70">
      {events.map((event) => {
        const date = formatDate(event.eventDate);
        const future = event.eventDate > today;
        const others = event.counterparts.filter((c) =>
          event.role === 'predecessor'
            ? c.role === 'successor'
            : c.role === 'predecessor',
        );
        return (
          <p key={event.id} className="flex items-center gap-2">
            <GitMerge className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {event.role === 'predecessor' ? (
              <span>
                {PREDECESSOR_VERB[event.eventType]}{' '}
                <NameList companies={others} />
                {future ? ` (effective ${date})` : ` on ${date}`}
              </span>
            ) : (
              <span>
                Successor of <NameList companies={others} />
                {future ? ` (effective ${date})` : ` (${date})`}
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}
