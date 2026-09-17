const productsListQuery = {
  dbName: 'products_list',
  query: `List the products being discussed in this contract as well as their associated costs. 
    Also look for the total number of users or licences allocated for each product. 
    Remove any currency symbols, abbreviations and thousands separators from the cost. 
    Keep the decimal part exactly as written, so "€2,681.80" becomes "2681.80": these
    fees are compared against the invoiced amount to the cent, so never turn a decimal
    cost into a whole number. Always use a period as the decimal separator, so a
    comma-decimal amount such as "€2.681,80" also becomes "2681.80".
    Derive the year from start/end date of the contract or product specific dates.

    Return one entry per billing line exactly as the document lists it. When the same
    product appears on more than one line — a separate account, period or rate — return
    each line separately. Never merge or sum lines that repeat the same product.

    Where the document is a line-itemised invoice, also capture the following for each
    line. Every one of these is optional: return null when the document does not state it,
    and never infer or calculate a value that is not printed.
    - account_number: the account the line is billed against, often a "Related Acct" column.
    - quantity: the number of units billed on the line, as a number.
    - change_activity: any change noted against the line, such as added, removed or amended.
    - rate: the per-unit rate for the line, as a number. This is not the line total.
    - period_start and period_end: the billing period the line covers, as YYYY-MM-DD.

    Return as an array in this format: [{"year": "year", "product_name": "product_name", "cost": "cost", "n_users": "n_users", "account_number": "account_number", "quantity": "quantity", "change_activity": "change_activity", "rate": "rate", "period_start": "period_start", "period_end": "period_end"}]
    Example: [{"year": "1", "product_name": "Product A", "cost": "1000.50", "n_users": "10", "account_number": "30041555", "quantity": "2", "change_activity": null, "rate": "500.25", "period_start": "2026-01-01", "period_end": "2026-01-31"}, {"year": "1", "product_name": "Product A", "cost": "2000", "n_users": null, "account_number": "30041556", "quantity": "4", "change_activity": "Added", "rate": "500", "period_start": "2026-01-01", "period_end": "2026-01-31"}]`,
};
export default productsListQuery;
