export interface SystemFolderConfig {
  slug: string;
  label: string;
  typeId: number;
  typeIds?: readonly number[];
  href: string;
  defaultSearchParams?: Record<string, string>;
  reportType?: string;
  icon?: string; // lucide-react icon name
  columns?: (string | { id: string; header: string })[];
  filters?: string[];
}

// Default columns used if not specified in config
export const DEFAULT_COLUMNS = [
  'expander',
  'vendor',
  'orderNumber',
  'product',
  'type',
  'renewalType',
  'termStartDate',
  'cancelByDate',
  'termEndDate',
  'currentBudget',
  'projectedBudget',
  'totalContractValue',
  'tags',
  'businessSponsor',
  'businessGroup',
];

export const ALL_FILTERS = ['renewalType', 'tags'];

export const SYSTEM_TYPE_FOLDERS: SystemFolderConfig[] = [
  {
    slug: 'trials',
    label: 'Trials',
    typeId: 7,
    href: '/contracts/trials',
    icon: 'layers',
    columns: [
      'select',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'daysRemaining',
      'termEndDate',
      'tags',
      'businessSponsor',
      'businessGroup',
    ],
    filters: ['tags', 'renewalType', 'businessSponsor', 'businessGroup'],
  },
  {
    slug: 'ndas',
    label: 'NDAs',
    typeId: 8,
    href: '/contracts/ndas',
    icon: 'layers',
    columns: [
      'select',
      'vendor',
      'orderNumber',
      'product',
      'type',
      'termStartDate',
      'termEndDate',
      'tags',
      'businessSponsor',
      'businessGroup',
    ],
    filters: ['tags', 'renewalType', 'businessSponsor', 'businessGroup'],
  },
];

export function getSystemFolderConfig(
  slug: string,
): SystemFolderConfig | undefined {
  return SYSTEM_TYPE_FOLDERS.find((folder) => folder.slug === slug);
}

export function getSystemFolderByTypeId(
  typeId: number,
): SystemFolderConfig | undefined {
  return SYSTEM_TYPE_FOLDERS.find((folder) =>
    folderTypeIds(folder).includes(typeId),
  );
}

/** Every contract type a system folder lists. */
export function folderTypeIds(folder: SystemFolderConfig): readonly number[] {
  return folder.typeIds ?? [folder.typeId];
}
