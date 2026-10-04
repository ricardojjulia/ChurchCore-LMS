/**
 * Sermon-to-Curriculum ("Pulpit-to-Pathway") Transformer
 * Translates homiletical sermon manuscripts and teaching transcripts into 
 * pedagogical course curriculum, small group guides, and daily micro-devotionals.
 */

export interface SermonInput {
  sermonTitle?: string
  speakerName?: string
  passageReference?: string
  sermonText: string
  targetDurationWeeks?: number
  language?: 'en' | 'es' | 'pt'
  includeSmallGroupGuide?: boolean
  includeDailyDevotionals?: boolean
}

export interface GeneratedDevotional {
  day: number
  title: string
  scripture: string
  reflection: string
  prayerFocus: string
}

export interface GeneratedDiscussionPrompt {
  topic: string
  icebreaker: string
  observationQuestions: string[]
  interpretationQuestions: string[]
  applicationQuestions: string[]
  leaderNotes: string
}

export interface GeneratedSermonCourse {
  course_title: string
  course_description: string
  biblical_passages: string[]
  theological_themes: string[]
  target_audience: string
  small_group_guide?: GeneratedDiscussionPrompt
  daily_devotionals?: GeneratedDevotional[]
  modules: Array<{
    title: string
    description?: string
    blocks: Array<{
      title: string
      type: 'page' | 'quiz' | 'discussion' | 'assignment'
      objective?: string
      content: {
        body?: string
        prompt?: string
        instructions?: string
        max_points?: number
        questions?: Array<{
          id: string
          text: string
          type: 'multiple_choice'
          options: string[]
          correct_index: number
          points: number
          explanation: string
        }>
      }
    }>
  }>
}

export const SERMON_TRANSFORMER_PROMPT = `
You are an expert biblical theologian and Christian instructional designer.
Your task is to transform a Sunday sermon manuscript or teaching transcript into a multi-week, interactive discipleship curriculum ("Pulpit-to-Pathway").

CRITICAL PEDAGOGICAL RULES:
1. Preserve the preacher's core biblical thesis, illustrations, and homiletical power while converting spoken sermon language into structured learning lessons.
2. Structure the course into 3 to 5 logical modules (e.g. Exegesis of the Passage, Cultural & Personal Blindspots, The Gospel Solution, Practical Life Application).
3. Include rich HTML lesson content in "page" blocks (using <h3>, <p>, <blockquote> for Bible verses, <ul>/<li> for practical applications, <strong> for key biblical terms).
4. If requested, provide a comprehensive Small Group Leader Guide with inductive Bible study questions (Observation -> Interpretation -> Application).
5. If requested, generate a 5-day devotional plan (Monday-Friday) with daily scripture reading and prayer points.
6. Provide meaningful interactive multiple-choice quiz questions with biblical explanations for correct answers.
7. Always match the primary language of the sermon (English, Spanish, or Portuguese).

OUTPUT FORMAT:
Respond with ONLY a valid JSON object strictly conforming to the GeneratedSermonCourse schema. No markdown backticks or commentary outside JSON.
`
