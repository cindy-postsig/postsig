import { detectDocumentLanguage } from '../detectLanguage';
import { processWithGemini } from '@/lib/google';

jest.mock('@/lib/google', () => ({
  processWithGemini: jest.fn(),
}));

const mockProcessWithGemini = processWithGemini as jest.MockedFunction<
  typeof processWithGemini
>;

const geminiResult = (data: unknown) =>
  ({
    data,
    usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
  }) as Awaited<ReturnType<typeof processWithGemini>>;

describe('detectDocumentLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flags a non-English document for translation', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'de', confidence: 'high' }),
    );

    await expect(detectDocumentLanguage('uid/berenberg.pdf')).resolves.toEqual({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
      sourceLanguage: 'de',
    });
  });

  it('does not flag an English document', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({
        language_code: 'en',
        has_non_english_body_text: false,
        confidence: 'high',
      }),
    );

    const result = await detectDocumentLanguage('uid/acme.pdf');

    expect(result.languageCode).toBe('en');
    expect(result.needsTranslation).toBe(false);
  });

  it('collapses a locale-shaped answer so English is not translated', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({
        language_code: 'en-US',
        has_non_english_body_text: false,
        confidence: 'high',
      }),
    );

    const result = await detectDocumentLanguage('uid/acme.pdf');

    expect(result.languageCode).toBe('en');
    expect(result.needsTranslation).toBe(false);
  });

  it('collapses a locale-shaped answer for a non-English document', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'de_DE', confidence: 'high' }),
    );

    const result = await detectDocumentLanguage('uid/berenberg.pdf');

    expect(result.languageCode).toBe('de');
    expect(result.needsTranslation).toBe(true);
  });

  it.each([
    ['eng', 'a three-letter code'],
    ['English', 'a language name'],
    ['e', 'a single letter'],
    ['', 'an empty string'],
    ['not a language', 'prose'],
  ])('treats %s (%s) as undetermined', async (code) => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: code, confidence: 'low' }),
    );

    const result = await detectDocumentLanguage('uid/odd.pdf');

    expect(result.languageCode).toBe('und');
    expect(result.needsTranslation).toBe(true);
  });

  it('normalises casing and whitespace from the model', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: ' DE ', confidence: 'medium' }),
    );

    const result = await detectDocumentLanguage('uid/berenberg.pdf');

    expect(result.languageCode).toBe('de');
    expect(result.needsTranslation).toBe(true);
  });

  it('translates rather than skipping when the language is undetermined', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'und', confidence: 'low' }),
    );

    const result = await detectDocumentLanguage('uid/scan.pdf');

    expect(result.languageCode).toBe('und');
    expect(result.needsTranslation).toBe(true);
  });

  it('falls back to undetermined when the model returns nothing usable', async () => {
    mockProcessWithGemini.mockResolvedValue(geminiResult(null));

    await expect(detectDocumentLanguage('uid/empty.pdf')).resolves.toEqual({
      languageCode: 'und',
      confidence: null,
      needsTranslation: true,
      sourceLanguage: null,
    });
  });

  it('translates an English-majority document carrying foreign clauses', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({
        language_code: 'en',
        has_non_english_body_text: true,
        confidence: 'high',
      }),
    );

    const result = await detectDocumentLanguage('uid/mixed.pdf');

    expect(result.languageCode).toBe('en');
    expect(result.needsTranslation).toBe(true);
  });

  it('leaves a wholly English document alone when the flag is false', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({
        language_code: 'en',
        has_non_english_body_text: false,
        confidence: 'high',
      }),
    );

    const result = await detectDocumentLanguage('uid/acme.pdf');

    expect(result.needsTranslation).toBe(false);
  });

  // Only an explicit `false` rules out foreign text; anything else never
  // answered the question, and skipping on it is the bug this flag exists for.
  it.each([[null], [undefined], ['true'], ['false'], [0]])(
    'translates an English document on a non-boolean flag (%s)',
    async (flag) => {
      mockProcessWithGemini.mockResolvedValue(
        geminiResult({
          language_code: 'en',
          has_non_english_body_text: flag,
          confidence: 'high',
        }),
      );

      const result = await detectDocumentLanguage('uid/acme.pdf');

      expect(result.needsTranslation).toBe(true);
    },
  );

  it('translates an English document that omits the flag entirely', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'en', confidence: 'high' }),
    );

    const result = await detectDocumentLanguage('uid/acme.pdf');

    expect(result.needsTranslation).toBe(true);
  });

  it('asks the model whether any body text is non-English', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'en', confidence: 'high' }),
    );

    await detectDocumentLanguage('uid/acme.pdf');

    expect(mockProcessWithGemini).toHaveBeenCalledWith(
      'uid/acme.pdf',
      expect.arrayContaining([
        expect.objectContaining({ dbName: 'has_non_english_body_text' }),
      ]),
      expect.any(String),
    );
  });

  it('passes the document path through to Gemini', async () => {
    mockProcessWithGemini.mockResolvedValue(
      geminiResult({ language_code: 'en', confidence: 'high' }),
    );

    await detectDocumentLanguage('uid/acme.pdf');

    expect(mockProcessWithGemini).toHaveBeenCalledWith(
      'uid/acme.pdf',
      expect.arrayContaining([
        expect.objectContaining({ dbName: 'language_code' }),
      ]),
      expect.any(String),
    );
  });

  describe('sourceLanguage', () => {
    it('uses the majority language when it is already foreign', async () => {
      mockProcessWithGemini.mockResolvedValue(
        geminiResult({ language_code: 'hi', confidence: 'high' }),
      );

      const result = await detectDocumentLanguage('uid/deed.pdf');

      expect(result.sourceLanguage).toBe('hi');
    });

    it('falls back to the foreign-clause language on an English-majority file', async () => {
      mockProcessWithGemini.mockResolvedValue(
        geminiResult({
          language_code: 'en',
          has_non_english_body_text: true,
          non_english_language_code: 'de',
          confidence: 'high',
        }),
      );

      const result = await detectDocumentLanguage('uid/mixed.pdf');

      expect(result.languageCode).toBe('en');
      expect(result.needsTranslation).toBe(true);
      // Without this DeepL auto-detects English and refuses the whole job.
      expect(result.sourceLanguage).toBe('de');
    });

    it('rescues an undetermined majority with the foreign-clause language', async () => {
      mockProcessWithGemini.mockResolvedValue(
        geminiResult({
          language_code: 'und',
          non_english_language_code: 'fr',
          confidence: 'low',
        }),
      );

      const result = await detectDocumentLanguage('uid/scan.pdf');

      expect(result.sourceLanguage).toBe('fr');
    });

    it.each([['en'], ['und'], [null], ['nonsense']])(
      'leaves the source unset when the foreign code is %s',
      async (code) => {
        mockProcessWithGemini.mockResolvedValue(
          geminiResult({
            language_code: 'en',
            has_non_english_body_text: true,
            non_english_language_code: code,
            confidence: 'high',
          }),
        );

        const result = await detectDocumentLanguage('uid/mixed.pdf');

        // Still translates; DeepL is simply left to auto-detect.
        expect(result.needsTranslation).toBe(true);
        expect(result.sourceLanguage).toBeNull();
      },
    );
  });
});
