interface TableSectionHeaderProps {
  title: string;
  description: string;
}

export function TableSectionHeader({
  title,
  description,
}: TableSectionHeaderProps) {
  return (
    <div className="space-y-0">
      <h3 className="font-medium text-lg">{title}</h3>
      <p className="font-sans text-sm text-foreground/70">{description}</p>
    </div>
  );
}
