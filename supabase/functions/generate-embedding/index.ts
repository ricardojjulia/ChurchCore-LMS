// Edge Function: generate-embedding (ADR-2025-003 Phase 3A)
// Triggered by DB webhook on content_pages publish events.
// Also called by the pg_cron recovery path for stuck/failed jobs.
//
// Environment variables required (Supabase secrets):
//   OPENAI_API_KEY       — text-embedding-3-small
//   SUPABASE_URL         — project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role (writes embeddings table)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL         = 'text-embedding-3-small'
const MAX_CHUNK_CHARS = 1200
const OVERLAP_CHARS   = 150
const MAX_BATCH_SIZE  = 20  // max chunks per OpenAI call (burst protection)

// ============================================================
// TIPTAP JSON → PLAIN TEXT
// Walks the Tiptap document tree and extracts text with
// paragraph/heading boundaries preserved for chunking.
// ============================================================
type TiptapNode = {
  type:    string
  text?:   string
  content?: TiptapNode[]
  attrs?:  Record<string, unknown>
}

function extractText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? ''

  const childText = (node.content ?? []).map(extractText).join('')

  // Add paragraph breaks after block-level nodes so chunks split on boundaries
  const blockTypes = new Set(['paragraph','heading','bulletList','orderedList',
                               'listItem','blockquote','codeBlock'])
  return blockTypes.has(node.type) ? childText + '\n\n' : childText
}

// ============================================================
// CHUNKING
// Splits on semantic paragraph boundaries with a sliding-window
// overlap so context is preserved across chunk edges.
// ============================================================
function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim())
      // Carry the last OVERLAP_CHARS into the next chunk for continuity
      current = current.slice(-OVERLAP_CHARS) + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// ============================================================
