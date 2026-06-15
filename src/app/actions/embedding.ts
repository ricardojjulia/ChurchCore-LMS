'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { tiptapToHtml } from '@/utils/tiptap'

// ── Text utilities ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function chunkText(text: string, maxChars = 800): string[] {
  if (text.length <= maxChars) return text.length > 20 ? [text] : []
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + maxChars
    if (end < text.length) {
      const sentenceBreak = text.lastIndexOf('. ', end)
      if (sentenceBreak > start + 200) end = sentenceBreak + 2
    }
    const chunk = text.slice(start, Math.min(end, text.length)).trim()
    if (chunk.length > 20) chunks.push(chunk)
    start = end
  }
  return chunks
}

// ── OpenAI embeddings call ────────────────────────────────────────────────────

async function fetchEmbeddings(chunks: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || chunks.length === 0) return null

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: 'text-embedding-3-small', input: chunks }),
  })

  if (!res.ok) return null
  const json = await res.json() as { data: Array<{ embedding: number[] }> }
  return json.data.map((d) => d.embedding)
}

// ── Main action ───────────────────────────────────────────────────────────────

export type EmbeddingResult = {
  status:        'complete' | 'failed' | 'skipped'
  chunksIndexed?: number
  error?:        string
}

export async function generatePageEmbedding(pageId: string): Promise<EmbeddingResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { status: 'skipped', error: 'OPENAI_API_KEY not configured' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'failed', error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return { status: 'failed', error: 'Forbidden' }
  }

  const { data: page } = await supabase
    .from('content_pages')
    .select('id, title, body, status')
    .eq('id', pageId)
    .single()

  if (!page || page.status !== 'published') {
    return { status: 'skipped' }
  }

  const html      = tiptapToHtml(page.body as object)
  const plainText = stripHtml(`${page.title}. ${html}`)
  const chunks    = chunkText(plainText)

  if (chunks.length === 0) {
    return { status: 'skipped', error: 'Insufficient text content to index' }
  }

  const service = createServiceClient()

  // Mark as processing so the UI can show a spinner
  await service
    .from('content_pages')
    .update({ embedding_status: 'processing' })
    .eq('id', pageId)

  const vectors = await fetchEmbeddings(chunks)
  if (!vectors) {
    await service
      .from('content_pages')
      .update({ embedding_status: 'failed' })
      .eq('id', pageId)
    return { status: 'failed', error: 'OpenAI API call failed' }
  }

  // Deactivate previous embeddings for this page
  await service
    .from('embeddings')
    .update({ is_active: false })
    .eq('source_type', 'content_page')
    .eq('source_id', pageId)

  const rows = chunks.map((text, i) => ({
    source_type:       'content_page',
    source_id:         pageId,
    chunk_index:       i,
    chunk_text:        text,
    chunk_char_count:  text.length,
    // pgvector expects the string format '[0.1,0.2,...]'
    embedding:         `[${vectors[i].join(',')}]`,
    section_id:        null,
    is_active:         true,
    source_updated_at: new Date().toISOString(),
  }))

  const { error: insertErr } = await service
    .from('embeddings')
    .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' })

  if (insertErr) {
    await service
      .from('content_pages')
      .update({ embedding_status: 'failed' })
      .eq('id', pageId)
    return { status: 'failed', error: insertErr.message }
  }

  await service
    .from('content_pages')
    .update({
      embedding_status:      'complete',
      embedding_updated_at:  new Date().toISOString(),
      embedding_chunk_count: chunks.length,
    })
    .eq('id', pageId)

  // Mark any pending embedding_jobs for this page as complete
  await service
    .from('embedding_jobs')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('source_type', 'content_page')
    .eq('source_id', pageId)
    .in('status', ['pending', 'processing'])

  return { status: 'complete', chunksIndexed: chunks.length }
}
