export interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  emailSubject?: string;
  createdDateTime: string;
  completedDateTime?: string;
  statusChangedDateTime?: string;
}

export interface DocuSignDocument {
  documentId: string;
  name: string;
  type?: string;
  uri?: string;
}
