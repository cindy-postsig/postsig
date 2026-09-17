import {
  SID_FILE_HEADERS,
  SidParseError,
  parseAccounts,
  parseChanges,
  parseExchangeFees,
  parseMaterialCharges,
  parseResearchPurchases,
  parseSidFileSet,
  parseSubscriptions,
  readSidRecords,
} from '@/lib/v2/bloomberg-sid/parse';
import type { SidFileIndex } from '@/lib/v2/bloomberg-sid/types';

const header = (index: SidFileIndex, delimiter = ',') =>
  SID_FILE_HEADERS[index].map((h) => `"${h}"`).join(delimiter);

const csv = (index: SidFileIndex, lines: string[], delimiter = ',') =>
  Buffer.from(
    [header(index, delimiter), ...lines].join('\r\n') + '\r\n',
    'latin1',
  );

const ACCOUNT_ROWS = [
  '715298,"JOH BERENBERG GOSSLER & CO KG",28929,"ZURICH","ZH","CH","D",8.1000,2,2,03/01/26',
  '30041555,"JOH BERENBERG GOSSLER & CO KG",28929,"LONDON","","GB","D",20.0000,2,2,03/01/26',
];

describe('readSidRecords', () => {
  it('strips NUL padding, verifies the header and drops blank rows', () => {
    const padded = Buffer.concat([csv(0, ACCOUNT_ROWS), Buffer.alloc(64, 0)]);
    const rows = readSidRecords(padded, 0);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('715298');
  });

  it('sniffs a semicolon delimiter', () => {
    const rows = readSidRecords(
      csv(
        2,
        [
          '715298;1856014;6;02.03.2009;02.03.2027;user 830;1;Subscription;28;Bloomberg Anywhere;7660589;?;;;2360;?;?;',
        ],
        ';',
      ),
      2,
    );
    expect(rows[0]).toHaveLength(18);
    expect(rows[0][3]).toBe('02.03.2009');
  });

  it('rejects a file whose header is not the expected one', () => {
    expect(() => readSidRecords(csv(0, ACCOUNT_ROWS), 2)).toThrow(
      SidParseError,
    );
  });

  it('strips a UTF-8 BOM before the header', () => {
    const withBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      csv(0, ACCOUNT_ROWS),
    ]);
    const rows = readSidRecords(withBom, 0);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('715298');
  });
});

describe('parseAccounts', () => {
  it('reads the billing date from the unnamed last column and nulls blank state', () => {
    const { billingDate, accounts } = parseAccounts(
      readSidRecords(csv(0, ACCOUNT_ROWS), 0),
    );
    expect(billingDate).toBe('2026-03-01');
    expect(accounts[0]).toEqual({
      cust_num: 715298,
      name: 'JOH BERENBERG GOSSLER & CO KG',
      firmwide_id: 28929,
      city: 'ZURICH',
      state: 'ZH',
      country: 'CH',
      currency_code: 'D',
      tax_rate: 8.1,
      auto: 2,
      term: 2,
    });
    expect(accounts[1].state).toBeNull();
  });

  it('rejects rows that disagree on the billing date', () => {
    const rows = [
      ACCOUNT_ROWS[0],
      ACCOUNT_ROWS[1].replace('03/01/26', '04/01/26'),
    ];
    expect(() => parseAccounts(readSidRecords(csv(0, rows), 0))).toThrow(
      /one billing date/,
    );
  });
});

