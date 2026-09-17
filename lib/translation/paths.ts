/** Naming rules for translated contract documents. */

export const TRANSLATION_TARGET_LANGUAGE = 'en';

const TRANSLATED_MARKER = `.${TRANSLATION_TARGET_LANGUAGE}`;

/**
 * Derives the translated file name for an original document.
 * `abc.pdf` -> `abc.en.pdf`; an extensionless name gets the marker
 * appended.
 */
export const translatedFileName = (fileName: string): string => {
  const divider = fileName.lastIndexOf('.');
  if (divider <= 0) {
    return `${fileName}${TRANSLATED_MARKER}`;
  }
  const baseName = fileName.substring(0, divider);
  const extension = fileName.substring(divider);
  return `${baseName}${TRANSLATED_MARKER}${extension}`;
};
