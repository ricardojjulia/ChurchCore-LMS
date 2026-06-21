// Confusion Topics API — ADR-2025-003 Phase 4
// POST /api/ai/confusion-topics
// Body: { sectionId: string }
//
// Staff-only. Analyzes ai_query_log for a section to identify
// likely curriculum gaps — queries with low similarity scores
// indicate students asked questions the content doesn't answer well.
// Uses GPT-4o to synthesize a gap analysis from content samples.
//
// Security: staff-only; no query text stored or transmitted;
// ai_query_log only exposes similarity stats and section_id.

import { NextRequest } from 'next/server'
import { createClient }  from '@/utils/supabase/server'
import { heavyLimiter, checkLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const OPENAI_COMPLETION_MODEL = 'gpt-4o'
const LOW_SIMILARITY_THRESHOLD = 0.80
const MIN_QUERIES_FOR_SIGNAL = 3
const MAX_CONTENT_SAMPLE_CHUNKS = 15

export async function POST(req: NextRequest) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_KEY) return Response.json({ error: 'AI not configured' }, { status: 503 })

  let body: { sectionId?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { sectionId } = body
  if (!sectionId) return Response.json({ error: 'sectionId is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!me || !['admin', 'manager', 'teacher'].includes(me.role)) {
    return Response.json({ error: 'Staff access required' }, { status: 403 })
  }

  const rl = await checkLimit(heavyLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Too many requests. Please wait before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After':           String(rl.retryAfter),
          'X-RateLimit-Limit':     String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // ── Query log stats for this section ──────────────────────
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: logs } = await supabase
    .from('ai_query_log')
    .select('similarity_max, similarity_min, chunk_count, context_version')
    .eq('section_id', sectionId)
    .gte('responded_at', since)

  const entries = logs ?? []

  if (entries.length < MIN_QUERIES_FOR_SIGNAL) {
    return Response.json({
      analysis: null,
      reason:   `Not enough queries yet (${entries.length} in last 30 days; need at least ${MIN_QUERIES_FOR_SIGNAL}).`,
      stats:    { total: entries.length, lowSimilarity: 0, zeroMatch: 0 },
    })
  }

  const lowSimilarity = entries.filter(
    (e) => e.similarity_max !== null && e.similarity_max < LOW_SIMILARITY_THRESHOLD
  ).length
  const zeroMatch = entries.filter((e) => e.chunk_count === 0).length
  const avgBestMatch = entries
    .filter((e) => e.similarity_max !== null)
    .reduce((s, e) => s + (e.similarity_max ?? 0), 0) / entries.length

  // ── Sample content chunks from this section ────────────────
  const { data: sectionInfo } = await supabase
    .from('course_sections')
    .select('section_code, course_blueprints ( title )')
    .eq('id', sectionId)
    .single()

  const { data: chunks } = await supabase
    .from('embeddings')
    .select('chunk_text, source_id')
    .eq('section_id', sectionId)
    .eq('is_active',  true)
    .limit(MAX_CONTENT_SAMPLE_CHUNKS)

  const blueprint = sectionInfo?.course_blueprints as unknown as { title: string } | null
  const courseTitle = blueprint?.title ?? 'this course'
  const sectionCode = sectionInfo?.section_code ?? sectionId

  if (!chunks || chunks.length === 0) {
    return Response.json({
      analysis: null,
      reason:   'No indexed content found for this section. Publish and index content first.',
      stats:    { total: entries.length, lowSimilarity, zeroMatch },
    })
  }

  // ── Build GPT-4o prompt ────────────────────────────────────
  const contentSample = chunks
    .map((c, i) => `[Excerpt ${i + 1}]\n${c.chunk_text}`)
    .join('\n\n---\n\n')

  const systemPrompt = `\
You are an instructional design analyst helping an instructor improve their course.
You will be shown excerpts from a course's content and statistics about student AI tutor queries.
Your job is to identify likely curriculum gaps — topics students probably asked about that the
content doesn't adequately cover.

Be specific and actionable. Do not speculate about student behavior beyond what the data supports.
Format your response as:
1. A brief summary of the coverage signal (2-3 sentences)
2. A numbered list of likely gap topics (3-6 items)
3. A brief recommendation for each gap`

  const userPrompt = `\
Course: ${courseTitle} (${sectionCode})

Query Statistics (last 30 days):
- Total AI tutor queries: ${entries.length}
- Queries with poor content match (similarity < ${LOW_SIMILARITY_THRESHOLD * 100}%): ${lowSimilarity} (${Math.round((lowSimilarity / entries.length) * 100)}%)
- Queries with zero matching content: ${zeroMatch}
- Average best-match similarity: ${(avgBestMatch * 100).toFixed(1)}%

Note: Query text is not stored (privacy). Low similarity means students asked questions
the indexed content didn't answer well.

Sample of indexed course content (${chunks.length} excerpts):

${contentSample}

Based on this content and the query statistics above, what topics are students likely
confused about or asking questions on that this course content doesn't cover well?`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       OPENAI_COMPLETION_MODEL,
        temperature: 0.4,
        max_tokens:  800,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      }),
    })

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
    const json = await res.json() as { choices: { message: { content: string } }[] }
    const analysis = json.choices[0]?.message?.content ?? ''

    return Response.json({
      analysis,
      stats: { total: entries.length, lowSimilarity, zeroMatch, avgBestMatch },
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Analysis failed: ${msg}` }, { status: 502 })
  }
}
