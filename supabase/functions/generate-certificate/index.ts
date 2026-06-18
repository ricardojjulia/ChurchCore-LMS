import React from 'npm:react@18.3.1'
import { renderToBuffer } from 'npm:@react-pdf/renderer@4.5.1'
import { createClient } from 'jsr:@supabase/supabase-js@2'

import CertificateTemplate from './CertificateTemplate.tsx'

type CertificatePayload = {
  enrollmentId?: string
  userId?: string
  courseId?: string
  orgId?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase service configuration' }, 500)

  let payload: CertificatePayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { enrollmentId, userId, courseId, orgId } = payload
  if (!enrollmentId || !userId || !courseId || !orgId) {
    return json({ error: 'enrollmentId, userId, courseId, and orgId are required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, user_id, course_id, completed_at')
    .eq('id', enrollmentId)
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .not('completed_at', 'is', null)
    .single()

  if (enrollmentError || !enrollment) return json({ error: 'Completed enrollment not found' }, 400)

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, org_id')
    .eq('id', courseId)
    .eq('org_id', orgId)
    .single()

  if (courseError || !course) return json({ error: 'Course does not belong to orgId' }, 400)

  const { data: existing } = await supabase
    .from('course_certificates')
    .select('id, pdf_storage_path, pdf_generation_status')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()

  if (existing) {
    return json({
      certificateId: existing.id,
      storagePath: existing.pdf_storage_path,
      status: existing.pdf_generation_status,
    })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('uid', userId)
    .single()

  const { data: certificate, error: insertError } = await supabase
    .from('course_certificates')
    .insert({
      user_id: userId,
      course_id: courseId,
      pdf_generation_status: 'processing',
    })
    .select('id, certificate_no, issued_at')
    .single()

  if (insertError || !certificate) return json({ error: insertError?.message ?? 'Certificate insert failed' }, 500)

  const storagePath = `certificates/${orgId}/${userId}/${courseId}/${certificate.id}.pdf`

  try {
    const pdf = await renderToBuffer(
      React.createElement(CertificateTemplate, {
        certificateNo: certificate.certificate_no,
        studentName: profile?.display_name ?? profile?.email ?? userId,
        courseTitle: course.title,
        issuedAt: certificate.issued_at,
      }),
    )

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(storagePath, pdf, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      await supabase
        .from('course_certificates')
        .update({ pdf_generation_status: 'failed' })
        .eq('id', certificate.id)
      return json({ error: uploadError.message }, 500)
    }

    await supabase
      .from('course_certificates')
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
        pdf_generation_status: 'complete',
      })
      .eq('id', certificate.id)

    await supabase.from('report_audit_log').insert({
      org_id: orgId,
      actor_id: userId,
      actor_role: 'student',
      actor_email: profile?.email ?? 'unknown@example.local',
      action: 'report_exported_pdf',
      resource_type: 'report_artifact',
      resource_id: certificate.id,
      target_user_id: userId,
      target_course_id: courseId,
      metadata: { type: 'certificate', storagePath },
      retention_class: 'ferpa',
    })

    return json({ certificateId: certificate.id, storagePath, status: 'complete' })
  } catch (error) {
    await supabase
      .from('course_certificates')
      .update({ pdf_generation_status: 'failed' })
      .eq('id', certificate.id)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
