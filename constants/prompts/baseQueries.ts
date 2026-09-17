import productsListQuery from './productsListQuery';

export const baseQueries = [
  {
    dbName: 'contract_type',
    query: `Please return only one option out of the following as the answer for the type of contract.
  
      Answer should only be the abbreviation before the : symbol. For example the answer could be SO.
  
      Following is the list of options:
  
      - **MSA**: Master Service Agreement
      - **SO**: Service order
      - **Addendum**: Addendum or Addition to an existing contract
      - **TOS**: Terms of Service
      - **Invoice**: Invoice
      - **Trial Agreement**: Trial Agreement
      - **NDA**: Non disclosure agreement
      - **OA**: Operational Agreement
      - **EASO**: Exchange Agreement Service Order. A Service Order issued under a market data
        Exchange Agreement. Distinguished from a plain SO by product lines grouped under market
        headings such as "Euronext Milan" or "Euronext/Oslo Børs", each naming an exchange
        product code in trailing parentheses, for example
        "Euronext Milan AFF Level 2 - Non-Display Other Use - Restricted Basic (MAFFL2-OUNDRU)".
      - **EAINV**: Exchange Agreement Invoice. An Invoice issued under such an agreement.
        It bills a specific period and carries invoice apparatus: an invoice number and date,
        a payment due date or payment terms, quantities against unit prices, and a total
        amount payable. Choose this only on that billing evidence.
      - **EAFeeSchedule**: Exchange Agreement Product Fee Schedule. The exchange's published
        tariff, effective from a stated date. It lists unit prices for the full product
        catalogue rather than billing a customer, so it has no invoice number, no amount
        payable and no customer account being charged.

      EAINV and EAFeeSchedule both write their lines as an exchange product code followed by an
      "ENX" marker, for example "DEQL2-BANDRU ENX Dublin Equities L2-NonDisplay Broking/Agents
      Basic". That shared formatting does not distinguish them: decide between the two on
      whether the document bills a customer for a period (EAINV) or publishes a tariff
      (EAFeeSchedule).

      If the contract type is not in the above list, please return the type you determine.
         `,
  },
  {
    dbName: 'vendor_name',
    query: `Please return the name of the vendor providing a service or product in this contract.
  
      Return only the name of the vendor. It should be a single word or couple of words but not a sentence.`,
  },
  {
    dbName: 'vendor_location',
    query:
      'Where is the data vendor located? Please return the address of the vendor.',
  },
  {
    dbName: 'contract_summary',
    query:
      'Brief summary of the document.  Make it professional, succinct & in a business tone.',
  },
  productsListQuery,
];
