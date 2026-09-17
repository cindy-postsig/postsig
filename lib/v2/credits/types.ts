export interface RawContractCreditRow {
  id: number;
  product_id: number;
  year: number;
  amount: number | string;
  sort_order: number | null;
  vendor_products: {
    id: number;
    name: string | null;
    product_code?: string | null;
  } | null;
}

export interface ContractCredit {
  id: number;
  productId: number;
  year: number;
  amount: number;
  name: string;
  productCode: string | null;
}
