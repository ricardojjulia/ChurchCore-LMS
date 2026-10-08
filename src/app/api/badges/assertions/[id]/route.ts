import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { buildOpenBadgeAssertion } from '@/lib/badges/open-badges'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Public Open Badges 2.0 / 3.0 Assertion Endpoint
 * GET /api/badges/assertions/[id]
 * Returns application/ld+json assertion representation for credential backpacks and verifiers.
 */
export async function GET(req: NextRequest, { params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  // Query profile_badges with badge and profile details
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
        email,
        display_name,
        organizations!profile_badges_org_id_fkey (
          id,
          name
        )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error || !award || !award.badges || !award.profiles) {
    return NextResponse.json({ error: 'Badge assertion not found' }, { status: 404 })
  }

  const badge = award.badges as any
  const profile = award.profiles as any
  const org = profile.organizations as any

  const host = req.headers.get('host') || 'churchcore.app'
  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = `${protocol}://${host}`

  const badgeImageUrl = badge.icon_url || `${baseUrl}/api/badges/image/${award.badge_id}`

  const assertion = buildOpenBadgeAssertion({
    awardId: award.id,
    awardedAt: award.awarded_at,
    badgeId: badge.id,
    badgeTitle: badge.title,
    badgeDescription: badge.description || '',
    badgeImageUrl,
    recipientEmail: profile.email,
    orgId: award.org_id,
    orgName: org?.name || 'ChurchCore LMS Academy',
    baseUrl,
  })

  return new NextResponse(JSON.stringify(assertion, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
