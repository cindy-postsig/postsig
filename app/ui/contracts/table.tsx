import {
  UpdateContract,
  DeleteContract,
  ViewContract,
} from '@/app/ui/contracts/buttons';
import Link from 'next/link';
import { fetchContracts } from '@/app/lib/contracts/actions';

export default async function VendorsTable({
  query,
  currentPage,
}: {
  query: string;
  currentPage: number;
}) {
  const contracts = await fetchContracts({ query, currentPage });

  return (
    <div className="mt-6 flow-root">
      <div className="inline-block min-w-full align-middle">
        <div className="md:pt-0">
          <table className="hidden min-w-full text-gray-900 md:table">
            <thead className="font-normal text-left text-sm">
              <tr>
                <th
                  scope="col"
                  className="font-medium w-1/5 px-4 py-4 capitalize sm:pl-6"
                >
                  VENDOR
                </th>
                <th
                  scope="col"
                  className="font-medium w-1/5 px-3 py-4 font-label"
                >
                  PRODUCT
                </th>
                <th scope="col" className="font-medium w-1/5 px-3 py-4"></th>
                <th scope="col" className="font-medium w-1/5 px-3 py-4">
                  CANCEL BY DATE
                </th>
                <th scope="col" className="font-medium w-1/5 px-3 py-4">
                  END DATE
                </th>
                <th scope="col" className="font-medium w-1/5 px-3 py-4">
                  ANNUAL COST
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts?.map(
                ({
                  id,
                  vendors,
                  term_end_date,
                }: {
                  id: any;
                  vendors: any;
                  term_end_date: any;
                }) => (
                  <tr
                    key={id}
                    className="w-full border-b py-4 text-sm shadow-sm last-of-type:border-none"
                  >
                    <td className="w-1/12 whitespace-nowrap rounded-bl-md rounded-tl-md bg-white py-4 pl-6 pr-3">
                      <div className="font-gtp flex items-center gap-3 text-xl">
                        <Link href={`/contracts/${id}`}>
                          {vendors ? vendors.name : 'Pending Review'}
                        </Link>
                      </div>
                    </td>
                    <td className="w-2/12 whitespace-nowrap bg-white px-3 py-4">
                      {term_end_date || 'N/A'}
                    </td>
                    <td className="w-4/12 whitespace-nowrap bg-white px-3 py-4"></td>
                    <td className="w-2/12 whitespace-nowrap bg-white px-3 py-4">
                      b
                    </td>
                    <td className="w-3/12 whitespace-nowrap bg-white px-10 py-4">
                      b
                    </td>
                    <td className="w-3/12 whitespace-nowrap rounded-br-md rounded-tr-md bg-white px-10 py-4">
                      <div className="flex justify-end gap-3">
                        {/* <ViewContract id={id} path="/contracts" /> */}
                        {/* <UpdateContract id={id} path="/contracts" /> */}b
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
