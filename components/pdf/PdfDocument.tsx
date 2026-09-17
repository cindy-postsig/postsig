'use client';

import { ComponentProps } from 'react';
import { Document, pdfjs } from 'react-pdf';
import { PDF_DOCUMENT_OPTIONS } from './pdf-document-options';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

type PdfDocumentProps = Omit<ComponentProps<typeof Document>, 'options'>;

const PdfDocument = (props: PdfDocumentProps) => (
  <Document {...props} options={PDF_DOCUMENT_OPTIONS} />
);

export default PdfDocument;
