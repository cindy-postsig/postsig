'use client';

import { useRouter } from 'next/navigation';

interface Contract {
  id: number;
  name: string;
}

const tabs = [
  { id: 'current', label: 'CURRENT CONTRACT' },
  { id: 'summary', label: 'SUMMARY' },
];

export default function ContractTabs({
  currentContract,
  otherContracts,
  selectedContractId,
}: {
  currentContract: string;
  otherContracts: any;
  selectedContractId: string;
}) {
  const router = useRouter();

  const handleTabClick = (contractId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('selectedContractId', contractId);
    router.push(url.toString());
  };

  return (
    <div className="flex font-label text-sm">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`font-bold flex h-10 cursor-pointer items-center border-r border-r-black border-opacity-20 px-4 ${
            selectedContractId ===
            (tab.id === 'current' ? currentContract.toString() : tab.id)
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200'
          }`}
          onClick={() =>
            handleTabClick(
              tab.id === 'current' ? currentContract.toString() : tab.id,
            )
          }
        >
          {tab.label}
        </div>
      ))}
      {otherContracts.map((contract: Contract) => (
        <div
          key={contract.id}
          className={`flex h-10 cursor-pointer items-center border-r border-r-black border-opacity-20 px-4 ${
            selectedContractId === contract.id.toString()
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200'
          }`}
          onClick={() => handleTabClick(contract.id.toString())}
        >
          {`Other Vendor Document ${otherContracts.indexOf(contract) + 1}`}
        </div>
      ))}
    </div>
  );
}
