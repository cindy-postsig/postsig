export interface NewUploadsDTO {
  id: string;
  status_id: number;
  ai_extraction: Record<string, unknown>;
  ai_extraction_status: string;
  contract_docs: {
    file_path: string;
  }[];
  users: {
    id: string;
    email: string;
    name: string;
    organizations: {
      id: string;
      name: string;
    };
  };
}

export type SummaryRow = {
  uid: string;
  username: string;
  count: number;
  failedCount: number;
};

export type NewUploadsSummary = {
  orgName: string;
  data: SummaryRow[];
};

export type FailedRow = {
  contractId: string;
  uid: string;
  username: string;
  orgName: string;
  docFileName: string;
};

export type NewUploadsEmailData = {
  summary: NewUploadsSummary[];
  isFailed:
    | false
    | {
        data: FailedRow[];
      };
};