// OPENAI EMBEDDING
// Batches chunks to stay within MAX_BATCH_SIZE per call.
// Returns one embedding vector per input string.
// ============================================================
async function embedChunks(
  chunks: string[],
  apiKey: string,
): Promise<number[][]> {
  const allVectors: number[][] = []

  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE)

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ input: batch, model: MODEL }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI embeddings error ${res.status}: ${err}`)
    }

    const json = await res.json() as { data: { embedding: number[] }[]; model: string }
    for (const item of json.data) {
      allVectors.push(item.embedding)
    }
  }

  return allVectors
}

// ============================================================
// MAIN HANDLER
// ============================================================
Deno.serve(async (req) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Parse payload BEFORE env-var checks so we can mark an existing job failed
  // if OPENAI_API_KEY is missing — prevents recovery jobs from hanging in 'pending'.
  let payload: { job_id?: string; page_id?: string; section_id?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY')
  const SUPA_URL    = Deno.env.get('SUPABASE_URL')
  const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPA_URL || !SUPA_KEY) {
    return new Response('Missing Supabase configuration', { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  if (!OPENAI_KEY) {
    if (payload.job_id) {
      await supabase
        .from('embedding_jobs')
        .update({ status: 'failed', error_message: 'OPENAI_API_KEY not configured on server' })
        .eq('id', payload.job_id)
        .in('status', ['pending', 'processing'])
    }
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Accept either a job_id (recovery path) or a direct page_id + section_id (webhook path)
  let jobId     = payload.job_id
  let pageId    = payload.page_id
  let sectionId = payload.section_id

  // Webhook path: look up or create the job
  if (!jobId && pageId && sectionId) {
    const { data: existingJob } = await supabase
      .from('embedding_jobs')
      .select('id, status, attempt_count')
      .eq('source_type', 'content_page')
      .eq('source_id',   pageId)
      .in('status',      ['pending', 'failed'])
      .single()

    if (existingJob) {
      jobId = existingJob.id
    } else {
      const { data: newJob, error: jobErr } = await supabase
        .from('embedding_jobs')
        .insert({
          source_type:  'content_page',
          source_id:    pageId,
          section_id:   sectionId,
          triggered_by: 'publish_event',
          model_used:   MODEL,
        })
        .select('id')
        .single()

      if (jobErr || !newJob) {
        return new Response(JSON.stringify({ error: 'Failed to create job' }), { status: 500 })
      }
      jobId = newJob.id
    }
  }

  // Recovery path: look up job details from the job record
  if (jobId && (!pageId || !sectionId)) {
    const { data: job } = await supabase
      .from('embedding_jobs')
      .select('source_id, section_id, attempt_count')
      .eq('id', jobId)
      .single()

    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 })
    }
    pageId    = job.source_id
    sectionId = job.section_id
  }

  if (!jobId || !pageId || !sectionId) {
    return new Response('Provide job_id or both page_id and section_id', { status: 400 })
  }

  // Mark job as processing (attempt_count is incremented by the pg_cron recovery requeue,
  // so we only set status here — avoids a race between recovery and the live webhook path)
  await supabase
    .from('embedding_jobs')
    .update({ status: 'processing' })
    .eq('id', jobId)

  try {
    // Fetch the content page (service role bypasses RLS)
    const { data: page, error: pageErr } = await supabase
      .from('content_pages')
      .select('id, title, body, status, published_at, course_id')
      .eq('id', pageId)
      .single()

    if (pageErr || !page) throw new Error(`Page not found: ${pageId}`)
    if (page.status !== 'published') throw new Error(`Page is not published: ${page.status}`)

    // Extract and chunk text from Tiptap JSON
    const bodyText   = extractText(page.body as TiptapNode)
    const chunks     = chunkText(bodyText)

    if (chunks.length === 0) throw new Error('No text content extracted from page')

    // Generate embeddings (batched, with burst protection)
    const vectors = await embedChunks(chunks, OPENAI_KEY)

    // Look up blueprint_id and term_id for metadata
    const { data: section } = await supabase
      .from('course_sections')
      .select('blueprint_id, term_id')
      .eq('id', sectionId)
      .single()

    // Deactivate any existing embeddings for this page (staleness)
    await supabase
      .from('embeddings')
      .update({ is_active: false })
      .eq('source_type', 'content_page')
      .eq('source_id',   pageId)

    // Insert new chunk rows
    const rows = chunks.map((chunkText, i) => ({
      source_type:       'content_page' as const,
      source_id:         pageId!,
      chunk_index:       i,
      chunk_text:        chunkText,
      chunk_char_count:  chunkText.length,
      embedding:         `[${vectors[i].join(',')}]`,  // pgvector literal format
      section_id:        sectionId!,
      blueprint_id:      section?.blueprint_id ?? null,
      term_id:           section?.term_id ?? null,
      is_active:         true,
      source_updated_at: page.published_at ?? new Date().toISOString(),
    }))

    const { error: insertErr } = await supabase
      .from('embeddings')
      .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' })

    if (insertErr) throw new Error(`Failed to insert embeddings: ${insertErr.message}`)

    // Update job to complete
    await supabase
      .from('embedding_jobs')
      .update({
        status:        'complete',
        chunk_count:   chunks.length,
        model_version: MODEL,
        completed_at:  new Date().toISOString(),
        error_message: null,
      })
      .eq('id', jobId)

    // Update content_pages status
    await supabase
      .from('content_pages')
      .update({
        embedding_status:      'complete',
        embedding_updated_at:  new Date().toISOString(),
        embedding_chunk_count: chunks.length,
      })
      .eq('id', pageId)

    return new Response(
      JSON.stringify({ ok: true, jobId, chunks: chunks.length }),
      { headers: { 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark job failed
    await supabase
      .from('embedding_jobs')
      .update({
        status:        'failed',
        error_message: message,
        completed_at:  new Date().toISOString(),
      })
      .eq('id', jobId)

    // Mark page failed
    await supabase
      .from('content_pages')
      .update({ embedding_status: 'failed' })
      .eq('id', pageId)

    console.error('[generate-embedding] failed:', message)

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
