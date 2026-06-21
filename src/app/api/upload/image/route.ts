import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Bucket is private. Objects stored at {org_id}/{auth_uid}/{timestamp}.ext
// Callers receive the storage path; render-time signed URLs are generated via
// src/lib/storage.ts#getSignedImageUrl when the content is displayed.
const BUCKET      = 'content-images'
const MAX_BYTES   = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'No organization associated with account' }, { status: 403 })
  }

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed. Use: ${ALLOWED_TYPES.join(', ')}` },
      { status: 415 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 })
  }

  const ext    = file.name.split('.').pop() ?? 'jpg'
  // Path includes org_id so cross-tenant guessing requires knowing another org's UUID
  const path   = `${profile.org_id}/${user.id}/${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return the storage path (not a URL). Callers use getSignedImageUrl(path)
  // to generate render-time signed URLs with 1-hour expiry.
  return NextResponse.json({ path: data.path })
}
