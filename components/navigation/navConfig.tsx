import type { AppMode } from '@/contexts/ModeContext';
import {
  Building2,
  TrendingUp,
  FileWarning,
  Landmark,
  Network,
} from 'lucide-react';

export interface NavItem {
  key: string;
  href: string;
  tooltip: string;
  icon: React.ReactElement;
}

const DashboardIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 0L18 8.89168V18H10.5882V12.7059H7.41177V18H0V8.89168L9 0ZM1.05882 9.32498V16.9539H6.35294V11.6471H11.6471V16.9539H16.9412V9.32498L9 1.47938L1.05882 9.32498Z"
      fill="currentColor"
    />
  </svg>
);

const ContractsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="17"
    viewBox="0 0 16 17"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1 1H15V16H1V1ZM0 17V0H16V17H0ZM3 5H13V4H3V5ZM13 9H3V8H13V9ZM3 13H10V12H3V13Z"
      fill="currentColor"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5 0V1H13V0H14V1H18V18H0V1H4V0H5ZM13 2V3H14V2H17V5H1V2H4V3H5V2H13ZM1 6V17H17V6H1ZM4 9H5V10H4V9ZM8 9H7V10H8V9ZM10 9H11V10H10V9ZM14 9H13V10H14V9ZM4 13H5V14H4V13ZM8 13H7V14H8V13ZM10 13H11V14H10V13ZM14 13H13V14H14V13Z"
      fill="currentColor"
    />
  </svg>
);

const SpendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="18"
    viewBox="0 0 19 18"
    fill="none"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18.5 2.5H10V0H9V2.5H0.5V9.5H17.5V14.5H1.5V13H0.5V15.5H9V18H10V15.5H18.5V8.5H1.5V3.5H17.5V5H18.5V2.5Z"
      fill="currentColor"
    />
  </svg>
);

const ReportsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="17"
    height="17"
    viewBox="0 0 17 17"
    fill="none"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 0L12 17H13L13 0H12ZM0 17V6H1L1 17H0ZM4 17L4 8H5L5 17H4ZM8 17L8 3H9L9 17H8ZM16 5L16 17H17V5H16Z"
      fill="currentColor"
    />
  </svg>
);

const InvoicesIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="11 10.5 18 18"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M28 11V28H12V11H28ZM13 27H27V12H13V27Z"
      fill="currentColor"
    />
    <path
      d="M20.5 16H24V17.5H23V17H17V19H24V23H20.5V24.5H19.5V23H16V21.5H17V22H23V20H16V16H19.5V14.5H20.5V16Z"
      fill="currentColor"
    />
  </svg>
);

const AssignmentsIcon = () => (
  <Network className="h-[18px] w-[18px]" strokeWidth={1.5} />
);

const InventoryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="20"
    viewBox="0 0 19 20"
    fill="none"
  >
    <path
      d="M18.333 4.23047V14.8711L9.16699 19.1016L8.97266 19.0117C8.97092 19.011 8.9695 19.0095 8.96777 19.0088L0 14.8711V4.23047L9.16699 0L18.333 4.23047ZM1 14.2305L8.66699 17.7686V8.87598L1 5.50293V14.2305ZM9.66699 8.87598V17.7676L17.333 14.2305V5.50293L9.66699 8.87598ZM1.50879 4.63477L9.16602 8.00391L16.8223 4.63379L9.16602 1.10156L1.50879 4.63477Z"
      fill="currentColor"
    />
  </svg>
);

const PortfolioIcon = () => <ReportsIcon />;

const VentureDocumentsIcon = () => <ContractsIcon />;

const VendorsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M0 4H18V17H0V4ZM1 5V16H17V5H1ZM6 1H12V4H11V2H7V4H6V1ZM1 9H7V10H1V9ZM11 9H17V10H11V9ZM7 8H11V11H7V8ZM8 9V10H10V9H8Z"
      fill="currentColor"
    />
  </svg>
);

const CompaniesIcon = () => (
  <Building2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
);

const PerformanceIcon = () => (
  <TrendingUp className="h-[18px] w-[18px]" strokeWidth={1.5} />
);

