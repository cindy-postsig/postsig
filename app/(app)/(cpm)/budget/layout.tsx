import BudgetTabs from '@/components/budget/BudgetTabs';

export default function BudgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <BudgetTabs />
      {children}
    </div>
  );
}