describe('parseSubscriptions', () => {
  const SEMI_ROW =
    '715298;1856014;6;02.03.2009;02.03.2027;user 830;1;Subscription;28;Bloomberg Anywhere;7660589;?;;;<price>;?;?;';

  const priceOf = (price: string): number => {
    const [row] = parseSubscriptions(
      readSidRecords(csv(2, [SEMI_ROW.replace('<price>', price)], ';'), 2),
    );
    return row.price;
  };

  it('handles DD.MM.YYYY dates, ? as null and * as a flag', () => {
    const [row] = parseSubscriptions(
      readSidRecords(
        csv(
          2,
          [
            '30041555;13398963;1;29.04.2024;29.04.2026;user 12_ldn;5;Limited Functionality;83;Limited Function - BB Anywhere;30980672;0;*;Free;0;?;?;N/A',
          ],
          ';',
        ),
        2,
      ),
    );
    expect(row).toMatchObject({
      cust_num: 30041555,
      sid: 13398963,
      sid_inst_num: 1,
      contract_date: '2024-04-29',
      renewal_date: '2026-04-29',
      ws: 0,
      ninety_day: true,
      special: 'Free',
      price: 0,
      dual_inst_num: null,
      dual_cust_num: null,
      po_number: 'N/A',
    });
  });

  it('accepts the MM/DD/YY variant of the same file', () => {
    const [row] = parseSubscriptions(
      readSidRecords(
        csv(2, [
          '715298,1856014,6,03/02/09,03/02/27,"user 830_zrh",1,"Subscription",28,"Bloomberg Anywhere",7660589,?,,,2360,?,?,',
        ]),
        2,
      ),
    );
    expect(row.contract_date).toBe('2009-03-02');
    expect(row.ws).toBeNull();
    expect(row.ninety_day).toBe(false);
    expect(row.special).toBeNull();
    expect(row.po_number).toBeNull();
  });

  it('pivots a two-digit year at 50', () => {
    const [row] = parseSubscriptions(
      readSidRecords(
        csv(2, [
          '715298,1856014,6,03/02/99,03/01/26,"user 830_zrh",1,"Subscription",28,"Bloomberg Anywhere",7660589,?,,,2360,?,?,',
        ]),
        2,
      ),
    );
    expect(row.contract_date).toBe('1999-03-02');
    expect(row.renewal_date).toBe('2026-03-01');
  });

  it('rejects a comma used as a decimal separator', () => {
    expect(() => priceOf('2360,50')).toThrow(SidParseError);
    expect(() => priceOf('2360,50')).toThrow(/"2360,50"/);
  });

  it('reads a grouped price and the bare forms', () => {
    expect(priceOf('1,234.50')).toBe(1234.5);
    expect(priceOf('2360')).toBe(2360);
    expect(priceOf('.00')).toBe(0);
  });
});

describe('parseChanges', () => {
  it('drops placeholder rows and parses Yes/No, ? and zero-padded related ids', () => {
    const changes = parseChanges(
      readSidRecords(
        csv(7, [
          '715298,"No Subscription Change Activity"',
          '30143229,02/19/26,"11:39:45",No,Yes,1033311,6,27949382,100,"ContractSwap",844,"Bloomberg Anywhere","","",?,?,30669868,02/19/26,03/31/26,000007442760,00003,0030143229,-3101.00,?,?,?,?,?',
        ]),
        7,
      ),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      cust_num: 30143229,
      activity_date: '2026-02-19',
      activity_time: '11:39:45',
      is_start: false,
      is_stop: true,
      order_num: 27949382,
      type_description: 'ContractSwap',
      po_number: null,
      from_cust_num: null,
      to_cust_num: 30669868,
      to_completion_date: '2026-02-19',
      subscription_billthru_date: '2026-03-31',
      subscription_related_sid: 7442760,
      subscription_related_inst_num: 3,
      subscription_related_cust_num: 30143229,
      subscription_amount: -3101,
      hardware_amount: null,
    });
  });

  it('rejects an unknown two-column marker', () => {
    expect(() =>
      parseChanges(readSidRecords(csv(7, ['715298,"Something else"']), 7)),
    ).toThrow(/unexpected marker/);
  });
});

describe('parseExchangeFees', () => {
  const rows = [
    '715298,03/01/26,"DUBL","Euronext Dublin Equities",2.000,"D","       60.60",""',
    '715298,03/01/26,"DUBL","","","","","","       30.30","",7026851,2,14091',
    '715298,03/01/26,"DUBL","","","","","","       30.30","*",9010184,3,14091',
    '715298,03/01/26,"ARCL","NYSE ArcaBook Level 2",1.000,"D","***","*"',
    '715298,03/01/26,"ARCL","","","","","","***","*",9010184,3,29366',
    '715298,"Exchange Administration Fees"',
    '715298,03/01/26,"ADM14","Enablement Fee OPRA",2.000,"     2.00"',
    '30101839,"No Exchanges"',
  ];

  it('attaches SID lines to their exchange, nulls *** and reads admin fees', () => {
    const fees = parseExchangeFees(readSidRecords(csv(4, rows), 4));
    expect(fees).toHaveLength(3);
    expect(fees[0]).toMatchObject({
      fee_kind: 'exchange',
      exchange_code: 'DUBL',
      subscriptions: 2,
      currency_code: 'D',
      total_price: 60.6,
      contributor_bills: false,
    });
    expect(fees[0].lines).toEqual([
      {
        sid: 7026851,
        sid_inst_num: 2,
        pro_rate: 30.3,
        contributor_bills: false,
        eid_number: 14091,
      },
      {
        sid: 9010184,
        sid_inst_num: 3,
        pro_rate: 30.3,
        contributor_bills: true,
        eid_number: 14091,
      },
    ]);
    expect(fees[1]).toMatchObject({
      exchange_code: 'ARCL',
      total_price: null,
      contributor_bills: true,
    });
    expect(fees[1].lines[0].pro_rate).toBeNull();
    expect(fees[2]).toEqual({
      cust_num: 715298,
      rpt_month: '2026-03-01',
      fee_kind: 'admin',
      exchange_code: 'ADM14',
      exchange_name: 'Enablement Fee OPRA',
      subscriptions: 2,
      currency_code: null,
      total_price: 2,
      contributor_bills: false,
      lines: [],
    });
  });

  it('rejects a SID line that has no exchange row above it', () => {
    expect(() =>
      parseExchangeFees(readSidRecords(csv(4, [rows[1]]), 4)),
    ).toThrow(/without an exchange row/);
  });

  it('rejects a SID line under a different exchange', () => {
    expect(() =>
      parseExchangeFees(readSidRecords(csv(4, [rows[0], rows[4]]), 4)),
    ).toThrow(/does not belong/);
  });
});

