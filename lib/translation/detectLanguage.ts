import _ from 'lodash';
import logger from '@/utils/pino';
import { processWithGemini } from '@/lib/google';
import { languageQueries } from '@/constants/prompts';
import { TRANSLATION_TARGET_LANGUAGE } from './paths';

/** Detects the language a contract document is written in. */

const UNDETERMINED = 'und';

const DETECTION_SYSTEM_PROMPT =
  'You are a language identification expert. You determine the language a legal document is written in and answer with ISO 639-1 codes.';

const normaliseLanguageCode = (raw: unknown): string => {
  if (typeof raw !== 'string') {
    return UNDETERMINED;
  }
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^([a-z]{2})(?:[-_][a-z0-9]+)*$/);
  return match ? match[1] : UNDETERMINED;
};

export interface DetectedLanguage {
  languageCode: string;
  confidence: string | null;
  needsTranslation: boolean;
  sourceLanguage: string | null;
}

const isUsableSource = (code: string): boolean =>
  code !== UNDETERMINED && code !== TRANSLATION_TARGET_LANGUAGE;

export const detectDocumentLanguage = async (
  filePath: string,
): Promise<DetectedLanguage> => {
  const { data } = await processWithGemini(
    filePath,
    languageQueries,
    DETECTION_SYSTEM_PROMPT,
  );

  const languageCode = normaliseLanguageCode(_.get(data, 'language_code'));
  const rawConfidence = _.get(data, 'confidence');
  const rawNonEnglishFlag = _.get(data, 'has_non_english_body_text');
  const isEnglishMajority = languageCode === TRANSLATION_TARGET_LANGUAGE;

  if (isEnglishMajority && typeof rawNonEnglishFlag !== 'boolean') {
    logger.warn(
      { filePath, received: rawNonEnglishFlag },
      'Language detection gave no usable has_non_english_body_text flag; translating rather than assuming English',
    );
  }

  // The majority language is the better source when it is foreign; the dedicated
  // field is what covers a document whose majority is English.
  const nonEnglishLanguage = normaliseLanguageCode(
    _.get(data, 'non_english_language_code'),
  );
  const sourceLanguage = [languageCode, nonEnglishLanguage].find(
    isUsableSource,
  );

  return {
    languageCode,
    confidence: typeof rawConfidence === 'string' ? rawConfidence : null,
    needsTranslation: !isEnglishMajority || rawNonEnglishFlag !== false,
    sourceLanguage: sourceLanguage ?? null,
  };
};
