import {
  transformInvTransactions,
  transformInvBoardMembers,
  transformInvToCapTableData,
  transformInvToLegalTerms,
  transformInvToPortfolioCompany,
  applySnapshotLegalTerms,
  toOverriddenLegalTermsKeys,
} from '@/lib/v2/inv/transforms';
import type {
  InvCompany,
  InvCompanyValuation,
  InvTransaction,
  InvBoardSeat,
  InvCapTableSnapshot,
  InvSecurity,
  InvInformationRights,
  InvRoundTerms,
  InvSecurityTerms,
  InvInvestorStatusResult,
  InvFinancingRound,
  InvEquityPlanSnapshot,
} from '@/lib/v2/inv/types';

describe('Inv Transforms', () => {
  describe('transformInvTransactions', () => {
    it('transforms transactions with financing round info', () => {
      const transactions: InvTransaction[] = [
        {
          id: 1,
          publicId: 'tx-1',
          companyId: 1,
          fundId: 1,
          securityId: 1,
          financingRoundId: 1,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2023-01-15',
          settlementDate: '2023-01-15',
          units: 1000,
          amount: 100000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          financingRound: {
            id: 1,
            publicId: 'fr-1',
            companyId: 1,
            organizationId: 'org-1',
            name: 'Series A',
            stageId: 3,
            stageName: 'Series A',
            stageCode: 'series_a',
            currency: 'USD',
            preMoneyValuation: 10000000,
            announcedDate: null,
            initialCloseDate: '2023-01-15',
            finalCloseDate: null,
            notes: null,
            externalId: null,
            metadata: {},
            impliedValuation: null,
          },
        },
      ];

      const result = transformInvTransactions(transactions);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        date: '2023-01-15',
        amount: 100000,
        type: 'Series A',
        transactionType: 'purchase',
        rawTransactionType: 'purchase',
        flowType: 'investment',
        entityName: undefined,
        stage: 'Series A',
        equityClass: undefined,
        cost: 100000,
        realizedProceeds: 0,
        myUnits: 1000,
        postMoneyValuation: 10100000,
        postMoneySnapshotId: null,
        myFMV: null,
        cumulativeUnits: 1000,
      });
    });

    it('handles distribution transaction type', () => {
      const transactions: InvTransaction[] = [
        {
          id: 2,
          publicId: 'tx-2',
          companyId: 1,
          fundId: 1,
          securityId: 0,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'distribution',
          transactionDate: '2024-01-15',
          settlementDate: '2024-01-15',
          units: 0,
          amount: 50000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          financingRound: null,
        },
      ];

      const result = transformInvTransactions(transactions);

      expect(result[0].flowType).toBe('distribution');
      expect(result[0].type).toBe('Pre-Seed');
    });

    it('uses source and destination fund names for affiliate transfers', () => {
      const transactions: InvTransaction[] = [
        {
          id: 1,
          publicId: 'tx-1',
          companyId: 1,
          fundId: 1,
          securityId: 1,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'affiliate_transfer_from',
          transactionDate: '2024-03-15',
          settlementDate: null,
          units: -100,
          amount: 0,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {
            at_transfer_details: {
              source_fund: 'Postsig Fund I',
              destination_fund: 'Postsig Fund II',
            },
          },
          financingRound: null,
          fund: {
            id: 1,
            publicId: 'fund-1',
            organizationId: 'org-1',
            name: 'Fallback Fund I',
            shortName: 'FF I',
            code: null,
            description: null,
            currency: 'USD',
            status: 'active',
            vintageYear: null,
            targetSize: null,
            committedCapital: null,
            metadata: {},
          },
        },
        {
          id: 2,
          publicId: 'tx-2',
          companyId: 1,
          fundId: 2,
          securityId: 1,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'affiliate_transfer_to',
          transactionDate: '2024-03-15',
          settlementDate: null,
          units: 100,
          amount: 0,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {
            at_transfer_details: {
              source_fund: 'Postsig Fund I',
              destination_fund: 'Postsig Fund II',
            },
          },
          financingRound: null,
          fund: {
            id: 2,
            publicId: 'fund-2',
            organizationId: 'org-1',
            name: 'Fallback Fund II',
            shortName: 'FF II',
            code: null,
            description: null,
            currency: 'USD',
            status: 'active',
            vintageYear: null,
            targetSize: null,
            committedCapital: null,
            metadata: {},
          },
        },
      ];

      const result = transformInvTransactions(transactions);

      expect(result[0].transactionType).toBe('Affiliate Transfer From');
      expect(result[0].entityName).toBe('Postsig Fund I');
      expect(result[1].transactionType).toBe('Affiliate Transfer To');
      expect(result[1].entityName).toBe('Postsig Fund II');
    });

    it('handles empty transactions array', () => {
      const result = transformInvTransactions([]);
      expect(result).toEqual([]);
    });

    describe('postMoneySnapshotId (PMV override lineage)', () => {
      const baseRound: InvFinancingRound = {
        id: 1,
        publicId: 'fr-1',
        companyId: 1,
        organizationId: 'org-1',
        name: 'Series A',
        stageId: 3,
        stageName: 'Series A',
        stageCode: 'series_a',
        currency: 'USD',
        preMoneyValuation: 9000000,
        announcedDate: null,
        initialCloseDate: '2023-01-15',
        finalCloseDate: null,
        notes: null,
        externalId: null,
        metadata: {},
        impliedValuation: 10000000,
        impliedValuationSnapshotId: 42,
      };

      const makeTx = (round: InvFinancingRound): InvTransaction => ({
        id: 1,
        publicId: 'tx-1',
        companyId: 1,
        fundId: 1,
        securityId: 1,
        financingRoundId: round.id,
        organizationId: 'org-1',
        transactionType: 'purchase',
        transactionDate: '2023-01-15',
        settlementDate: '2023-01-15',
        units: 1000,
        amount: 100000,
        currency: 'USD',
        counterpartyName: null,
        signatory: null,
        notes: null,
        externalId: null,
        metadata: {},
        financingRound: round,
      });

      it('records the source snapshot id when PMV comes from a snapshot', () => {
        const [tx] = transformInvTransactions([makeTx(baseRound)]);
        expect(tx.postMoneyValuation).toBe(10000000);
        expect(tx.postMoneySnapshotId).toBe(42);
      });

      it('records a different round’s snapshot id (no override match)', () => {
        const [tx] = transformInvTransactions([
          makeTx({
            ...baseRound,
            impliedValuation: 5000000,
            impliedValuationSnapshotId: 7,
          }),
        ]);
        expect(tx.postMoneySnapshotId).toBe(7);
      });

      it('has no snapshot id when PMV is derived from pre-money + amount', () => {
        const [tx] = transformInvTransactions([
          makeTx({
            ...baseRound,
            impliedValuation: null,
            impliedValuationSnapshotId: null,
          }),
        ]);
        expect(tx.postMoneyValuation).toBe(9100000); // preMoney 9M + amount 100k
        expect(tx.postMoneySnapshotId).toBeNull();
      });
    });
  });

  describe('transformInvBoardMembers', () => {
    it('transforms board seats to board members', () => {
      const seats: InvBoardSeat[] = [
        {
          id: 1,
          companyId: 1,
          organizationId: 'org-1',
          holderName: 'John Smith',
          holderTitle: 'Partner',
          seatType: 'investor',
          effectiveDate: '2023-01-15',
          endDate: null,
          designatingFundId: 1,
          designatingSecurityId: null,
          committeeMemberships: null,
          metadata: {},
          designatingFund: {
            id: 1,
            publicId: 'fund-1',
            organizationId: 'org-1',
            name: 'Acme Ventures Fund I',
            shortName: 'AV I',
            code: null,
            description: null,
            currency: 'USD',
            status: 'active',
            vintageYear: null,
            targetSize: null,
            committedCapital: null,
            metadata: {},
          },
        },
      ];

      const result = transformInvBoardMembers(seats);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        name: 'John Smith',
        role: 'Partner',
        fund: 'AV I',
        designatingFundId: 1,
        isLead: false,
        seatType: 'investor',
        overridden: undefined,
      });
    });

    it('identifies lead investor seats', () => {
      const seats: InvBoardSeat[] = [
        {
          id: 1,
          companyId: 1,
          organizationId: 'org-1',
          holderName: 'Jane Doe',
          holderTitle: 'Managing Partner',
          seatType: 'lead',
          effectiveDate: '2023-01-15',
          endDate: null,
          designatingFundId: null,
          designatingSecurityId: null,
          committeeMemberships: null,
          metadata: {},
          designatingFund: null,
        },
      ];

      const result = transformInvBoardMembers(seats);

      expect(result[0].isLead).toBe(true);
    });

    it('handles seats without fund information', () => {
      const seats: InvBoardSeat[] = [
        {
          id: 1,
          companyId: 1,
          organizationId: 'org-1',
          holderName: 'Founder CEO',
          holderTitle: null,
          seatType: 'founder',
          effectiveDate: '2020-01-01',
          endDate: null,
          designatingFundId: null,
          designatingSecurityId: null,
          committeeMemberships: null,
          metadata: {},
          designatingFund: null,
        },
      ];

      const result = transformInvBoardMembers(seats);

      expect(result[0]).toEqual({
        id: 1,
        name: 'Founder CEO',
        role: undefined,
        fund: undefined,
        designatingFundId: null,
        isLead: false,
        seatType: 'founder',
        overridden: undefined,
      });
    });

    it('handles empty array', () => {
      const result = transformInvBoardMembers([]);
      expect(result).toEqual([]);
    });
  });

  describe('transformInvToCapTableData', () => {
    it('transforms cap table snapshot with cap_table_detail', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 12000000,
        commonOutstanding: 5000000,
        preferredAuthorized: 5000000,
        preferredOutstanding: 3000000,
        optionPoolAuthorized: 2000000,
        optionPoolOutstanding: 500000,
        optionPoolAvailable: 1500000,
        optionPoolFdPercent: 20.0,
        ourTotalShares: 1000000,
        ourCommonShares: 0,
        ourPreferredShares: 1000000,
        ourPreferredPct: 33.33,
        ourOwnershipPercent: 10.0,
        ourFdOwnershipPercent: 10.0,
        ourVotingPct: 10.0,
        stageCode: null,
        stageName: null,
        capTableDetail: [
          {
            id: 'sec-1',
            name: 'Series A Preferred',
            securityType: 'preferred',
            units: 3000000,
            fdPercent: 30,
            myUnits: 1000000,
            myFdPercent: 10,
          },
        ],
      };

      const result = transformInvToCapTableData([snapshot]);

      expect(result.availableDates).toContain('2024-01-01');
      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0].asOfDate).toBe('2024-01-01');
      expect(result.snapshots[0].securities).toHaveLength(1);
      expect(result.snapshots[0].securities[0].name).toBe('Series A Preferred');
      expect(result.snapshots[0].securities[0].units).toBe(3000000);
      expect(result.snapshots[0].preferredOutstanding).toBe(3000000);
    });

    it('returns empty securities when capTableDetail is null', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 12000000,
        commonOutstanding: 5000000,
        preferredAuthorized: 5000000,
        preferredOutstanding: 3000000,
        optionPoolAuthorized: 2000000,
        optionPoolOutstanding: 500000,
        optionPoolAvailable: 1500000,
        optionPoolFdPercent: 20.0,
        ourTotalShares: 1000000,
        ourCommonShares: 0,
        ourPreferredShares: 1000000,
        ourPreferredPct: 33.33,
        ourOwnershipPercent: 10.0,
        ourFdOwnershipPercent: 10.0,
        ourVotingPct: 10.0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const result = transformInvToCapTableData([snapshot]);

      expect(result.snapshots[0].securities).toEqual([]);
      // Sections rely on these columns when cap_table_detail is absent
      expect(result.snapshots[0].commonOutstanding).toBe(5000000);
      expect(result.snapshots[0].preferredOutstanding).toBe(3000000);
    });

    it('handles empty securities array', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 0,
        commonOutstanding: 0,
        preferredAuthorized: 0,
        preferredOutstanding: 0,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const result = transformInvToCapTableData([snapshot]);

      expect(result.snapshots[0].securities).toEqual([]);
    });

    it('uses cap_table_detail JSON when available', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 0,
        commonOutstanding: 0,
        preferredAuthorized: 0,
        preferredOutstanding: 0,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: [
          {
            id: 'common',
            name: 'Common Stock',
            parentId: null,
            units: 5000000,
            fdPercent: 50,
            myUnits: 500000,
            myFdPercent: 5,
          },
          {
            id: 'series-a',
            name: 'Series A Preferred',
            parentId: null,
            units: 3000000,
            fdPercent: 30,
            myUnits: 300000,
            myFdPercent: 3,
          },
        ],
      };

      const result = transformInvToCapTableData([snapshot]);

      expect(result.snapshots[0].securities).toHaveLength(2);
      expect(result.snapshots[0].securities[0]).toEqual({
        id: 'common',
        name: 'Common Stock',
        parentId: undefined,
        units: 5000000,
        fdPercent: 50,
        myUnits: 500000,
        myFdPercent: 5,
      });
      expect(result.snapshots[0].securities[1]).toEqual({
        id: 'series-a',
        name: 'Series A Preferred',
        parentId: undefined,
        units: 3000000,
        fdPercent: 30,
        myUnits: 300000,
        myFdPercent: 3,
      });
    });
  });

  describe('transformInvToLegalTerms', () => {
    it('transforms complete legal terms', () => {
      const infoRights: InvInformationRights = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        financingRoundId: 1,
        effectiveDate: '2023-01-15',
        expirationDate: null,
        isMajorInvestor: true,
        majorInvestorThreshold: 1000000,
        infoRightsForMajor: true,
        infoRightsForAll: false,
        inspectionRights: true,
        capTableAccess: true,
        monthlyBalanceSheet: false,
        monthlyIncomeCashFlows: false,
        monthlyStockholdersEquity: false,
        monthlyCapTable: false,
        monthlyTimingDays: null,
        auditedMonthly: false,
        quarterlyBalanceSheet: true,
        quarterlyIncomeCashFlows: true,
        quarterlyStockholdersEquity: true,
        quarterlyCapTable: true,
        quarterlyTimingDays: 45,
        auditedQuarterly: false,
        yearEndBalanceSheet: true,
        yearEndIncomeCashFlows: true,
        yearEndStockholdersEquity: true,
        yearEndCapTable: true,
        yearEndBudgetBusinessPlan: true,
        yearEndTimingDays: 90,
        auditedYearEnd: true,
        reportingContactName: null,
        reportingContactEmail: null,
        notes: null,
        metadata: {},
      };

      const roundTerms: InvRoundTerms = {
        id: 1,
        financingRoundId: 1,
        organizationId: 'org-1',
        effectiveDate: '2023-01-15',
        supersededDate: null,
        optionPoolPercent: 20.0,
        preMoneyFdShares: 8000000,
        postMoneyFdShares: 10000000,
        majorInvestorThresholdAmount: 1000000,
        majorInvestorThresholdShares: null,
        majorInvestorThresholdOwnershipPct: null,
        namedMajorInvestors: ['Acme Ventures'],
        proRataRightsAll: false,
        proRataRightsMajor: true,
        standardProRataFormulation: true,
        qsbsRepMade: true,
        qsbsCovenantGiven: true,
        payToPlay: false,
        dragAlong: true,
        rofrCosale: true,
        investorsSubjectToRofr: true,
        redemptionRights: false,
        registrationRightsPreferred: true,
        doInsurance: true,
        founderVestingApplied: true,
        employeeVestingProtocol: true,
        milestoneClosings: false,
        subsequentClosingWindowDays: 90,
        requiredClosingPayments: false,
        issuerPaysInvestorCounsel: true,
        investorCounselFeeCap: 25000,
        rawTerms: null,
      };

      const securityTerms: InvSecurityTerms = {
        id: 1,
        securityId: 1,
        effectiveDate: '2023-01-15',
        supersededDate: null,
        originalIssuePrice: 1.0,
        authorizedShares: 3000000,
        issuedShares: 3000000,
        outstandingShares: 3000000,
        parValue: 0.0001,
        conversionPrice: 1.0,
        conversionRatio: 1.0,
        antiDilutionType: 'Weighted Average',
        aggregateLiqPref: 1.0,
        liquidationMultiplier: 1.0,
        liquidationSeniority: 1,
        participationType: 'non-participating',
        participationCap: null,
        dividendRate: 8.0,
        dividendCumulative: true,
        dividendAccruing: false,
        dividendSeniority: 1,
        valuationCap: null,
        discountRate: null,
        interestRate: null,
        interestType: null,
        maturityDate: null,
        qualifiedFinancingThreshold: null,
      };

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: true,
        isMajorInvestor: true,
        hasProRataRights: true,
        hasInformationRights: true,
      };

      const result = transformInvToLegalTerms(
        infoRights,
        roundTerms,
        securityTerms,
        investorStatus,
      );

      // Header status
      expect(result.headerStatus.majorInvestorStatus).toBe(true);
      expect(result.headerStatus.informationRights).toBe(true);

      // Information rights
      expect(result.informationRights.balanceSheet.quarterly).toBe(true);
      expect(result.informationRights.capitalizationTable.yearEnd).toBe(true);
      expect(result.informationRights.budgetAndBusinessPlan.yearEnd).toBe(true);

      // Major investor
      expect(result.majorInvestor.thresholdAmount).toBe(1000000);
      expect(result.majorInvestor.namedMajorInvestor).toEqual([
        'Acme Ventures',
      ]);

      // Economic rights
      expect(result.economicRights.antiDilutionRights).toBe('Weighted Average');
      expect(result.economicRights.liquidationPreferenceSeniority).toEqual([
        '1',
      ]);

      // QSBS
      expect(result.qsbs.qualifiedSmallBusinessStockCovenantGiven).toBe(true);
      expect(result.qsbs.qualifiedSmallBusinessRepMade).toBe(true);

      // Dividends
      expect(result.dividends.dividendRate).toBe(8.0);
      expect(result.dividends.cumulativeDividends).toBe(true);

      // Other legal terms
      expect(result.otherLegalTerms.proRataRightsForMajorInvestors).toBe(true);
      expect(result.otherLegalTerms.dragAlong).toBe(true);
      expect(result.otherLegalTerms.investorCounselFeeCap).toBe(25000);
    });

    it('handles null legal terms gracefully', () => {
      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const result = transformInvToLegalTerms(null, null, null, investorStatus);

      expect(result.headerStatus.majorInvestorStatus).toBe(false);
      expect(result.informationRights.balanceSheet.quarterly).toBe(false);
      expect(result.majorInvestor.thresholdAmount).toBeNull();
      expect(result.economicRights.antiDilutionRights).toBe('None');
    });
  });

  describe('transformInvToPortfolioCompany', () => {
    it('transforms complete company data', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-1',
        organizationId: 'org-1',
        companyId: 100,
        status: 'active',
        sector: 'Technology',
        tags: ['AI', 'SaaS'],
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'TechCo Inc',
        nameOverride: null,
        domain: 'techco.com',
        industry: 'Software',
        headquarters: 'San Francisco, CA',
        description: 'AI-powered software',
        foundedYear: 2020,
        legalName: 'TechCo Inc.',
        legalJurisdiction: 'Delaware',
        entityType: 'C-Corporation',
        stageCode: 'series_a',
        stageDisplayName: 'Series A',
        entryStageCode: 'seed',
        entryStageDisplayName: 'Seed',
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 100,
        organizationId: 'org-1',
        companyName: 'TechCo Inc',
        companyDomain: 'techco.com',
        sector: 'Technology',
        industry: 'Software',
        headquarters: 'San Francisco, CA',
        status: 'active',
        myFmv: 5000000,
        multiple: 5.0,
        aggregateCost: 1000000,
        realizedProceeds: null,
        ownershipPct: 0.1,
        myFdPct: 0.1,
        myUnits: 1000000,
        postMoneyValuation: 50000000,
        currentPriceUnit: 5.0,
        fullyDilutedTotal: 10000000,
        totalEquityFinancing: 20000000,
        lastTransactionDate: '2023-06-15',
        snapshotDate: '2024-01-01',
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const transactions: InvTransaction[] = [];
      const boardMembers: InvBoardSeat[] = [];
      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        transactions,
        boardMembers,
        investorStatus,
      );

      expect(result.id).toBe('company-1');
      expect(result.entityId).toBe(1);
      expect(result.name).toBe('TechCo Inc');
      expect(result.domain).toBe('techco.com');
      expect(result.valuation).toBe(5000000);
      expect(result.myTotalFMV).toBe(5000000);
      expect(result.postMoneyValuation).toBe(50000000);
      expect(result.myOwnership).toBe(10.0);
      expect(result.tags).toHaveLength(2);
      expect(result.investmentStatus).toBe('Active');
      expect(result.foundedYear).toBe(2020);
      expect(result.headquarters).toBe('San Francisco, CA');
      expect(result.industry).toBe('Software');
      expect(result.myAggregateCost).toBe(1000000);
      expect(result.multiple).toBe(5.0);
    });

    it('handles minimal company data', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-2',
        organizationId: 'org-1',
        companyId: 101,
        status: 'exited',
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'MinimalCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: null,
        organizationId: 'org-1',
        companyName: null,
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: null,
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        [],
        [],
        investorStatus,
      );

      expect(result.name).toBe('MinimalCo');
      expect(result.valuation).toBe(0);
      expect(result.tags).toEqual([]);
      expect(result.investmentStatus).toBe('Exited');
      expect(result.domain).toBeUndefined();
    });

    it('leaves industry empty when only sector is populated', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-3',
        organizationId: 'org-1',
        companyId: 102,
        status: 'active',
        sector: 'Fintech',
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'SectorOnlyCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 102,
        organizationId: 'org-1',
        companyName: 'SectorOnlyCo',
        companyDomain: null,
        sector: 'Fintech',
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        [],
        [],
        {
          hasBoardSeat: false,
          isMajorInvestor: false,
          hasProRataRights: false,
          hasInformationRights: false,
        },
      );

      expect(result.industry).toBe('');
    });

    describe('fmvAsOfDate attribution', () => {
      const makeCompany = (status: string): InvCompany => ({
        id: 1,
        publicId: 'company-fmv',
        organizationId: 'org-1',
        companyId: 100,
        status,
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'FmvCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      });

      const makeValuation = (
        overrides: Partial<InvCompanyValuation>,
      ): InvCompanyValuation => ({
        companyId: 1,
        globalCompanyId: null,
        organizationId: 'org-1',
        companyName: 'FmvCo',
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
        ...overrides,
      });

      const makeSnapshot = (snapshotDate: string): InvCapTableSnapshot => ({
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate,
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 0,
        commonOutstanding: 5000000,
        preferredAuthorized: 0,
        preferredOutstanding: 3000000,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      });

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const transform = (
        company: InvCompany,
        valuation: InvCompanyValuation,
        snapshots?: InvCapTableSnapshot[],
        overriddenFields?: ReadonlySet<string>,
        myFmvOverrideCreatedAt?: string | null,
      ) =>
        transformInvToPortfolioCompany(
          company,
          valuation,
          [],
          [],
          investorStatus,
          undefined,
          snapshots,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          overriddenFields,
          myFmvOverrideCreatedAt,
        );

      it('uses the latest snapshot date for a snapshot-derived FMV', () => {
        const result = transform(
          makeCompany('active'),
          makeValuation({ myFmv: 5000000 }),
          [makeSnapshot('2024-03-01')],
        );
        expect(result.myTotalFMV).toBe(5000000);
        expect(result.fmvAsOfDate).toBe('2024-03-01');
      });

      it('falls back to the valuation view snapshot date when no snapshot rows are passed', () => {
        const result = transform(
          makeCompany('active'),
          makeValuation({ myFmv: 5000000, snapshotDate: '2023-11-15' }),
        );
        expect(result.fmvAsOfDate).toBe('2023-11-15');
      });

      it('uses the override creation date (date part) for a directly overridden FMV', () => {
        const result = transform(
          makeCompany('active'),
          makeValuation({ myFmv: 999000 }),
          [makeSnapshot('2024-03-01')],
          new Set(['myFmv']),
          '2026-08-15T14:30:00.000+00:00',
        );
        expect(result.myTotalFMV).toBe(999000);
        expect(result.fmvAsOfDate).toBe('2026-08-15');
      });

      it('keeps the snapshot date when myFmv is only recomputed from an overridden input', () => {
        const result = transform(
          makeCompany('active'),
          makeValuation({ myFmv: 750000 }),
          [makeSnapshot('2024-03-01')],
          new Set(['myFmv']),
          null,
        );
        expect(result.fmvAsOfDate).toBe('2024-03-01');
      });

      it('is null for an exited position', () => {
        const result = transform(
          makeCompany('exited'),
          makeValuation({ myFmv: 5000000 }),
          [makeSnapshot('2024-03-01')],
        );
        expect(result.myTotalFMV).toBe(0);
        expect(result.fmvAsOfDate).toBeNull();
      });

      it('is null when FMV genuinely cannot be computed and defaults to 0', () => {
        const result = transform(
          makeCompany('active'),
          makeValuation({ snapshotDate: '2023-11-15' }),
        );
        expect(result.myTotalFMV).toBe(0);
        expect(result.fmvAsOfDate).toBeNull();
      });
    });

    it('falls back to valuation stage when company stage fields are null', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-stage',
        organizationId: 'org-1',
        companyId: 100,
        status: 'active',
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'StageCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 100,
        organizationId: 'org-1',
        companyName: 'StageCo',
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: '2022-01-01',
        entryAmount: 500000,
        entryStageCode: 'seed',
        entryStageDisplayName: 'Seed',
        currentStageCode: 'series_b',
        currentStageDisplayName: 'Series B',
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        [], // Empty transactions (list view)
        [],
        investorStatus,
      );

      // Without company stage fields, valuation view fields are the fallback
      expect(result.stage).toBe('Series B');
      expect(result.stageAtEntry).toBe('Seed');
    });

    it.each([
      ['reclassification', 'Reclassification'],
      ['reverse_split', 'Reverse Split'],
      ['forward_split', 'Forward Split'],
    ])(
      'renders synthetic stage %s as a first-class current stage',
      (stageCode, displayName) => {
        const company: InvCompany = {
          id: 1,
          publicId: 'company-synthetic',
          organizationId: 'org-1',
          companyId: 100,
          status: 'active',
          sector: null,
          tags: null,
          notes: null,
          investmentThesis: null,
          contactPerson: null,
          contactEmail: null,
          externalId: null,
          metadata: {},
          createdAt: '2023-01-01',
          updatedAt: '2024-01-01',
          name: 'RecapCo',
          nameOverride: null,
          domain: null,
          industry: null,
          headquarters: null,
          description: null,
          foundedYear: null,
          legalName: null,
          legalJurisdiction: null,
          entityType: null,
          stageCode: null,
          stageDisplayName: null,
          entryStageCode: null,
          entryStageDisplayName: null,
        };

        const valuation: InvCompanyValuation = {
          companyId: 1,
          globalCompanyId: 100,
          organizationId: 'org-1',
          companyName: 'RecapCo',
          companyDomain: null,
          sector: null,
          industry: null,
          headquarters: null,
          status: 'active',
          myFmv: null,
          multiple: null,
          aggregateCost: null,
          realizedProceeds: null,
          ownershipPct: null,
          myFdPct: null,
          myUnits: null,
          postMoneyValuation: null,
          currentPriceUnit: null,
          fullyDilutedTotal: null,
          totalEquityFinancing: null,
          lastTransactionDate: null,
          snapshotDate: null,
          entryDate: '2022-01-01',
          entryAmount: 500000,
          entryStageCode: 'seed',
          entryStageDisplayName: 'Seed',
          currentStageCode: stageCode,
          currentStageDisplayName: displayName,
          fundIds: null,
          fundNames: null,
          fundShortNames: null,
          primaryFundName: null,
          primaryFundShortName: null,
          maExcludedShare: null,
          maCarriedCost: null,
          maEventDate: null,
        };

        const investorStatus: InvInvestorStatusResult = {
          hasBoardSeat: false,
          isMajorInvestor: false,
          hasProRataRights: false,
          hasInformationRights: false,
        };

        const result = transformInvToPortfolioCompany(
          company,
          valuation,
          [],
          [],
          investorStatus,
        );

        // A synthetic latest round is the company's current stage (psk-1854);
        // without the map entry this would render blank, not the display name.
        expect(result.stage).toBe(displayName);
        expect(result.stageAtEntry).toBe('Seed');
      },
    );

    it('includes transactions as CapTableTransaction when security data present', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: 50000000,
        sharePrice: 5.0,
        commonAuthorized: 0,
        commonOutstanding: 5000000,
        preferredAuthorized: 0,
        preferredOutstanding: 3000000,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const transactions: InvTransaction[] = [
        {
          id: 1,
          publicId: 'tx-1',
          companyId: 1,
          fundId: 1,
          securityId: 10,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2023-06-01',
          settlementDate: null,
          units: 500000,
          amount: 250000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          security: {
            id: 10,
            publicId: 'sec-10',
            companyId: 1,
            organizationId: 'org-1',
            name: 'Common Stock',
            securityType: 'common',
            seriesName: null,
            isValuationReference: false,
            metadata: {},
            terms: null,
          },
        },
        {
          id: 2,
          publicId: 'tx-2',
          companyId: 1,
          fundId: 1,
          securityId: 20,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2023-09-01',
          settlementDate: null,
          units: 300000,
          amount: 1500000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          security: {
            id: 20,
            publicId: 'sec-20',
            companyId: 1,
            organizationId: 'org-1',
            name: 'Series A Preferred',
            securityType: 'preferred',
            seriesName: 'Series A',
            isValuationReference: false,
            metadata: {},
            terms: null,
          },
        },
      ];

      const result = transformInvToCapTableData(
        [snapshot],
        undefined,
        transactions,
      );

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0]).toEqual({
        securityId: 10,
        securityType: 'common',
        securityName: 'Common Stock',
        transactionDate: '2023-06-01',
        transactionType: 'purchase',
        signedUnits: 500000,
        units: 500000,
      });
      expect(result.transactions[1]).toEqual({
        securityId: 20,
        securityType: 'preferred',
        securityName: 'Series A Preferred',
        transactionDate: '2023-09-01',
        transactionType: 'purchase',
        signedUnits: 300000,
        units: 300000,
      });
    });

    it('filters out transactions without security data', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: null,
        sharePrice: null,
        commonAuthorized: 0,
        commonOutstanding: 0,
        preferredAuthorized: 0,
        preferredOutstanding: 0,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const transactions: InvTransaction[] = [
        {
          id: 1,
          publicId: 'tx-1',
          companyId: 1,
          fundId: 1,
          securityId: 10,
          financingRoundId: null,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2023-06-01',
          settlementDate: null,
          units: 500000,
          amount: 250000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          // No security data
        },
      ];

      const result = transformInvToCapTableData(
        [snapshot],
        undefined,
        transactions,
      );

      expect(result.transactions).toHaveLength(0);
    });

    it('maps equity plan snapshots correctly', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: null,
        sharePrice: null,
        commonAuthorized: 0,
        commonOutstanding: 0,
        preferredAuthorized: 0,
        preferredOutstanding: 0,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const equityPlanSnapshots: InvEquityPlanSnapshot[] = [
        {
          id: 1,
          planId: 1,
          organizationId: 'org-1',
          effectiveDate: '2024-01-01',
          authorizedShares: 2000000,
          issuedShares: 500000,
          outstandingOptions: 1200000,
          exercisedShares: 100000,
          cancelledShares: 50000,
          poolPercentFd: 0.2,
          metadata: {},
          planName: '2023 Stock Incentive Plan',
        },
      ];

      const result = transformInvToCapTableData(
        [snapshot],
        undefined,
        undefined,
        equityPlanSnapshots,
      );

      expect(result.equityPlanSnapshots).toHaveLength(1);
      expect(result.equityPlanSnapshots[0]).toEqual({
        effectiveDate: '2024-01-01',
        authorizedShares: 2000000,
        issuedShares: 500000,
        outstandingOptions: 1200000,
        exercisedShares: 100000,
        cancelledShares: 50000,
        poolPercentFd: 0.2,
        planName: '2023 Stock Incentive Plan',
      });
    });

    it('returns empty transactions and equity plan snapshots by default', () => {
      const snapshot: InvCapTableSnapshot = {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-01-01',
        snapshotTypeId: 1,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: 8000000,
        impliedValuation: null,
        sharePrice: null,
        commonAuthorized: 0,
        commonOutstanding: 0,
        preferredAuthorized: 0,
        preferredOutstanding: 0,
        optionPoolAuthorized: 0,
        optionPoolOutstanding: 0,
        optionPoolAvailable: 0,
        optionPoolFdPercent: 0,
        ourTotalShares: 0,
        ourCommonShares: 0,
        ourPreferredShares: 0,
        ourPreferredPct: 0,
        ourOwnershipPercent: 0,
        ourFdOwnershipPercent: 0,
        ourVotingPct: 0,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
      };

      const result = transformInvToCapTableData([snapshot]);

      expect(result.transactions).toEqual([]);
      expect(result.equityPlanSnapshots).toEqual([]);
    });

    it('uses company stage_id over valuation stage', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-tx-stage',
        organizationId: 'org-1',
        companyId: 100,
        status: 'active',
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'TxStageCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: 'series_c',
        stageDisplayName: 'Series C',
        entryStageCode: 'seed',
        entryStageDisplayName: 'Seed',
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 100,
        organizationId: 'org-1',
        companyName: 'TxStageCo',
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: '2022-01-01',
        entryAmount: 500000,
        entryStageCode: 'seed',
        entryStageDisplayName: 'Seed',
        currentStageCode: 'series_b',
        currentStageDisplayName: 'Series B',
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const transactions: InvTransaction[] = [
        {
          id: 1,
          publicId: 'tx-1',
          companyId: 1,
          fundId: 1,
          securityId: 1,
          financingRoundId: 1,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2022-01-01',
          settlementDate: null,
          units: 1000,
          amount: 500000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          financingRound: {
            id: 1,
            publicId: 'fr-1',
            companyId: 1,
            organizationId: 'org-1',
            name: 'Seed Round',
            stageId: 1,
            stageName: 'Seed',
            stageCode: 'seed',
            currency: 'USD',
            preMoneyValuation: 5000000,
            announcedDate: null,
            initialCloseDate: '2022-01-01',
            finalCloseDate: null,
            notes: null,
            externalId: null,
            metadata: {},
            impliedValuation: null,
          },
        },
        {
          id: 2,
          publicId: 'tx-2',
          companyId: 1,
          fundId: 1,
          securityId: 2,
          financingRoundId: 2,
          organizationId: 'org-1',
          transactionType: 'purchase',
          transactionDate: '2024-06-01',
          settlementDate: null,
          units: 500,
          amount: 2000000,
          currency: 'USD',
          counterpartyName: null,
          signatory: null,
          notes: null,
          externalId: null,
          metadata: {},
          financingRound: {
            id: 2,
            publicId: 'fr-2',
            companyId: 1,
            organizationId: 'org-1',
            name: 'Series C Round',
            stageId: 5,
            stageName: 'Series C',
            stageCode: 'series_c',
            currency: 'USD',
            preMoneyValuation: 100000000,
            announcedDate: null,
            initialCloseDate: '2024-06-01',
            finalCloseDate: null,
            notes: null,
            externalId: null,
            metadata: {},
            impliedValuation: null,
          },
        },
      ];

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const financingRounds: InvFinancingRound[] = transactions
        .map((t) => t.financingRound)
        .filter((r): r is InvFinancingRound => r != null);

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        transactions,
        [],
        investorStatus,
        undefined,
        undefined,
        undefined,
        financingRounds,
      );

      // Company stage_id fields take priority over valuation view
      expect(result.stage).toBe('Series C');
      expect(result.stageAtEntry).toBe('Seed');
    });

    it('creates capTable when only non-snapshot inputs have data', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-cap',
        organizationId: 'org-1',
        companyId: 100,
        status: 'active',
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'CapCo',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 100,
        organizationId: 'org-1',
        companyName: 'CapCo',
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const equityPlanSnapshots: InvEquityPlanSnapshot[] = [
        {
          id: 1,
          planId: 1,
          organizationId: 'org-1',
          effectiveDate: '2024-01-01',
          authorizedShares: 2000000,
          issuedShares: 500000,
          outstandingOptions: 1200000,
          exercisedShares: 100000,
          cancelledShares: 50000,
          poolPercentFd: 0.2,
          metadata: {},
          planName: '2023 Stock Incentive Plan',
        },
      ];

      // No capTableSnapshots, but equityPlanSnapshots has data
      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        [],
        [],
        investorStatus,
        undefined,
        undefined, // no capTableSnapshots
        undefined,
        undefined,
        equityPlanSnapshots,
      );

      expect(result.capTable).toBeDefined();
      expect(result.capTable!.equityPlanSnapshots).toHaveLength(1);
      expect(result.capTable!.equityPlanSnapshots[0].planName).toBe(
        '2023 Stock Incentive Plan',
      );
    });

    it('leaves capTable undefined when all inputs are empty', () => {
      const company: InvCompany = {
        id: 1,
        publicId: 'company-nocap',
        organizationId: 'org-1',
        companyId: 100,
        status: 'active',
        sector: null,
        tags: null,
        notes: null,
        investmentThesis: null,
        contactPerson: null,
        contactEmail: null,
        externalId: null,
        metadata: {},
        createdAt: '2023-01-01',
        updatedAt: '2024-01-01',
        name: 'NoCap',
        nameOverride: null,
        domain: null,
        industry: null,
        headquarters: null,
        description: null,
        foundedYear: null,
        legalName: null,
        legalJurisdiction: null,
        entityType: null,
        stageCode: null,
        stageDisplayName: null,
        entryStageCode: null,
        entryStageDisplayName: null,
      };

      const valuation: InvCompanyValuation = {
        companyId: 1,
        globalCompanyId: 100,
        organizationId: 'org-1',
        companyName: 'NoCap',
        companyDomain: null,
        sector: null,
        industry: null,
        headquarters: null,
        status: 'active',
        myFmv: null,
        multiple: null,
        aggregateCost: null,
        realizedProceeds: null,
        ownershipPct: null,
        myFdPct: null,
        myUnits: null,
        postMoneyValuation: null,
        currentPriceUnit: null,
        fullyDilutedTotal: null,
        totalEquityFinancing: null,
        lastTransactionDate: null,
        snapshotDate: null,
        entryDate: null,
        entryAmount: null,
        entryStageCode: null,
        entryStageDisplayName: null,
        currentStageCode: null,
        currentStageDisplayName: null,
        fundIds: null,
        fundNames: null,
        fundShortNames: null,
        primaryFundName: null,
        primaryFundShortName: null,
        maExcludedShare: null,
        maCarriedCost: null,
        maEventDate: null,
      };

      const investorStatus: InvInvestorStatusResult = {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      };

      const result = transformInvToPortfolioCompany(
        company,
        valuation,
        [],
        [],
        investorStatus,
      );

      expect(result.capTable).toBeUndefined();
    });
  });

  describe('applySnapshotLegalTerms', () => {
    const baseLegalTerms = transformInvToLegalTerms(null, null, null, {
      hasBoardSeat: false,
      isMajorInvestor: false,
      hasProRataRights: false,
      hasInformationRights: false,
    });

    it('overlays snapshot fields onto base, preserving non-snapshot fields', () => {
      const detail = {
        legal_terms: {
          drag_along: true,
          pay_to_play: false,
          anti_dilution_rights: 'Broad-Based Weighted Average',
          onex_liq_pref_multipliers: true,
          cumulative_dividends: true,
          do_insurance: true,
          our_pro_rata_rights: true,
          employee_vesting_protocol: true,
          registration_rights_preferred: true,
        },
        investor_status: {
          major_investor_status: true,
          our_information_rights: true,
        },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail);

      // Snapshot fields overridden
      expect(result.headerStatus.majorInvestorStatus).toBe(true);
      expect(result.headerStatus.informationRights).toBe(true);
      expect(result.economicRights.antiDilutionRights).toBe(
        'Broad-Based Weighted Average',
      );
      expect(result.economicRights.liquidationPreferenceSeniority).toEqual([
        '1x',
      ]);
      expect(result.dividends.cumulativeDividends).toBe(true);
      expect(result.otherLegalTerms.dragAlong).toBe(true);
      expect(result.otherLegalTerms.payToPlay).toBe(false);
      expect(result.otherLegalTerms.dAndOInsurance).toBe(true);
      expect(result.otherLegalTerms.proRataRightsForMajorInvestors).toBe(true);
      expect(result.otherLegalTerms.employeeVestingProtocol).toBe(true);
      expect(
        result.otherLegalTerms.registrationRightsForPreferredInvestors,
      ).toBe(true);

      // Non-snapshot fields preserved from base
      expect(result.informationRights).toEqual(
        baseLegalTerms.informationRights,
      );
      expect(result.majorInvestor).toEqual(baseLegalTerms.majorInvestor);
      expect(result.qsbs).toEqual(baseLegalTerms.qsbs);
      expect(result.economicRights.milestoneClosings).toBe(false);
    });

    it('skips the overlay for columns carrying an active override', () => {
      // `base` already has overrides applied; letting the snapshot overlay them
      // would silently discard the user's edit on imported portcos.
      const detail = {
        legal_terms: {
          drag_along: true,
          pay_to_play: true,
          our_pro_rata_rights: true,
        },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
        roundTerms: new Set(['drag_along', 'pro_rata_rights_major']),
      });

      // Edited columns keep the base (post-override) value...
      expect(result.otherLegalTerms.dragAlong).toBe(
        baseLegalTerms.otherLegalTerms.dragAlong,
      );
      expect(result.otherLegalTerms.proRataRightsForMajorInvestors).toBe(
        baseLegalTerms.otherLegalTerms.proRataRightsForMajorInvestors,
      );
      // ...while un-edited ones still take the snapshot value.
      expect(result.otherLegalTerms.payToPlay).toBe(true);
    });

    it('skips the overlay for edited security-terms columns', () => {
      // These three overlays were previously unguarded, so an edit to
      // anti-dilution, liquidation seniority or cumulative dividends was
      // silently discarded on a portfolio_import portco.
      const detail = {
        legal_terms: {
          anti_dilution_rights: 'full_ratchet',
          onex_liq_pref_multipliers: true,
          cumulative_dividends: true,
        },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
        securityTerms: new Set([
          'anti_dilution_type',
          'liquidation_seniority',
          'dividend_cumulative',
        ]),
      });

      expect(result.economicRights.antiDilutionRights).toBe(
        baseLegalTerms.economicRights.antiDilutionRights,
      );
      expect(result.economicRights.liquidationPreferenceSeniority).toEqual(
        baseLegalTerms.economicRights.liquidationPreferenceSeniority,
      );
      expect(result.dividends.cumulativeDividends).toBe(
        baseLegalTerms.dividends.cumulativeDividends,
      );
    });

    // headerStatus is rendered on the Overview tab, the CSV export and the MCP
    // tool, and both values derive from inv_information_rights columns that have
    // been editable since part I — so an unguarded overlay silently discarded a
    // user's Major Investor / Information Rights edit on an imported portco.
    it('skips the header-status overlay for edited information-rights columns', () => {
      const detail = {
        // legal_terms must be present or the overlay bails before reading
        // investor_status, which would make this assertion vacuous.
        legal_terms: {},
        investor_status: {
          major_investor_status: true,
          our_information_rights: true,
        },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
        informationRights: new Set([
          'is_major_investor',
          'info_rights_for_all',
        ]),
      });

      expect(result.headerStatus.majorInvestorStatus).toBe(false);
      expect(result.headerStatus.informationRights).toBe(false);
    });

    // Information Rights is derived: (info_rights_for_major AND is_major_investor)
    // OR info_rights_for_all — so an edit to ANY contributing column has to
    // suppress the overlay, not just one named column.
    it('suppresses the information-rights overlay from any contributing column', () => {
      const detail = {
        legal_terms: {},
        investor_status: { our_information_rights: true },
      };

      for (const fieldKey of [
        'info_rights_for_major',
        'info_rights_for_all',
        'is_major_investor',
      ]) {
        const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
          informationRights: new Set([fieldKey]),
        });
        expect(result.headerStatus.informationRights).toBe(false);
      }
    });

    it('still overlays header status when information rights are unedited', () => {
      const detail = {
        legal_terms: {},
        investor_status: {
          major_investor_status: true,
          our_information_rights: true,
        },
      };

      // An unrelated round-terms edit must not suppress the header overlay.
      const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
        roundTerms: new Set(['drag_along']),
      });

      expect(result.headerStatus.majorInvestorStatus).toBe(true);
      expect(result.headerStatus.informationRights).toBe(true);
    });

    it('still overlays security-terms columns that carry no override', () => {
      const detail = {
        legal_terms: {
          anti_dilution_rights: 'full_ratchet',
          cumulative_dividends: true,
        },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail, {
        securityTerms: new Set(['dividend_cumulative']),
      });

      // Un-edited: the snapshot wins.
      expect(result.economicRights.antiDilutionRights).toBe('Full Ratchet');
      // Edited: the base value survives.
      expect(result.dividends.cumulativeDividends).toBe(
        baseLegalTerms.dividends.cumulativeDividends,
      );
    });

    it('overlays every column when no overrides are supplied', () => {
      const detail = { legal_terms: { drag_along: true } };

      expect(
        applySnapshotLegalTerms(baseLegalTerms, detail, {}).otherLegalTerms
          .dragAlong,
      ).toBe(true);
      expect(
        applySnapshotLegalTerms(baseLegalTerms, detail).otherLegalTerms
          .dragAlong,
      ).toBe(true);
    });

    it('returns base unchanged when cap_table_detail lacks legal_terms', () => {
      expect(applySnapshotLegalTerms(baseLegalTerms, {})).toEqual(
        baseLegalTerms,
      );
      expect(applySnapshotLegalTerms(baseLegalTerms, null)).toEqual(
        baseLegalTerms,
      );
      expect(applySnapshotLegalTerms(baseLegalTerms, [])).toEqual(
        baseLegalTerms,
      );
      expect(
        applySnapshotLegalTerms(baseLegalTerms, { legal_terms: null }),
      ).toEqual(baseLegalTerms);
    });

    it('preserves base values when snapshot fields are null', () => {
      const detail = {
        legal_terms: { drag_along: null, cumulative_dividends: null },
      };

      const result = applySnapshotLegalTerms(baseLegalTerms, detail);

      expect(result.otherLegalTerms.dragAlong).toBe(
        baseLegalTerms.otherLegalTerms.dragAlong,
      );
      expect(result.dividends.cumulativeDividends).toBe(
        baseLegalTerms.dividends.cumulativeDividends,
      );
    });

    it('clears liq pref when onex_liq_pref_multipliers is false', () => {
      const detail = { legal_terms: { onex_liq_pref_multipliers: false } };
      const result = applySnapshotLegalTerms(baseLegalTerms, detail);
      expect(result.economicRights.liquidationPreferenceSeniority).toEqual([]);
    });

    it('preserves base liq pref when onex_liq_pref_multipliers is null', () => {
      const baseWithLiqPref = {
        ...baseLegalTerms,
        economicRights: {
          ...baseLegalTerms.economicRights,
          liquidationPreferenceSeniority: ['2x'],
        },
      };
      const detail = { legal_terms: { onex_liq_pref_multipliers: null } };
      const result = applySnapshotLegalTerms(baseWithLiqPref, detail);
      expect(result.economicRights.liquidationPreferenceSeniority).toEqual([
        '2x',
      ]);
    });
  });

  describe('portfolio_import legal terms merge in transformInvToPortfolioCompany', () => {
    const baseCompany: InvCompany = {
      id: 1,
      publicId: 'company-lt',
      organizationId: 'org-1',
      companyId: 100,
      status: 'active',
      sector: null,
      tags: null,
      notes: null,
      investmentThesis: null,
      contactPerson: null,
      contactEmail: null,
      externalId: null,
      metadata: {},
      createdAt: '2023-01-01',
      updatedAt: '2024-01-01',
      name: 'LegalCo',
      nameOverride: null,
      domain: null,
      industry: null,
      headquarters: null,
      description: null,
      foundedYear: null,
      legalName: null,
      legalJurisdiction: null,
      entityType: null,
      stageCode: null,
      stageDisplayName: null,
      entryStageCode: null,
      entryStageDisplayName: null,
    };

    const baseValuation: InvCompanyValuation = {
      companyId: 1,
      globalCompanyId: 100,
      organizationId: 'org-1',
      companyName: 'LegalCo',
      companyDomain: null,
      sector: null,
      industry: null,
      headquarters: null,
      status: 'active',
      myFmv: null,
      multiple: null,
      aggregateCost: null,
      realizedProceeds: null,
      ownershipPct: null,
      myFdPct: null,
      myUnits: null,
      postMoneyValuation: null,
      currentPriceUnit: null,
      fullyDilutedTotal: null,
      totalEquityFinancing: null,
      lastTransactionDate: null,
      snapshotDate: null,
      entryDate: null,
      entryAmount: null,
      entryStageCode: null,
      entryStageDisplayName: null,
      currentStageCode: null,
      currentStageDisplayName: null,
      fundIds: null,
      fundNames: null,
      fundShortNames: null,
      primaryFundName: null,
      primaryFundShortName: null,
      maExcludedShare: null,
      maCarriedCost: null,
      maEventDate: null,
    };

    const baseInvestorStatus: InvInvestorStatusResult = {
      hasBoardSeat: false,
      isMajorInvestor: true,
      hasProRataRights: false,
      hasInformationRights: true,
    };

    function makeSnapshot(
      overrides: Partial<InvCapTableSnapshot>,
    ): InvCapTableSnapshot {
      return {
        id: 1,
        companyId: 1,
        organizationId: 'org-1',
        snapshotDate: '2024-06-01',
        snapshotTypeId: null,
        snapshotTypeCode: 'round_close',
        financingRoundId: null,
        fullyDilutedTotal: 10000000,
        totalOutstanding: null,
        impliedValuation: null,
        sharePrice: null,
        commonAuthorized: null,
        commonOutstanding: null,
        preferredAuthorized: null,
        preferredOutstanding: null,
        optionPoolAuthorized: null,
        optionPoolOutstanding: null,
        optionPoolAvailable: null,
        optionPoolFdPercent: null,
        ourTotalShares: null,
        ourCommonShares: null,
        ourPreferredShares: null,
        ourPreferredPct: null,
        ourOwnershipPercent: null,
        ourFdOwnershipPercent: null,
        ourVotingPct: null,
        stageCode: null,
        stageName: null,
        capTableDetail: null,
        ...overrides,
      };
    }

    const portfolioImportDetail = {
      legal_terms: {
        drag_along: true,
        anti_dilution_rights: 'Full Ratchet',
      },
      investor_status: {
        major_investor_status: true,
        our_information_rights: false,
      },
    };

    const structuredInfoRights: InvInformationRights = {
      id: 1,
      companyId: 1,
      organizationId: 'org-1',
      financingRoundId: null,
      effectiveDate: '2024-01-01',
      expirationDate: null,
      isMajorInvestor: true,
      majorInvestorThreshold: null,
      infoRightsForMajor: null,
      infoRightsForAll: null,
      inspectionRights: null,
      capTableAccess: null,
      monthlyBalanceSheet: true,
      monthlyIncomeCashFlows: null,
      monthlyStockholdersEquity: null,
      monthlyCapTable: null,
      monthlyTimingDays: null,
      auditedMonthly: null,
      quarterlyBalanceSheet: null,
      quarterlyIncomeCashFlows: null,
      quarterlyStockholdersEquity: null,
      quarterlyCapTable: null,
      quarterlyTimingDays: null,
      auditedQuarterly: null,
      yearEndBalanceSheet: null,
      yearEndIncomeCashFlows: null,
      yearEndStockholdersEquity: null,
      yearEndCapTable: null,
      yearEndBudgetBusinessPlan: null,
      yearEndTimingDays: null,
      auditedYearEnd: null,
      reportingContactName: null,
      reportingContactEmail: null,
      notes: null,
      metadata: {},
    };

    it('overlays snapshot fields while preserving structured table data', () => {
      const snapshots: InvCapTableSnapshot[] = [
        makeSnapshot({
          id: 2,
          snapshotDate: '2024-06-01',
          snapshotTypeCode: 'portfolio_import',
          capTableDetail: portfolioImportDetail,
        }),
      ];

      const result = transformInvToPortfolioCompany(
        baseCompany,
        baseValuation,
        [],
        [],
        baseInvestorStatus,
        undefined,
        snapshots,
        {
          informationRights: structuredInfoRights,
          roundTerms: null,
          securityTerms: null,
        },
      );

      // Snapshot fields applied
      expect(result.legalTerms!.otherLegalTerms.dragAlong).toBe(true);
      expect(result.legalTerms!.economicRights.antiDilutionRights).toBe(
        'Full Ratchet',
      );
      expect(result.legalTerms!.headerStatus.majorInvestorStatus).toBe(true);
      expect(result.legalTerms!.headerStatus.informationRights).toBe(false);

      // Structured table data preserved (monthlyBalanceSheet: true from structuredInfoRights)
      expect(result.legalTerms!.informationRights.balanceSheet.monthly).toBe(
        true,
      );
    });

    // (company_id, snapshot_date) is not unique, so a round_close and a
    // portfolio_import snapshot can share a date. The highest id wins, matching
    // the tie-break every other "latest snapshot" lookup uses.
    it('breaks a snapshot date tie on the highest id', () => {
      const snapshots: InvCapTableSnapshot[] = [
        makeSnapshot({
          id: 1,
          snapshotDate: '2024-06-01',
          snapshotTypeCode: 'round_close',
        }),
        makeSnapshot({
          id: 2,
          snapshotDate: '2024-06-01',
          snapshotTypeCode: 'portfolio_import',
          capTableDetail: portfolioImportDetail,
        }),
      ];

      const result = transformInvToPortfolioCompany(
        baseCompany,
        baseValuation,
        [],
        [],
        baseInvestorStatus,
        undefined,
        snapshots,
        { informationRights: null, roundTerms: null, securityTerms: null },
      );

      // The portfolio_import overlay ran, so id 2 was the chosen snapshot.
      expect(result.legalTerms!.otherLegalTerms.dragAlong).toBe(true);
      expect(result.legalTerms!.headerStatus.informationRights).toBe(false);
    });

    it('uses only structured terms when latest snapshot is not portfolio_import', () => {
      const snapshots: InvCapTableSnapshot[] = [
        makeSnapshot({
          snapshotDate: '2024-06-01',
          snapshotTypeCode: 'round_close',
        }),
      ];

      const result = transformInvToPortfolioCompany(
        baseCompany,
        baseValuation,
        [],
        [],
        baseInvestorStatus,
        undefined,
        snapshots,
        { informationRights: null, roundTerms: null, securityTerms: null },
      );

      expect(result.legalTerms!.headerStatus.majorInvestorStatus).toBe(true);
      expect(result.legalTerms!.headerStatus.informationRights).toBe(true);
    });
  });
});

