import { NextResponse } from 'next/server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getReportArtifactById } from '@/lib/reporting/report-queries'

type RouteContext = {
  params: Promise<{ artifactId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { artifactId } = await context.params
  const artifact = await getReportArtifactById(artifactId)

  if (!artifact) {
    return NextResponse.json({ error: 'Report artifact not found' }, { status: 404 })
  }

  if (artifact.generation_status !== 'complete') {
    return NextResponse.json({ error: 'Report is not ready' }, { status: 409 })
  }

  const storagePath = artifact.storage_path ?? artifact.archive_storage_path
  if (!storagePath) {
    return NextResponse.json({ error: 'Report file is missing' }, { status: 404 })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service.storage.from('reports').createSignedUrl(storagePath, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Unable to sign report URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
