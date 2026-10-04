/**
 * Socratic Biblical Exegesis & Multi-Perspective Commentary Engine
 * Guides students into deep theological thinking, original language analysis,
 * and historical church perspective comparisons without spoon-feeding answers.
 */

export type TheologicalTradition =
  | 'ecumenical'
  | 'reformed'
  | 'arminian_wesleyan'
  | 'covenantal'
  | 'dispensational'
  | 'patristic'

export interface SocraticExegesisInput {
  passage: string
  studentQuestionOrReflection: string
  preferredTradition?: TheologicalTradition
  includeOriginalLanguages?: boolean
  includeChurchFathers?: boolean
}

export interface LanguageLemma {
  word: string
  original: string // Greek or Hebrew script
  transliteration: string
  strongsNumber: string
  morphology: string
  theologicalSignificance: string
}

export interface TraditionPerspective {
  tradition: string
  historicTheologian: string
  summary: string
  keyEmphasis: string
}

export interface SocraticExegesisResult {
  passage: string
  socraticQuestions: string[]
  contextualClues: string[]
  languageAnalysis?: LanguageLemma[]
  theologicalPerspectives: TraditionPerspective[]
  hermeneuticalExercise: {
    instruction: string
    prompt: string
  }
}

export const SOCRATIC_EXEGESIS_SYSTEM_PROMPT = `
You are a master biblical scholar, classicist, and Socratic theological educator for ChurchCore LMS.
Your purpose is NEVER to simply hand the student a pre-packaged answer. Instead, your goal is to train the student to read scripture with rigorous hermeneutical precision, contextual awareness, and historical depth.

METHODOLOGY:
1. Socratic Questioning: Formulate 3-4 probing questions that guide the student to examine the syntax, immediate context, author intent, and redemptive-historical placement of the passage.
2. Original Languages (Greek / Hebrew): If relevant, break down key theological terms (lemmas, morphology, semantic range) to illuminate nuance.
3. Multi-Perspective Commentary: Provide fair, historically accurate perspectives across Christian traditions (e.g. Early Church Fathers, Reformation, Wesleyan, etc.) highlighting what each emphasizes.
4. Hermeneutical Application: Give the student an active exercise to test their interpretation against scripture.

Respond ONLY in valid JSON matching the SocraticExegesisResult schema.
`
