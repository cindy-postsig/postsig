import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import responseData from './response';

// Configure the AWS Textract client
const client = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface TextractBlock {
  id: string;
  text: string;
  type: string;
  confidence: number;
  pageNumber: number;
  boundingBox: {
    // Support both formats
    width?: number;
    height?: number;
    left?: number;
    top?: number;
    // New x0,y0,x1,y1 format
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
  };
}

/**
 * Extracts text from a PDF document using AWS Textract
 *
 * @param pdfBase64 - The PDF document as a base64 encoded string
 * @returns An array of text blocks with position information
 */
export async function extractTextFromPdf(
  pdfBase64: string,
): Promise<TextractBlock[]> {
  try {
    // Remove the data URL prefix if present
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

    // Create the command to detect text in the document
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: Buffer.from(base64Data, 'base64'),
      },
    });

    // Send the command to AWS Textract
    // const response = await client.send(command);
    const response = responseData;

    // Process and format the response
    const blocks: TextractBlock[] = [];

    if (response.Blocks) {
      response.Blocks.forEach((block, index) => {
        if (block.BlockType === 'LINE' || block.BlockType === 'WORD') {
          if (
            block.Text &&
            block.Geometry?.BoundingBox &&
            block.BlockType === 'LINE'
          ) {
            blocks.push({
              id: block.Id || `block-${index}`,
              text: block.Text,
              type: block.BlockType.toLowerCase(),
              confidence: block.Confidence || 0,
              pageNumber: block.Page,
              boundingBox: {
                width: block.Geometry.BoundingBox.Width || 0,
                height: block.Geometry.BoundingBox.Height || 0,
                left: block.Geometry.BoundingBox.Left || 0,
                top: block.Geometry.BoundingBox.Top || 0,
                x0: block.Geometry.BoundingBox.x0 || 0,
                y0: block.Geometry.BoundingBox.y0 || 0,
                x1: block.Geometry.BoundingBox.x1 || 0,
                y1: block.Geometry.BoundingBox.y1 || 0,
              },
            });
          }
        }
      });
    }

    return blocks;
  } catch (error) {
    console.error('Error extracting text with AWS Textract:', error);
    throw error;
  }
}

/**
 * Groups text blocks by page and organizes them into paragraphs
 *
 * @param blocks - Text blocks extracted from Textract
 * @returns Organized text blocks grouped by page and paragraph
 */
export function organizeTextBlocks(blocks: TextractBlock[]) {
  // Group blocks by page
  const pageMap = new Map<number, TextractBlock[]>();

  blocks.forEach((block) => {
    if (!pageMap.has(block.pageNumber)) {
      pageMap.set(block.pageNumber, []);
    }
    pageMap.get(block.pageNumber)?.push(block);
  });

  // Sort blocks by position (top to bottom, left to right)
  pageMap.forEach((pageBlocks, pageNumber) => {
    pageBlocks.sort((a, b) => {
      // Group by vertical position first (with some tolerance for same line)
      const verticalTolerance = 0.01;
      if (
        Math.abs((a.boundingBox.top || 0) - (b.boundingBox.top || 0)) >
        verticalTolerance
      ) {
        return (a.boundingBox.top || 0) - (b.boundingBox.top || 0);
      }
      // Then sort by horizontal position
      return (a.boundingBox.left || 0) - (b.boundingBox.left || 0);
    });

    pageMap.set(pageNumber, pageBlocks);
  });

  return pageMap;
}