export const contractsNavItems: NavItem[] = [
  {
    key: 'dashboard',
    href: '/dashboard',
    tooltip: 'Dashboard',
    icon: <DashboardIcon />,
  },
  {
    key: 'vendors',
    href: '/vendors',
    tooltip: 'Vendors',
    icon: <VendorsIcon />,
  },
  {
    key: 'contracts',
    href: '/contracts',
    tooltip: 'Contracts',
    icon: <ContractsIcon />,
  },
  {
    key: 'invoices',
    href: '/invoices',
    tooltip: 'Invoices',
    icon: <InvoicesIcon />,
  },
  {
    key: 'calendar',
    href: '/calendar',
    tooltip: 'Calendar',
    icon: <CalendarIcon />,
  },
  {
    key: 'spend',
    href: '/budget',
    tooltip: 'Spend',
    icon: <SpendIcon />,
  },
  {
    key: 'reports',
    href: '/reports',
    tooltip: 'Reports',
    icon: <ReportsIcon />,
  },
  {
    key: 'inventory',
    href: '/inventory',
    tooltip: 'Inventory',
    icon: <InventoryIcon />,
  },
  {
    key: 'exchange-agreements',
    href: '/exchange-agreements',
    tooltip: 'Exchange Agreements',
    icon: <Landmark className="h-[18px] w-[18px]" strokeWidth={1.5} />,
  },
  {
    key: 'assignments',
    href: '/assignments',
    tooltip: 'Assignments',
    icon: <AssignmentsIcon />,
  },
];

export const ventureNavItems: NavItem[] = [
  {
    key: 'investor-dashboard',
    href: '/investor',
    tooltip: 'Dashboard',
    icon: <DashboardIcon />,
  },
  {
    key: 'portfolio',
    href: '/investor/portfolio',
    tooltip: 'Portfolio',
    icon: <PortfolioIcon />,
  },
  {
    key: 'documents',
    href: '/investor/documents',
    tooltip: 'Documents',
    icon: <VentureDocumentsIcon />,
  },
  {
    key: 'missing-documents',
    href: '/investor/missing-documents',
    tooltip: 'Missing Documents',
    icon: <FileWarning className="h-[18px] w-[18px]" strokeWidth={1.5} />,
  },
];

export function getNavItemsForMode(
  mode: AppMode,
  isInvestorTrial: boolean = false,
  hidePortfolio: boolean = false,
  assignmentsEnabled: boolean = false,
  invoicesEnabled: boolean = false,
  exchangeAgreementsEnabled: boolean = false,
): NavItem[] {
  switch (mode) {
    case 'venture':
      if (isInvestorTrial) {
        return ventureNavItems.filter(
          (item) =>
            !['investor-dashboard', 'portfolio', 'missing-documents'].includes(
              item.key,
            ),
        );
      }
      return ventureNavItems.filter(
        (item) =>
          !(
            hidePortfolio &&
            (item.key === 'portfolio' || item.key === 'investor-dashboard')
          ),
      );
    case 'contracts':
    default:
      // Assignments rolls out on its own flag: it prices from cost
      // allocations, but an org running those is not thereby ready for it.
      return contractsNavItems.filter((item) => {
        if (item.key === 'invoices') return invoicesEnabled;
        if (item.key === 'assignments') return assignmentsEnabled;
        if (item.key === 'exchange-agreements')
          return exchangeAgreementsEnabled;
        return true;
      });
  }
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) {
    return true;
  }

  // Special handling for sub-routes
  switch (item.key) {
    case 'reports':
      return pathname.startsWith('/reports/');
    case 'assignments':
      return (
        pathname === '/assignments' || pathname.startsWith('/assignments/')
      );
    case 'contracts':
      return (
        pathname.startsWith('/contracts') &&
        !pathname.match(/^\/contracts\/\d+/)
      );
    case 'invoices':
      return pathname.startsWith('/invoices');
    case 'vendors':
      return pathname === '/vendors' || pathname.startsWith('/vendors/');
    case 'investor-dashboard':
      return pathname === '/investor';
    case 'portfolio':
      return (
        pathname.startsWith('/investor/portfolio') ||
        pathname.startsWith('/investor/company')
      );
    case 'documents':
      return pathname.startsWith('/investor/documents');
    case 'missing-documents':
      return pathname.startsWith('/investor/missing-documents');
    case 'exchange-agreements':
      return pathname.startsWith('/exchange-agreements');
    default:
      return false;
  }
}
