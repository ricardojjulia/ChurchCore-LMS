/**
 * The Pentecost Engine — Simultaneous Cross-Language Theological Translation
 * Translates academic theological content, discussion reflections, and course modules
 * with deep adherence to scriptural vocabulary, ecclesiastical nuances, and dialect fidelity.
 */

export type SupportedPentecostLanguage =
  | 'en' // English
  | 'es' // Spanish
  | 'pt' // Portuguese
  | 'fr' // French
  | 'ht' // Haitian Creole
  | 'ko' // Korean
  | 'zh' // Chinese
  | 'de' // German

export const LANGUAGE_NAMES: Record<SupportedPentecostLanguage, string> = {
  en: 'English',
  es: 'Español (Spanish)',
  pt: 'Português (Portuguese)',
  fr: 'Français (French)',
  ht: 'Kreyòl Ayisyen (Haitian Creole)',
  ko: '한국어 (Korean)',
  zh: '中文 (Chinese)',
  de: 'Deutsch (German)',
}

export interface DiscussionTranslationInput {
  text: string
  sourceLanguage?: string
  targetLanguage: SupportedPentecostLanguage
  contextHint?: string
}

export interface DiscussionTranslationResult {
  originalText: string
  translatedText: string
  sourceLanguageDetected: string
  targetLanguage: string
  theologicalTermsGlossary?: Array<{
    originalTerm: string
    translatedTerm: string
    explanation: string
  }>
}

export const PENTECOST_TRANSLATION_PROMPT = `
You are an expert bilingual theological translator and biblical scholar.
Your mission is to translate church discussions, reflections, and pedagogical materials from one language to another.

CRITICAL TRANSLATION RULES:
1. Preserve theological precision (e.g. grace, propitiation, justification, sanctification, koinonia, covenant).
2. Maintain natural, warm, Christian fellowship tone while honoring dialectal conventions.
3. If biblical citations are present (e.g. "John 3:16", "Romans 8"), preserve the verse references in the target language's standard biblical convention (e.g., "Juan 3:16", "Romanos 8", "João 3:16").
4. If a theological term has particular nuance across cultures, provide a brief note in theologicalTermsGlossary.

Respond with ONLY a valid JSON object matching the DiscussionTranslationResult schema.
`