describe('toOverriddenLegalTermsKeys', () => {
  const meta = {
    overrideId: 'ov-1',
    fieldKey: 'x',
    originalValue: null,
    overrideValue: true,
    reason: '',
    createdBy: 'user-1',
    createdAt: '2026-07-01T00:00:00Z',
  };

  // The MCP company tool exists to mirror the page, so both derive their overlay
  // suppression sets from here; a group missing from the helper would let one
  // surface apply a snapshot overlay the other suppresses.
  it('covers every OverriddenLegalTermsKeys group', () => {
    const keys = toOverriddenLegalTermsKeys({
      roundTermsId: 1,
      informationRightsId: 2,
      securityTermsId: 3,
      values: {
        antiDilutionType: null,
        liquidationSeniority: null,
        dividendRate: null,
        dividendSeniority: null,
      },
      overridden: {
        roundTerms: { drag_along: meta },
        informationRights: { is_major_investor: meta },
        securityTerms: { dividend_rate: meta },
      },
    });

    expect([...(keys.roundTerms ?? [])]).toEqual(['drag_along']);
    expect([...(keys.informationRights ?? [])]).toEqual(['is_major_investor']);
    expect([...(keys.securityTerms ?? [])]).toEqual(['dividend_rate']);
  });
});

describe('transformInvToPortfolioCompany granular stages', () => {
  function companyWithStage(stageCode: string | null): InvCompany {
    return {
      id: 1,
      publicId: 'company-granular-stage',
      organizationId: 'org-1',
      companyId: 100,
      status: 'active',
      sector: null,
      tags: [],
      notes: null,
      investmentThesis: null,
      contactPerson: null,
      contactEmail: null,
      externalId: null,
      metadata: {},
      createdAt: '2023-01-01',
      updatedAt: '2024-01-01',
      name: 'StageCo',
      nameOverride: null,
      domain: null,
      industry: null,
      headquarters: null,
      description: null,
      foundedYear: null,
      legalName: null,
      legalJurisdiction: null,
      entityType: null,
      stageCode,
      stageDisplayName: null,
      entryStageCode: null,
      entryStageDisplayName: null,
    };
  }

  function emptyValuation(): InvCompanyValuation {
    return {
      companyId: 1,
      globalCompanyId: 100,
      organizationId: 'org-1',
      companyName: 'StageCo',
      companyDomain: null,
      sector: null,
      industry: null,
      headquarters: null,
      status: 'active',
      myFmv: 1000,
      multiple: null,
      aggregateCost: 500,
      realizedProceeds: null,
      ownershipPct: null,
      myFdPct: null,
      myUnits: null,
      postMoneyValuation: null,
      currentPriceUnit: null,
      fullyDilutedTotal: null,
      totalEquityFinancing: null,
      lastTransactionDate: null,
      snapshotDate: null,
      entryDate: null,
      entryAmount: null,
      entryStageCode: null,
      entryStageDisplayName: null,
      currentStageCode: null,
      currentStageDisplayName: null,
      fundIds: null,
      fundNames: null,
      fundShortNames: null,
      primaryFundName: null,
      primaryFundShortName: null,
      maExcludedShare: null,
      maCarriedCost: null,
      maEventDate: null,
    };
  }

  function transform(stageCode: string | null) {
    return transformInvToPortfolioCompany(
      companyWithStage(stageCode),
      emptyValuation(),
      [],
      [],
      {
        hasBoardSeat: false,
        isMajorInvestor: false,
        hasProRataRights: false,
        hasInformationRights: false,
      },
    );
  }

  it('carries a numbered sub-stage through as its own stage', () => {
    expect(transform('series_a_1').stage).toBe('Series A-1');
  });

  it('carries an extension through as its own stage', () => {
    expect(transform('series_a_ext').stage).toBe('Series A Extension');
  });

  it('still carries a plain stage', () => {
    expect(transform('series_a').stage).toBe('Series A');
  });

  it('leaves stage undefined when there is none', () => {
    expect(transform(null).stage).toBeUndefined();
  });
});
