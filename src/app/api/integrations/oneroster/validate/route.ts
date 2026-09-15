import { NextRequest, NextResponse } from 'next/server'
import { previewOneRosterJob } from '@/lib/oneroster'
import { validateAndStageOneRosterPackage } from '@/lib/oneroster/stage'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'multipart/x-zip',
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  if (!profile.org_id) {
    return NextResponse.json({ error: 'No organization associated with account' }, { status: 403 })
  }

  const { data: tenantActive, error: tenantError } = await supabase.rpc('current_user_tenant_active')
  if (tenantError || tenantActive !== true) {
    return NextResponse.json({ error: 'Organization is not active' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const hasZipName = file.name.toLowerCase().endsWith('.zip')
  if (!hasZipName && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'File must be a OneRoster ZIP package' }, { status: 415 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const buffer = await file.arrayBuffer()
  const staging = await validateAndStageOneRosterPackage({
    buffer,
    orgId: profile.org_id,
    uploadedBy: profile.uid,
  })

  if (!staging.ok) {
    return NextResponse.json({ error: 'Package validated but staging failed' }, { status: 500 })
  }

  const validation = staging.validation!
  const issues = staging.issues!
  const valid = staging.valid

  const diff = valid
    ? await previewOneRosterJob({
        jobId: staging.jobId,
        orgId: profile.org_id,
        actorAuthId: user.id,
        actorUid: profile.uid,
      })
    : {
        created: 0,
        updated: 0,
        unchanged: validation.preview.validRows,
        deactivated: 0,
        quarantined: validation.preview.quarantinedRows,
      }

  if ('error' in diff) {
    return NextResponse.json({ error: diff.error }, { status: 500 })
  }

  return NextResponse.json({
    jobId: staging.jobId,
    valid,
    preview: validation.preview,
    diff,
    issues,
  })
}
