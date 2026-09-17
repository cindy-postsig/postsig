'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';
import { currentPeriod, deriveCompanyDomain } from '@/lib/v2/kpis/transforms';
import {
  NARRATIVE_CATEGORY,
  type KpiDefinition,
  type PendingRequest,
  type ReportingDocTypeOption,
  type RequestKpiRef,
} from '@/lib/v2/kpis/types';
import { RecipientCombobox } from './RecipientCombobox';

export type RequestType = 'kpi' | 'reporting_pack';

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function CopyLinkField({ link }: { link: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        aria-label="Share link"
        value={link}
        className="h-10 bg-muted font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        aria-label="Copy link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast({ description: 'Link copied' });
          } catch {
            toast({
              variant: 'destructive',
              description: 'Could not copy link',
            });
          }
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function FieldGroup({
  title,
  items,
}: {
  title: string;
  items: { label: string; isCustom?: boolean }[];
}) {
  return (
    <div>
      <p className="mb-1.5 font-sans-neue text-[0.65rem] uppercase tracking-wider text-foreground/60">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[...items]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((item, i) => (
            <Badge key={i} variant="secondary" size="xs">
              {item.label}
              {item.isCustom && (
                <span className="ml-1 text-foreground/50">· Custom</span>
              )}
            </Badge>
          ))}
      </div>
    </div>
  );
}

