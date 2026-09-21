import { createServiceClient } from '@/utils/supabase/service'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Publicly accessible — no auth required.
// Used by learners to share proof-of-completion links.

// Approved public scope (COUNCIL-2026-028): learner name, course, org, date,
// and certificate number only. Grades are educational records and must never
// be selected here, let alone rendered on this unauthenticated page.
interface CertRow {
  certificate_no: string
  issued_at:      string
  courses:        { title: string } | null
  profiles:       { display_name: string; organizations: { name: string } | null } | null
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certNo: string }>
}) {
  const { certNo } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('course_certificates')
    .select(`
      certificate_no,
      issued_at,
      courses ( title ),
      profiles (
        display_name,
        organizations ( name )
      )
    `)
    .eq('certificate_no', certNo)
    .maybeSingle()

  const cert = error ? null : (data as CertRow | null)

  const issuedDate = cert
    ? new Date(cert.issued_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">

        {/* Org / brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-indigo-600 font-semibold text-lg hover:underline">
            ChurchCore LMS
          </Link>
          <p className="text-slate-500 text-sm mt-1">Certificate Verification</p>
        </div>

        {cert ? (
          /* ── VALID ── */
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            {/* Green banner */}
            <div className="bg-emerald-500 px-6 py-5 flex items-center gap-3">
              <svg className="w-7 h-7 text-white flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-white font-bold text-lg leading-tight">Certificate Verified</p>
                <p className="text-emerald-100 text-sm">This certificate is authentic</p>
              </div>
            </div>

            {/* Details */}
            <div className="px-6 py-6 space-y-4">
              <Detail label="Awarded to" value={cert.profiles?.display_name ?? 'Unknown'} />
              <Detail label="Course"     value={cert.courses?.title ?? 'Unknown'} />
              {cert.profiles?.organizations?.name && (
                <Detail label="Organization" value={cert.profiles.organizations.name} />
              )}
              <Detail label="Issued on"  value={issuedDate!} />
              <Detail label="Certificate no." value={cert.certificate_no} mono />
            </div>
          </div>
        ) : (
          /* ── INVALID ── */
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="bg-red-500 px-6 py-5 flex items-center gap-3">
              <svg className="w-7 h-7 text-white flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-white font-bold text-lg leading-tight">Certificate Not Found</p>
                <p className="text-red-100 text-sm">No record matches this certificate number</p>
              </div>
            </div>
            <div className="px-6 py-6">
              <p className="text-slate-600 text-sm">
                The certificate number{' '}
                <span className="font-mono font-semibold text-slate-800">{certNo}</span>{' '}
                does not match any issued certificate in our system.
              </p>
              <p className="text-slate-500 text-sm mt-3">
                If you believe this is an error, please contact the organization that issued your certificate.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-slate-400 text-xs mt-6">
          Powered by ChurchCore LMS · Certificate verification
        </p>
      </div>
    </main>
  )
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
      <span className="text-slate-500 text-sm w-36 flex-shrink-0">{label}</span>
      <span className={`text-slate-800 font-medium text-sm ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
