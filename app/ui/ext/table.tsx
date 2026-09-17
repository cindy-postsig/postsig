import { UpdateContract, ViewContract } from '@/app/ui/contracts/buttons';
import { fetchContracts } from '@/app/lib/contracts/actions';
import { formatDateToDateTime } from '@/app/lib/utils';

export default async function VendorsTable({
  query,
  currentPage,
  status,
}: {
  query: string;
  currentPage: number;
  status: number | undefined;
}) {
  const contracts = await fetchContracts({
    query,
    currentPage,
    contractFields: [],
    contractStatus: status,
  });

  return (
    <div className="mt-6 flow-root">
      <div className="inline-block min-w-full align-middle">
        <div className="md:pt-0">
          <div className="md:hidden">
            {contracts?.map(
              ({ id, vendors }: { id: any; vendors: any; updated_at: any }) => (
                <div key={id} className="mb-2 w-full bg-white p-4">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <div className="font-gtp mb-2 flex items-center">
                        {vendors ? vendors.name : 'Pending Review'}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between pt-4">
                    <div>
                      <p className="font-medium text-xl"></p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <ViewContract id={id} path="/ext/contracts" />
                      <UpdateContract id={id} path="/ext/contracts" />
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
          <table className="hidden min-w-full text-gray-900 md:table">
            <thead className="font-normal text-left text-sm">
              <tr>
                <th scope="col" className="font-medium px-4 py-4 sm:pl-6">
                  Vendor
                </th>
                <th scope="col" className="font-medium px-3 py-4">
                  Status
                </th>
                <th scope="col" className="font-medium px-3 py-4">
                  User
                </th>
                <th scope="col" className="font-medium px-3 py-4">
                  Organization
                </th>
                <th scope="col" className="font-medium px-3 py-4">
                  Last Update
                </th>
                <th scope="col" className="relative py-4 pl-6 pr-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts?.map(
                ({
                  id,
                  contract_statuses,
                  vendors,
                  updated_at,
                  users,
                }: {
                  id: any;
                  contract_statuses: any;
                  vendors: any;
                  updated_at: any;
                  users: any;
                }) => (
                  <tr
                    key={id}
                    className="w-full border-b py-4 text-sm shadow-sm last-of-type:border-none"
                  >
                    <td className="whitespace-nowrap rounded-bl-md rounded-tl-md bg-white py-4 pl-6 pr-3">
                      <div className="font-gtp flex items-center gap-3 text-lg">
                        {vendors ? vendors.name : 'Pending Review'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap bg-white px-3 py-4">
                      <div
                        className={`${
                          contract_statuses.name
                            ? contract_statuses.id === 4
                              ? 'bg-[#79E884]'
                              : contract_statuses.id === 3
                                ? 'bg-yellow'
                                : 'bg-gray-700 bg-opacity-15'
                            : ''
                        } inline-block rounded px-3 py-1`}
                      >
                        {contract_statuses.name
                          ? contract_statuses.name
                          : 'Unknown Status'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap bg-white px-3 py-4">
                      {users && users.name ? users.name : users?.id}
                    </td>
                    <td className="whitespace-nowrap bg-white px-3 py-4">
                      {users && users.organization ? users.organization : 'N/A'}
                    </td>
                    <td className="whitespace-nowrap bg-white px-3 py-4">
                      {formatDateToDateTime(updated_at) || 'N/A'}
                    </td>
                    <td className="whitespace-nowrap rounded-br-md rounded-tr-md bg-white py-4 pl-6 pr-3">
                      <div className="flex justify-end gap-3">
                        <ViewContract path="/contracts" id={id} />
                        <UpdateContract path="/ext/contracts" id={id} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
