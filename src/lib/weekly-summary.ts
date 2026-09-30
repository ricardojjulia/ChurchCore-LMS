import { callOpenRouter, OPENROUTER_DEFAULT_MODELS, getOpenRouterApiKey } from './openrouter'

// Weekly progress summary shared by the student-facing route
// (/api/ai/weekly-summary) and the scheduler route used by the weekly-digest
// Edge Function (/api/cron/weekly-summary). The prompt carries course titles
// and grades only — no names, emails or ids (CLAUDE.md rule 8).
interface PerfRow {
  course_title:       string
  enrollment_status:  string
  progress_percent:   number
  average_grade:      number | null
  letter_grade:       string
  gpa_points:         number | null
  total_submissions:  number
  graded_submissions: number
  is_at_risk:         boolean
}

export type WeeklySummary =
  | { ok: true; summary: string; coursesInProgress: number }
  | { ok: false; status: 502 | 503 }

export async function buildWeeklySummary(perf: unknown, gpa: unknown): Promise<WeeklySummary> {
  const rows = (perf ?? []) as PerfRow[]

  if (rows.length === 0) {
    return {
      ok: true,
      coursesInProgress: 0,
      summary: "You haven't enrolled in any courses yet. Head to the catalog and pick something that interests you!",
    }
  }

  const atRisk    = rows.filter((r) => r.is_at_risk)
  const inProg    = rows.filter((r) => r.enrollment_status === 'in_progress')
  const completed = rows.filter((r) => r.enrollment_status === 'completed')

  const courseLines = rows.map((r) =>
    `- ${r.course_title}: ${r.progress_percent}% complete, grade ${r.average_grade !== null ? `${r.average_grade}% (${r.letter_grade})` : 'no grades yet'}, ${r.graded_submissions}/${r.total_submissions} submissions graded${r.is_at_risk ? ' ⚠ AT-RISK' : ''}`
  ).join('\n')

  const prompt = `You are a friendly, encouraging academic advisor for a church learning management system called ChurchCore LMS. Write a brief, warm weekly progress summary for this student. Be specific about their courses but keep it upbeat and motivating. Under 120 words. No bullet points — 2-3 flowing sentences.

Student data:
- Overall GPA: ${gpa !== null ? gpa : 'N/A'}
- Courses in progress: ${inProg.length}
- Courses completed: ${completed.length}
- At-risk courses: ${atRisk.length}
${courseLines}

Write the summary now:`

  const apiKey = getOpenRouterApiKey()
  if (!apiKey) return { ok: false, status: 503 }

  // If OPENROUTER_API_KEY or OPENAI_API_KEY is present, or if falling back:
  const res = await callOpenRouter({
    task: 'summary',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 250,
  })

  if (!res.ok || !res.text) {
    return { ok: false, status: (res.status === 503 ? 503 : 502) as 502 | 503 }
  }

  const summary = res.text.trim() || 'Unable to generate summary right now.'
  return { ok: true, summary, coursesInProgress: inProg.length }
}
