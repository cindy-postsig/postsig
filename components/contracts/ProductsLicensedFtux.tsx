import React from 'react';
import { getYear } from 'date-fns';
import { formatCurrency } from '@/app/lib/utils';
import CardContainer from '@/components/CardContainer';

type ProductsLicensedProps = {
  data: any;
};

function chunkDateToYears(termEndDate: any, termStartDate: any) {
  const years = [];
  const currentYear = getYear(new Date());
  const startYear = getYear(termStartDate);
  const endYear = getYear(termEndDate);
  for (let i = startYear; i <= endYear; i++) {
    years.push({ year: i, current: i === currentYear });
  }
  return years;
}

export default function ProductsLicensed({ data }: ProductsLicensedProps) {
  if (data?.vendor_products_details?.length === 0) {
    return <></>;
  }

  const hasProducts = data?.vendor_products_details;
  const currency = data?.currency;

  return (
    <div>
      {!hasProducts && data?.products_fees?.[0].summary?.products_list && (
        <div className="leading-relaxed antialiased">
          {data?.products_fees?.[0].summary?.products_list}
        </div>
      )}
      {hasProducts && (
        <div className="mb-4 mt-4">
          <div className="mt-4">
            {data.vendor_products_details.map((product: any, index: any) => {
              return (
                <div
                  key={index}
                  className="mt-2 flex justify-between border-b border-dotted pb-2 leading-loose"
                >
                  <div className="text-sm">{product.vendor_products.name}</div>
                  <div className="font-label text-sm">
                    {formatCurrency(product.fees, currency)}
                  </div>
                </div>
              );
            })}
            {data.products_fees && (
              <div className="mt-4 flex justify-end">
                <div className="font-label text-base">
                  <span className="mr-2 inline-block text-xs uppercase tracking-wide">
                    Total{' '}
                  </span>
                  {formatCurrency(
                    data.vendor_products_details.reduce(
                      (acc: any, cur: any) => acc + parseInt(cur.fees),
                      0,
                    ),
                    currency,
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
