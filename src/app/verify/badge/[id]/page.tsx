import React from 'react'
import Link from 'next/link'
import { createServiceClient } from '@/utils/supabase/service'
import { generateBadgeSvg } from '@/lib/badges/svg-builder'
import { buildLinkedInCertificationUrl } from '@/lib/badges/open-badges'
import type { BadgeFrame, BadgeTheme, BadgeIcon } from '@/lib/badges/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function VerifyBadgePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  // Query profile_badges record
  const { data: award, error } = await supabase
    .from('profile_badges')
    .select(`
      id,
      awarded_at,
      badge_id,
      org_id,
      badges (
        id,
        title,
        description,
        icon_url,
        trigger_condition
      ),
      profiles (
        display_name,
        organizations!profile_badges_org_id_fkey (
          name
        )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  const isValid = Boolean(!error && award && award.badges && award.profiles)

  const badge = (award?.badges ?? {}) as any
  const profile = (award?.profiles ?? {}) as any
  const orgName = (profile?.organizations as any)?.name || 'ChurchCore LMS Academy'

  const condition = (badge?.trigger_condition || {}) as Record<string, any>
  const frame: BadgeFrame = condition.frame || 'shield'
  const theme: BadgeTheme = condition.theme || 'gold'
  const icon: BadgeIcon = condition.icon || 'cross'

  const svgContent = isValid
    ? generateBadgeSvg({
        title: badge.title,
        frame,
        theme,
        icon,
        issuerName: orgName,
      })
    : null

  const issuedDate = award?.awarded_at
    ? new Date(award.awarded_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const currentOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://churchcore.app'
  const verifyUrl = `${currentOrigin}/verify/badge/${id}`
  const assertionJsonUrl = `${currentOrigin}/api/badges/assertions/${id}`

  const linkedInUrl = isValid
    ? buildLinkedInCertificationUrl({
        certificationName: badge.title,
        organizationName: orgName,
        issueDate: award.awarded_at,
        certUrl: verifyUrl,
        certId: id,
      })
    : '#'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="text-indigo-400 font-bold text-xl hover:text-indigo-300">
            ChurchCore LMS
          </Link>
          <p className="text-slate-400 text-sm mt-1">Digital Badge & Microcredential Verification</p>
        </div>

        {isValid ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Green verification banner */}
            <div className="bg-emerald-800 px-6 py-4 flex items-center gap-3 border-b border-emerald-700/50">
              <svg
                className="w-6 h-6 text-white flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-white font-bold text-sm">Verified Open Badge</p>
                <p className="text-emerald-200 text-xs">Authentic 1EdTech / Open Badges 2.0 Credential</p>
              </div>
            </div>

            <div className="p-8 text-center space-y-6">
              {/* Live SVG Badge Graphic */}
              <div className="w-40 h-40 mx-auto drop-shadow-2xl">
                {svgContent ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                    className="w-full h-full"
                  />
                ) : null}
              </div>

              {/* Badge Details */}
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{badge.title}</h1>
                {badge.description && (
                  <p className="text-slate-300 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
                    {badge.description}
                  </p>
                )}
              </div>

              {/* Recipient & Issuer Matrix */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Recipient</span>
                  <span className="font-semibold text-slate-200">{profile.display_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Issuing Organization</span>
                  <span className="font-semibold text-slate-200">{orgName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Awarded On</span>
                  <span className="font-semibold text-slate-200">{issuedDate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Assertion ID</span>
                  <span className="font-mono text-slate-400">{id.slice(0, 16)}...</span>
                </div>
              </div>

              {/* Action Buttons: LinkedIn & JSON-LD */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <a
                  href={linkedInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0077b5] hover:bg-[#006097] text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                  </svg>
                  Add to LinkedIn Profile
                </a>

                <a
                  href={assertionJsonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors border border-slate-700/80"
                >
                  <span>📜 View JSON-LD</span>
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/70 border border-rose-800 text-rose-400 mx-auto flex items-center justify-center text-xl mb-4">
              ✕
            </div>
            <h2 className="text-xl font-bold text-white">Badge Not Found</h2>
            <p className="text-sm text-slate-400 mt-2">
              This credential assertion ID does not exist or has been revoked.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
