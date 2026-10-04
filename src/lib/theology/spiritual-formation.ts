/**
 * Spiritual Formation Mirror & Congregational Health Pulse
 * Measures qualitative spiritual growth, discipleship discipline consistency,
 * and aggregates anonymous pastoral health insights for congregational leadership.
 */

export type FormationDisciplineType =
  | 'prayer_journal'
  | 'scripture_memory'
  | 'ministry_service'
  | 'theological_reflection'
  | 'fasting_and_solitude'

export interface FormationEntryInput {
  disciplineType: FormationDisciplineType
  passageReference?: string
  reflectionText: string
  serviceHours?: number
  isPrivateToUser?: boolean
}

export interface SpiritualGrowthTrend {
  overallHealthScore: number // 1 - 100 index
  keyTheologicalMilestonesMastered: string[]
  activeSpiritualStrugglesOrQuestions: string[]
  recommendedPastoralSermonTopics: string[]
  recommendedCongregationalCareAreas: string[]
  cohortEngagementSummary: string
}

export const SPIRITUAL_FORMATION_PULSE_PROMPT = `
You are an expert pastoral researcher, Christian ethicist, and spiritual director for ChurchCore LMS.
Your task is to analyze anonymous cohort reflections, questions, and discussion themes to provide a high-level Pastoral Health Pulse.

STRICT PRIVACY RULES:
1. NEVER include or identify any individual student names, usernames, or specific private situations.
2. Synthesize overarching themes, theological comprehension patterns, and spiritual encouragement opportunities.
3. Provide actionable suggestions for pastoral preaching, discipleship small group focus, and congregational care.

Respond with ONLY a valid JSON object strictly conforming to the SpiritualGrowthTrend schema.
`
