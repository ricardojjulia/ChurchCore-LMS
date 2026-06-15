import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Supabase Storage bucket: 'content-images' (public read, auth write)
// Create it in the Supabase dashboard or via:
//   supabase storage create content-images --public
const BUCKET = 'content-images'
const MAX_BYTES = 5 * 1024 * 1024   // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('auth_id', user.id).single()
  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  // Parse multipart form
  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `File type not allowed. Use: ${ALLOWED_TYPES.join(', ')}` }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 })
  }

  const ext      = file.name.split('.').pop() ?? 'jpg'
  const filename = `${user.id}/${Date.now()}.${ext}`
  const buffer   = await file.arrayBuffer()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType:  file.type,
      cacheControl: '3600',
      upsert:       false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path)

  return NextResponse.json({ url: publicUrl })
}
