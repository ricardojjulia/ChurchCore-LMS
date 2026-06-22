import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS on course_certificates restricts SELECT to user_id = current_user_uid()
  const { data: cert, error } = await supabase
    .from('course_certificates')
    .select(`
      id,
      certificate_no,
      issued_at,
      final_grade,
      letter_grade,
      courses ( title, org_id ),
      profiles!course_certificates_user_id_fkey ( display_name )
    `)
    .eq('id', id)
    .single()

  if (error || !cert) return Response.json({ error: 'Certificate not found' }, { status: 404 })

  const course  = cert.courses  as unknown as { title: string; org_id: string } | null
  const profile = cert.profiles as unknown as { display_name: string | null }   | null

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', course?.org_id ?? '')
    .single()

  // Dynamic imports keep this out of the edge bundle
  const { renderToBuffer }       = await import('@react-pdf/renderer')
  const { CertificateDocument }  = await import('@/components/pdf/CertificateDocument')
  const React                    = await import('react')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf ReactElement is not assignable to React.ReactElement; cast via any
  const element = React.createElement(CertificateDocument, {
    learnerName:   profile?.display_name ?? 'Learner',
    courseTitle:   course?.title         ?? 'Course',
    orgName:       org?.name             ?? 'ChurchCore LMS',
    issuedAt:      cert.issued_at        as string,
    certificateNo: cert.certificate_no   as string,
    finalGrade:    cert.final_grade      as number | null | undefined,
    letterGrade:   cert.letter_grade     as string | null | undefined,
  }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const nodeBuffer = await renderToBuffer(element)
  const buffer = new Uint8Array(nodeBuffer)

  return new Response(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${cert.certificate_no}.pdf"`,
      'Cache-Control':       'private, no-cache',
    },
  })
}
