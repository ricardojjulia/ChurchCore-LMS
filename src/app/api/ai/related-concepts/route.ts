// Related Concepts API — ADR-2025-003 Phase 4
// POST /api/ai/related-concepts
// Body: { pageId: string }
//
// Staff-only. Finds semantically similar pages across all sections by:
// 1. Fetching active embedding chunks for the given page (up to 3)
// 2. Calling find_related_concepts() for each chunk (SECURITY DEFINER, role-gated)
// 3. Deduplicating by source page and returning top 5 by similarity
//
// Security: staff-only; cross-RLS access is gated inside find_related_concepts()
// by current_user_role() check — not bypassable by callers.

import { NextRequest }   from 'next/server'
import { createClient }  from '@/utils/supabase/server'
import { heavyLimiter, checkLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

interface RawRelatedRow {
  chunk_id:        string
  source_type:     string
  source_id:       string
  chunk_text:      string
  similarity:      number
  section_id:      string
  section_code:    string
  blueprint_title: string
}

interface RelatedConceptItem {
  chunkId:        string
  sourceType:     string
  sourceId:       string
  chunkText:      string
  similarity:     number
  sectionId:      string
  sectionCode:    string
  blueprintTitle: string
}

export async function POST(req: NextRequest) {
  let body: { pageId?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { pageId } = body
  if (!pageId) return Response.json({ error: 'pageId is required' }, { status: 400 })

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

  // Fetch active embedding chunks for this page (first 3 by chunk_index)
  const { data: chunks } = await supabase
    .from('embeddings')
    .select('id')
    .eq('source_id',   pageId)
    .eq('source_type', 'content_page')
    .eq('is_active',   true)
    .order('chunk_index', { ascending: true })
    .limit(3)

  if (!chunks || chunks.length === 0) {
    return Response.json({
      results: [],
      reason:  'Page has no indexed content yet. Publish the page and wait for indexing to complete.',
    })
  }

  // Call find_related_concepts for each chunk; deduplicate by source page
  const seenSourceIds = new Set<string>()
  const related: RelatedConceptItem[] = []

  for (const chunk of chunks) {
    const { data: rows, error } = await supabase.rpc('find_related_concepts', {
      p_source_chunk_id: chunk.id,
      p_limit:           5,
    })

    if (error) {
      // Likely role gate — surface as auth error
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    for (const row of (rows ?? []) as RawRelatedRow[]) {
      if (seenSourceIds.has(row.source_id)) continue
      seenSourceIds.add(row.source_id)
      related.push({
        chunkId:        row.chunk_id,
        sourceType:     row.source_type,
        sourceId:       row.source_id,
        chunkText:      row.chunk_text,
        similarity:     row.similarity,
        sectionId:      row.section_id,
        sectionCode:    row.section_code,
        blueprintTitle: row.blueprint_title,
      })
    }
  }

  // Sort by similarity desc, return top 5
  related.sort((a, b) => b.similarity - a.similarity)

  return Response.json({ results: related.slice(0, 5) })
}