describe('parseResearchPurchases', () => {
  it('reads a populated row, converting dates, numbers and ? to null', () => {
    const [row] = parseResearchPurchases(
      readSidRecords(
        csv(5, [
          '715298,03/01/26,"RSCH-4411","Global Equity Outlook",02/14/26,"Ana Bloom","Equities","Financials","EMEA",125.00,3,02/20/26,"TXN-9087","Berenberg Bank",30041555,"user 830_zrh","a1b2c3","Premium Research",?',
        ]),
        5,
      ),
    );
    expect(row).toEqual({
      cust_num: 715298,
      rpt_month: '2026-03-01',
      research_report_id: 'RSCH-4411',
      title: 'Global Equity Outlook',
      publish_date: '2026-02-14',
      analyst_name: 'Ana Bloom',
      asset_class: 'Equities',
      industry: 'Financials',
      region: 'EMEA',
      price_per_document: 125,
      volume_purchased: 3,
      transaction_date: '2026-02-20',
      transaction_id: 'TXN-9087',
      consumer_company_name: 'Berenberg Bank',
      consumer_company_number: 30041555,
      purchaser_name: 'user 830_zrh',
      purchaser_uuid: 'a1b2c3',
      research_class_name: 'Premium Research',
      memo: null,
    });
  });
});

describe('parseMaterialCharges', () => {
  it('reads a populated row, converting dates, numbers and ? to null', () => {
    const [row] = parseMaterialCharges(
      readSidRecords(
        csv(6, [
          '715298,03/01/26,2,"MAT-7781","Terminal Keyboard","     240.00","D",03/01/26,02/28/27,?',
        ]),
        6,
      ),
    );
    expect(row).toEqual({
      cust_num: 715298,
      rpt_month: '2026-03-01',
      quantity: 2,
      material: 'MAT-7781',
      description: 'Terminal Keyboard',
      total_price: 240,
      currency_code: 'D',
      start_date: '2026-03-01',
      end_date: '2027-02-28',
      username: null,
    });
  });
});

describe('parseSidFileSet', () => {
  it('assembles a month from all eight files and counts rows per file', () => {
    const parsed = parseSidFileSet({
      0: csv(0, ACCOUNT_ROWS),
      1: csv(1, ['715298,"No Subscription Change Activity"']),
      2: csv(2, [
        '715298,1856014,6,03/02/09,03/02/27,"user 830_zrh",1,"Subscription",28,"Bloomberg Anywhere",7660589,?,,,2360,?,?,',
      ]),
      3: csv(3, ['715298,"No Exchanges"']),
      4: csv(4, ['715298,"No Exchanges"']),
      5: csv(5, []),
      6: csv(6, []),
      7: csv(7, ['715298,"No Subscription Change Activity"']),
    });
    expect(parsed.firmwideId).toBe(28929);
    expect(parsed.billingDate).toBe('2026-03-01');
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.subscriptions).toHaveLength(1);
    expect(parsed.changes).toHaveLength(0);
    expect(parsed.exchangeFees).toHaveLength(0);
    expect(parsed.researchPurchases).toHaveLength(0);
    expect(parsed.materialCharges).toHaveLength(0);
    expect(parsed.rowCounts).toEqual({
      0: 2,
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      5: 0,
      6: 0,
      7: 1,
    });
  });
});
