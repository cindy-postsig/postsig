/**
 * Browser-side reading of a SID CSV for display. Mirrors the importer's
 * `readSidRecords` rules (latin1, NUL block padding, `;` or `,` delimiter)
 * without its Node-only csv-parse dependency or header validation.
 */

const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * Byte-for-byte like Node's `latin1`: the browser's `TextDecoder('latin1')`
 * is really windows-1252 and would turn 0x80-0x9F into other characters.
 */
export function decodeSidCsv(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const hasBom = UTF8_BOM.every((byte, index) => view[index] === byte);
  let text = '';
  for (let i = hasBom ? UTF8_BOM.length : 0; i < view.length; i++) {
    if (view[i] !== 0) text += String.fromCharCode(view[i]);
  }
  return text;
}

export function detectDelimiter(text: string): ',' | ';' {
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  return count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';
}

/** Quote-aware split of CSV text into rows; blank rows are dropped. */
export function parseCsvText(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = '';
  let inQuotes = false;

  const endField = () => {
    fields.push(current);
    current = '';
  };
  const endRow = () => {
    endField();
    if (fields.some((cell) => cell.trim() !== '')) rows.push(fields);
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i++;
    } else if (ch === '\n' || ch === '\r') {
      endRow();
    } else {
      current += ch;
    }
  }
  if (current !== '' || fields.length > 0) endRow();

  return rows;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}
