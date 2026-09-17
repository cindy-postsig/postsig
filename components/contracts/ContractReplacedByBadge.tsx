import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface ContractReplacedByBadgeProps {
  newContractId: number;
  /** Order number of the replacing contract, or a fallback label. */
  newContractNumber: string;
}

export default function ContractReplacedByBadge({
  newContractId,
  newContractNumber,
}: ContractReplacedByBadgeProps) {
  return (
    <Link href={`/contracts/${newContractId}`} className="hover:underline">
      <Badge variant="secondary">Replaced by {newContractNumber}</Badge>
    </Link>
  );
}
