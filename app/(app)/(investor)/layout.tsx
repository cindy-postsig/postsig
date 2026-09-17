export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="investor-theme min-h-[calc(100vh-3.5rem)] bg-background text-foreground">
      {children}
    </div>
  );
}