// Read-only summary shown both as the post-submit confirmation and as the
// landing view for an existing request — one component, never two.
function RequestSummary({
  canEdit,
  isKpi,
  periodLabel,
  kpiGroups,
  docNames,
  recipients,
  companyId,
  addingRecipient,
  onAddRecipient,
  shareLink,
  companyDomain,
  onEdit,
}: {
  canEdit: boolean;
  isKpi: boolean;
  periodLabel: string;
  kpiGroups: {
    category: string;
    items: { label: string; isCustom: boolean }[];
  }[];
  docNames: string[];
  recipients: string[];
  companyId: number;
  addingRecipient: boolean;
  onAddRecipient: (email: string) => void;
  shareLink: string;
  companyDomain: string | null;
  onEdit: () => void;
}) {
  const kpiCount = kpiGroups.reduce((n, g) => n + g.items.length, 0);
  const docCount = docNames.length;
  const title = `${periodLabel} ${isKpi ? 'KPIs' : 'Reporting pack'}`;
  const requested = [
    isKpi ? `${kpiCount} KPI${kpiCount === 1 ? '' : 's'}` : null,
    docCount > 0 ? `${docCount} document${docCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex max-h-[86vh] flex-col">
      <div className="px-6 pt-6">
        <h2 className="font-medium text-lg">{title}</h2>
      </div>

      <Separator className="mx-6 mt-5 w-auto" />

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <Label className="font-medium text-sm">Requested</Label>
              <span className="text-xs text-muted-foreground">{requested}</span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="font-sans-neue text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          <ScrollArea className="h-48 rounded-md border">
            <div className="p-5">
              {[
                ...kpiGroups,
                ...(docCount > 0
                  ? [
                      {
                        category: 'Documents',
                        items: docNames.map((label) => ({ label })),
                      },
                    ]
                  : []),
              ].map((g) => (
                <div key={g.category} className="py-3 first:pt-0 last:pb-0">
                  <FieldGroup title={g.category} items={g.items} />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Primary action — invite people to submit */}
        <RecipientCombobox
          companyId={companyId}
          excludeEmails={recipients}
          onSelect={onAddRecipient}
          disabled={addingRecipient}
          label="Add recipients"
        />

        {recipients.length > 0 && (
          <div className="space-y-1">
            <Label className="font-medium text-sm">People with access</Label>
            <div className="divide-y">
              {recipients.map((r) => (
                <div key={r} className="flex items-center gap-2 py-2">
                  <UserAvatar email={r} size="sm" />
                  <p className="text-sm">{r}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="font-medium text-sm">Share link</Label>
          <CopyLinkField link={shareLink} />
          <p className="text-xs text-muted-foreground">
            {companyDomain
              ? `Anyone with an @${companyDomain} email can use this link to sign in.`
              : 'Only people invited above can use this link.'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end px-6 pb-6 pt-2">
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </div>
    </div>
  );
}

export function ReportingRequestDialog({
  open,
  onOpenChange,
  requestType,
  editRequest = null,
  companyId,
  storedDomain,
  suggestedDomain,
  kpiCatalog,
  docTypes,
  pendingRequests = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestType: RequestType;
  editRequest?: PendingRequest | null;
  companyId: number;
  storedDomain: string | null;
  suggestedDomain: string | null;
  kpiCatalog: KpiDefinition[];
  docTypes: ReportingDocTypeOption[];
  pendingRequests?: PendingRequest[];
}) {
  const { year: currentYear, quarter: currentQuarter } = currentPeriod();

  const [cadence, setCadence] = useState<'quarterly' | 'annual'>('quarterly');
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(currentQuarter);
  const [recipients, setRecipients] = useState<string[]>([]);
  // Recipients already attached to the request being edited; these can't be
  // removed here (a request can gain recipients, not drop them).
  const [lockedRecipients, setLockedRecipients] = useState<Set<string>>(
    new Set(),
  );
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [kpiSelected, setKpiSelected] = useState<Set<number>>(new Set());
  // KPI defs resolved from the loaded request, carrying labels for any custom
  // KPI later deactivated and thus absent from the active catalog.
  const [requestKpis, setRequestKpis] = useState<RequestKpiRef[]>([]);
  const [docTypeSelected, setDocTypeSelected] = useState<Set<number>>(
    new Set(),
  );
  const [customLabels, setCustomLabels] = useState<string[]>(['']);
  const [activeTab, setActiveTab] = useState<'kpi' | 'docs'>('kpi');
  const [submitting, setSubmitting] = useState(false);
  const [createdPublicId, setCreatedPublicId] = useState<string | null>(null);
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  // Confirm-domain prompt, shown on submit while the company has no stored
  // domain.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  // An auto-suggestion must never overwrite what the investor typed (or
  // deliberately cleared).
  const domainTouchedRef = useRef(false);
  const [addingRecipient, setAddingRecipient] = useState(false);
  // An edit lands on the summary, but its existing recipients load async; gate the
  // summary until they're in so adding one doesn't skip dedup and re-email them.
  // A failed load must not fall through to the summary either — it would render
  // an empty recipient list and misstate who can use the share link.
  const [recipientsLoaded, setRecipientsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  // Selection captured when entering edit-from-view, so Cancel can discard.
  const editSnapshotRef = useRef<{
    kpiSelected: Set<number>;
    docTypeSelected: Set<number>;
    customLabels: string[];
    message: string;
    recipients: string[];
    lockedRecipients: Set<string>;
    domainInput: string;
  } | null>(null);

  // Each open starts clean; an edit then seeds the period from the target request
  // and loads its selection, recipients, and message in the effect below.
  useEffect(() => {
    if (!open) return;
    setRecipients([]);
    setLockedRecipients(new Set());
    setMessage('');
    setSearch('');
    setKpiSelected(new Set());
    setRequestKpis([]);
    setDocTypeSelected(new Set());
    setCustomLabels(['']);
    setActiveTab('kpi');
    // An existing request lands on its read-only view; a new one starts on the form.
    setCreatedPublicId(editRequest ? editRequest.publicId : null);
    // An edit resolves the domain from the loaded request below; a fresh
    // request starts from the server-known value.
    setCompanyDomain(editRequest ? null : storedDomain);
    setConfirmOpen(false);
    setDomainInput(storedDomain ? '' : (suggestedDomain ?? ''));
    domainTouchedRef.current = false;
    setAddingRecipient(false);
    // A fresh request has no recipients to fetch; an edit waits for the load below.
    setRecipientsLoaded(!editRequest);
    setLoadFailed(false);
    setCadence(
      editRequest && editRequest.periodQuarter == null ? 'annual' : 'quarterly',
    );
    setYear(editRequest?.periodYear ?? currentYear);
    setQuarter(editRequest?.periodQuarter ?? currentQuarter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestType, editRequest]);

  useEffect(() => {
    if (!open || !editRequest) return;
    let cancelled = false;
    setLoadFailed(false);
    apiClient.reporting
      .getRequest(editRequest.publicId)
      .then(({ details, recipients: rows }) => {
        if (cancelled) return;
        setKpiSelected(new Set(details.kpis.map((k) => k.id)));
        setRequestKpis(details.kpis);
        setDocTypeSelected(new Set(details.docTypeIds));
        setCustomLabels(
          details.customDocLabels.length ? details.customDocLabels : [''],
        );
        setMessage(details.message ?? '');
        setCompanyDomain(details.companyDomain);
        const emails = rows.map((r) => r.email);
        setRecipients(emails);
        setLockedRecipients(new Set(emails.map((e) => e.toLowerCase())));
        setRecipientsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editRequest, retryKey]);

  // Narrative KPIs stay hidden from requests; standard and org custom KPIs are
  // both requestable and share the grouped list.
  const visibleKpiCatalog = useMemo(
    () => kpiCatalog.filter((f) => f.category !== NARRATIVE_CATEGORY),
    [kpiCatalog],
  );

  // Categories with at least one standard KPI keep their catalog order; a
  // custom-only category sinks below them (stable sort preserves ties).
  const groupedKpis = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, KpiDefinition[]>();
    for (const field of visibleKpiCatalog) {
      if (term && !field.label.toLowerCase().includes(term)) continue;
      const arr = map.get(field.category) ?? [];
      arr.push(field);
      map.set(field.category, arr);
    }
    return Array.from(map.entries()).sort(
      ([, a], [, b]) =>
        Number(a.every((f) => f.isCustom)) - Number(b.every((f) => f.isCustom)),
    );
  }, [visibleKpiCatalog, search]);

  // The KPIs the user can currently see (search-filtered) — what Select All acts on.
  const selectableKpis = useMemo(
    () => groupedKpis.flatMap(([, fields]) => fields),
    [groupedKpis],
  );

  const isKpi = requestType === 'kpi';
  const customCount = customLabels.filter((l) => l.trim()).length;
  const kpiCount = kpiSelected.size;
  const docCount = docTypeSelected.size + customCount;
  const standardDocTypes = useMemo(
    () => docTypes.filter((dt) => dt.code !== 'other'),
    [docTypes],
  );
  const allKpiSelected =
    selectableKpis.length > 0 &&
    selectableKpis.every((f) => kpiSelected.has(f.id));
  const allDocsSelected =
    standardDocTypes.length > 0 &&
    docTypeSelected.size === standardDocTypes.length;
  const showKpiPanel = isKpi && activeTab === 'kpi';
  const showDocsPanel = !isKpi || activeTab === 'docs';
  const canSubmit = isKpi ? kpiCount > 0 : docCount > 0;

  const addRecipient = (email: string) => {
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    // The first corporate recipient seeds an untouched, empty domain field —
    // the same derivation the server would apply, but visible for confirmation.
    if (
      companyDomain == null &&
      !domainTouchedRef.current &&
      !domainInput.trim()
    ) {
      const derived = deriveCompanyDomain([addr]);
      if (derived) setDomainInput(derived);
    }
    setRecipients((list) => (list.includes(addr) ? list : [...list, addr]));
  };

  const setCategory = (fields: KpiDefinition[], on: boolean) =>
    setKpiSelected((prev) => {
      const next = new Set(prev);
      for (const f of fields) {
        if (on) next.add(f.id);
        else next.delete(f.id);
      }
      return next;
    });

  const enterEdit = () => {
    editSnapshotRef.current = {
      kpiSelected: new Set(kpiSelected),
      docTypeSelected: new Set(docTypeSelected),
      customLabels: [...customLabels],
      message,
      recipients: [...recipients],
      lockedRecipients: new Set(lockedRecipients),
      domainInput,
    };
    setCreatedPublicId(null);
  };

  // Cancel restores the pre-edit selection and returns to the read-only view.
  const cancelEdit = () => {
    const snap = editSnapshotRef.current;
    if (snap) {
      setKpiSelected(snap.kpiSelected);
      setDocTypeSelected(snap.docTypeSelected);
      setCustomLabels(snap.customLabels);
      setMessage(snap.message);
      setRecipients(snap.recipients);
      setLockedRecipients(snap.lockedRecipients);
      setDomainInput(snap.domainInput);
    }
    if (editRequest) setCreatedPublicId(editRequest.publicId);
  };

  // undefined = the company already has a domain, nothing to confirm; a
  // string/null carries the investor's choice from the confirm prompt (null =
  // deliberately no gate — the server must not fall back to derivation).
  const submitRequest = async (domainChoice: string | null | undefined) => {
    setSubmitting(true);
    try {
      const result = await apiClient.reporting.createRequest({
        companyId,
        requestType,
        periodYear: year,
        periodQuarter: cadence === 'quarterly' ? quarter : null,
        recipientEmails: recipients,
        companyDomain: domainChoice,
        message: message || undefined,
        kpiIds: Array.from(kpiSelected),
        docTypeIds: Array.from(docTypeSelected),
        customDocLabels: customLabels.map((l) => l.trim()).filter(Boolean),
      });
      setConfirmOpen(false);
      setCreatedPublicId(result.publicId);
      setCompanyDomain(result.companyDomain);
      router.refresh();
    } catch (err) {
      // The confirm prompt (if open) stays open so a rejected domain can be
      // corrected in place.
      toast({
        variant: 'destructive',
        title: 'Could not create request',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Without a stored domain, submission detours through the confirm prompt so
  // pinning the sign-in gate is an explicit decision, never a side effect.
  const handleSubmit = () => {
    if (companyDomain == null) {
      setConfirmOpen(true);
      return;
    }
    void submitRequest(undefined);
  };

  const domainChoice = domainInput.trim() || null;
  // A request no one could open must not be creatable: with no invited
  // recipients (and none already on it), the domain is the only way in.
  const confirmBlocked = domainChoice == null && recipients.length === 0;

  const shareLinkFor = (publicId: string) =>
    `${process.env.NEXT_PUBLIC_PORTCO_APP_URL ?? window.location.origin}/requests/${publicId}`;

  // Adding a recipient in the confirmation view persists immediately (the
  // request already exists) and emails them, unlike the staged list in the form.
  const handleAddPersistedRecipient = async (email: string) => {
    if (!createdPublicId || addingRecipient) return;
    const addr = email.trim().toLowerCase();
    if (recipients.some((r) => r.toLowerCase() === addr)) return;
    setAddingRecipient(true);
    try {
      await apiClient.reporting.addRecipient(createdPublicId, addr);
      setRecipients((list) => [...list, addr]);
      toast({
        title: 'Recipient added',
        description: `We emailed ${addr} a secure link.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not add recipient',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setAddingRecipient(false);
    }
  };

  const years = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
  ];
  const effectiveQuarter = cadence === 'quarterly' ? quarter : null;
  const periodLabel =
    cadence === 'annual' ? `FY ${year}` : `Q${quarter} ${year}`;

  const selectedKpiGroups = useMemo(() => {
    const byId = new Map<
      number,
      { label: string; category: string; isCustom: boolean; sortOrder: number }
    >();
    for (const f of kpiCatalog)
      byId.set(f.id, {
        label: f.label,
        category: f.category,
        isCustom: f.isCustom,
        sortOrder: f.sortOrder,
      });
    // A request may reference a custom KPI since deactivated and thus missing
    // from the active catalog; its label still resolves from the loaded request.
    for (const k of requestKpis)
      if (!byId.has(k.id))
        byId.set(k.id, {
          label: k.label,
          category: k.category,
          isCustom: k.isCustom,
          sortOrder: Number.MAX_SAFE_INTEGER,
        });
    const fields = Array.from(kpiSelected)
      .map((id) => byId.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = new Map<string, { label: string; isCustom: boolean }[]>();
    for (const f of fields) {
      const arr = groups.get(f.category) ?? [];
      arr.push({ label: f.label, isCustom: f.isCustom });
      groups.set(f.category, arr);
    }
    return Array.from(groups, ([category, items]) => ({ category, items }));
  }, [kpiCatalog, requestKpis, kpiSelected]);

  const selectedDocNames = useMemo(() => {
    const byId = new Map(docTypes.map((d) => [d.id, d.displayName]));
    return [
      ...Array.from(docTypeSelected)
        .map((id) => byId.get(id))
        .filter((n): n is string => Boolean(n)),
      ...customLabels.map((l) => l.trim()).filter(Boolean),
    ];
  }, [docTypes, docTypeSelected, customLabels]);

  // Periods already requested for this type are disabled in the pickers below.
  const takenPeriods = new Set(
    pendingRequests
      .filter((r) => r.requestType === requestType)
      .map((r) => `${r.periodYear}-${r.periodQuarter ?? 'FY'}`),
  );
  const hasExistingRequest = takenPeriods.has(
    `${year}-${effectiveQuarter ?? 'FY'}`,
  );
  const title = editRequest
    ? `Edit ${periodLabel} ${isKpi ? 'KPIs' : 'reporting pack'}`
    : isKpi
      ? 'Request KPIs'
      : 'Request Reporting Pack';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[86vh] gap-0 overflow-hidden p-0',
          createdPublicId ? 'sm:max-w-2xl' : 'sm:max-w-5xl',
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* First request (or none pinned yet): pinning the sign-in gate is an
            explicit confirmation, not a side effect of sending. */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle className="font-medium text-lg">
              Confirm sign-in domain
            </DialogTitle>
            <div className="space-y-2">
              <Input
                placeholder="acme.com"
                value={domainInput}
                onChange={(e) => {
                  domainTouchedRef.current = true;
                  setDomainInput(e.target.value);
                }}
              />
              <p className="text-sm text-muted-foreground">
                Anyone with an email at this domain can use the share link to
                sign in and submit.
              </p>
              {confirmBlocked && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  With no recipients invited, a domain is required so someone
                  can open the request.
                </p>
              )}
              {domainChoice == null && !confirmBlocked && (
                <p className="text-sm text-muted-foreground">
                  Left empty, only invited recipients can use the link.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                onClick={() => void submitRequest(domainChoice)}
                disabled={submitting || confirmBlocked}
              >
                {submitting
                  ? 'Creating…'
                  : recipients.length
                    ? 'Confirm & send'
                    : 'Confirm & create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {createdPublicId ? (
          loadFailed ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">
                Could not load this request.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRetryKey((k) => k + 1)}
              >
                Try again
              </Button>
            </div>
          ) : recipientsLoaded ? (
            <RequestSummary
              canEdit={!!editRequest}
              isKpi={isKpi}
              periodLabel={periodLabel}
              kpiGroups={selectedKpiGroups}
              docNames={selectedDocNames}
              recipients={recipients}
              companyId={companyId}
              addingRecipient={addingRecipient}
              onAddRecipient={handleAddPersistedRecipient}
              shareLink={shareLinkFor(createdPublicId)}
              companyDomain={companyDomain}
              onEdit={enterEdit}
            />
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )
        ) : (
          <div className={cn('flex', isKpi ? 'h-[80vh]' : 'max-h-[86vh]')}>
            {/* Selection canvas */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-6 pb-4">
                <h2 className="font-medium text-xl">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  {isKpi
                    ? 'Choose the metrics and documents to collect.'
                    : 'Choose the documents to collect.'}
                </p>
              </div>

              {isKpi && (
                <div className="flex gap-4 border-b border-foreground/10 px-6">
                  {(
                    [
                      ['kpi', 'KPIs', kpiCount],
                      ['docs', 'Documents', docCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={cn(
                        'relative -mb-px flex items-center gap-2 border-b-2 px-1 pb-2.5 pt-1 font-sans-neue text-sm transition-colors',
                        activeTab === key
                          ? 'border-foreground text-foreground'
                          : 'border-transparent text-foreground/50 hover:text-foreground',
                      )}
                    >
                      {label}
                      {count > 0 && (
                        <Badge variant="secondary" className="tabular-nums">
                          {count}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showKpiPanel && (
                <div className="flex items-center gap-3 px-6 pb-5 pt-5">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search metrics…"
                      className="h-8 pl-9"
                    />
                  </div>
                  {selectableKpis.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setKpiSelected((prev) => {
                          const next = new Set(prev);
                          for (const f of selectableKpis) {
                            if (allKpiSelected) next.delete(f.id);
                            else next.add(f.id);
                          }
                          return next;
                        })
                      }
                      className="shrink-0 font-sans-neue text-xs text-foreground/50 hover:text-foreground"
                    >
                      {allKpiSelected ? 'Clear All' : 'Select All'}
                    </button>
                  )}
                </div>
              )}

              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto px-6 pb-6',
                  showDocsPanel && 'pt-5',
                )}
              >
                {showKpiPanel ? (
                  <div className="space-y-5">
                    {groupedKpis.map(([category, fields]) => {
                      const selectedInCat = fields.filter((f) =>
                        kpiSelected.has(f.id),
                      ).length;
                      const allOn = selectedInCat === fields.length;
                      return (
                        <div key={category}>
                          <div className="mb-1.5 flex items-center justify-between border-b border-foreground/10 pb-1">
                            <span className="font-sans-neue text-[0.65rem] uppercase tracking-wider text-foreground/60">
                              {category}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCategory(fields, !allOn)}
                              className="font-sans-neue text-xs text-foreground/50 hover:text-foreground"
                            >
                              {allOn ? 'Clear' : 'Select All'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4">
                            {fields.map((field) => {
                              const checked = kpiSelected.has(field.id);
                              return (
                                <label
                                  key={field.id}
                                  className={cn(
                                    'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-sans-neue text-sm hover:bg-hover',
                                    checked && 'text-foreground',
                                    !checked && 'text-foreground/80',
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      setKpiSelected((s) => toggle(s, field.id))
                                    }
                                  />
                                  <span className="truncate">
                                    {field.label}
                                  </span>
                                  {field.isCustom && (
                                    <Badge
                                      variant="secondary"
                                      size="xs"
                                      className="font-normal shrink-0"
                                    >
                                      Custom
                                    </Badge>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {groupedKpis.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No metrics match &ldquo;{search}&rdquo;.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between border-b border-foreground/10 pb-1">
                        <p className="font-sans-neue text-[0.65rem] uppercase tracking-wider text-foreground/60">
                          Standard documents
                        </p>
                        {standardDocTypes.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDocTypeSelected(
                                allDocsSelected
                                  ? new Set()
                                  : new Set(
                                      standardDocTypes.map((dt) => dt.id),
                                    ),
                              )
                            }
                            className="font-sans-neue text-xs text-foreground/50 hover:text-foreground"
                          >
                            {allDocsSelected ? 'Clear All' : 'Select All'}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4">
                        {standardDocTypes.map((dt) => {
                          const checked = docTypeSelected.has(dt.id);
                          return (
                            <label
                              key={dt.id}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-hover',
                                !checked && 'text-foreground/80',
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  setDocTypeSelected((s) => toggle(s, dt.id))
                                }
                              />
                              {dt.displayName}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 border-b border-foreground/10 pb-1 font-sans-neue text-[0.65rem] uppercase tracking-wider text-foreground/60">
                        Other documents
                      </p>
                      <div className="space-y-2">
                        {customLabels.map((label, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              placeholder="e.g. Customer cohort analysis"
                              className="h-8"
                              value={label}
                              onChange={(e) =>
                                setCustomLabels((labels) =>
                                  labels.map((l, idx) =>
                                    idx === i ? e.target.value : l,
                                  ),
                                )
                              }
                            />
                            {customLabels.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remove document"
                                onClick={() =>
                                  setCustomLabels((labels) =>
                                    labels.filter((_, idx) => idx !== i),
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => setCustomLabels((l) => [...l, ''])}
                        >
                          <Plus className="h-4 w-4" />
                          Add document
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Settings rail */}
            <aside className="flex w-80 shrink-0 flex-col border-l bg-muted/20">
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {!editRequest && (
                  <div className="space-y-2">
                    <Label className="font-medium text-sm">Period</Label>
                    <div className="flex items-center rounded-md border p-0.5">
                      {(['quarterly', 'annual'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCadence(c)}
                          className={cn(
                            'flex-1 rounded py-1 font-sans-neue text-xs transition-colors',
                            cadence === c
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {c === 'quarterly' ? 'Quarterly' : 'Annual'}
                        </button>
                      ))}
                    </div>
                    <div
                      className={cn(
                        'grid gap-2',
                        cadence === 'quarterly' ? 'grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {cadence === 'quarterly' && (
                        <Select
                          value={String(quarter)}
                          onValueChange={(v) => setQuarter(Number(v))}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map((q) => (
                              <SelectItem
                                key={q}
                                value={String(q)}
                                disabled={takenPeriods.has(`${year}-${q}`)}
                              >
                                Q{q}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Select
                        value={String(year)}
                        onValueChange={(v) => setYear(Number(v))}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem
                              key={y}
                              value={String(y)}
                              disabled={
                                cadence === 'annual' &&
                                takenPeriods.has(`${y}-FY`)
                              }
                            >
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {hasExistingRequest && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        A request was already sent for this period.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <RecipientCombobox
                    companyId={companyId}
                    excludeEmails={recipients}
                    onSelect={addRecipient}
                    label="Recipients (Optional)"
                  />
                  {recipients.length > 0 && (
                    <div className="divide-y">
                      {recipients.map((r) => {
                        const locked = lockedRecipients.has(r.toLowerCase());
                        return (
                          <div key={r} className="flex items-center gap-2 py-2">
                            <UserAvatar email={r} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {r}
                            </span>
                            {!locked && (
                              <button
                                type="button"
                                aria-label={`Remove ${r}`}
                                onClick={() =>
                                  setRecipients((list) =>
                                    list.filter((e) => e !== r),
                                  )
                                }
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-sm">Message</Label>
                  <Textarea
                    rows={3}
                    placeholder="Add a note for the recipient…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-foreground/10 p-6">
                <div className="flex gap-2">
                  {editRequest && (
                    <Button
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={
                      submitting ||
                      !canSubmit ||
                      (!editRequest && hasExistingRequest)
                    }
                  >
                    {submitting
                      ? editRequest
                        ? 'Saving…'
                        : 'Creating…'
                      : editRequest
                        ? 'Save'
                        : recipients.length
                          ? 'Send request'
                          : 'Create request'}
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
