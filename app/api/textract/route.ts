import { NextResponse, NextRequest } from 'next/server';
import { extractTextFromPdf, organizeTextBlocks } from '@/app/lib/aws/textract';
import { createApiErrorHandler } from '@/lib/middleware/errorHandler';

export async function POST(request: NextRequest) {
  try {
    const { pdfBase64 } = await request.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: 'Missing PDF data' }, { status: 400 });
    }

    // Extract text from the PDF using AWS Textract
    const textBlocks = await extractTextFromPdf(pdfBase64);

    // Organize text blocks by page
    const organizedText = organizeTextBlocks(textBlocks);

    // Convert Map to array for JSON serialization
    const result = Array.from(organizedText.entries()).map(
      ([pageNumber, blocks]) => ({
        pageNumber,
        blocks,
      }),
    );

    return NextResponse.json({ result });
  } catch (error) {
    const handleError = createApiErrorHandler();
    return handleError(error, request);
  }
}
