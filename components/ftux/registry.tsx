import ContractLineageFtuxDialog from './ContractLineageFtuxDialog';

export interface FtuxDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export type FtuxComponent = React.ComponentType<FtuxDialogProps>;

export const FTUX_COMPONENTS: Record<string, FtuxComponent> = {
  contract_lineage: ContractLineageFtuxDialog,
  // Add more FTUX components here as needed
  // dashboard_overview: DashboardOverviewFtuxDialog,
  // budget_allocation: BudgetAllocationFtuxDialog,
};

export type FtuxKey = keyof typeof FTUX_COMPONENTS;

export function getFtuxComponent(key: string): FtuxComponent | null {
  return FTUX_COMPONENTS[key] || null;
}
