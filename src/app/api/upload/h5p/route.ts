import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { parseH5PPackage } from '@/lib/h5p/parser'

const BUCKET = 'assignment-files'
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile || !['admin', 'manager', 'teacher', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
    }
    if (!profile.org_id) {
      return NextResponse.json({ error: 'No organization associated with account' }, { status: 403 })
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })
    }

    const buffer = await file.arrayBuffer()
    const parsed = await parseH5PPackage(buffer)

    if (!parsed.valid || !parsed.metadata) {
      return NextResponse.json(
        { error: parsed.error || 'Invalid .h5p package file' },
        { status: 422 }
      )
    }

    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `h5p/${profile.org_id}/${user.id}/${Date.now()}_${filename}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: 'application/zip',
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      path: uploadData.path,
      filename: file.name,
      metadata: parsed.metadata,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Server error during H5P upload' },
      { status: 500 }
    )
  }
}
