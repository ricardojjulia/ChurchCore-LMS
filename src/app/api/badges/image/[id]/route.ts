import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { generateBadgeSvg } from '@/lib/badges/svg-builder'
import type { BadgeFrame, BadgeTheme, BadgeIcon } from '@/lib/badges/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Public Badge Image Generator Endpoint
 * GET /api/badges/image/[id]
 * Returns dynamic SVG vector graphic for this badge.
 */
export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: badge } = await supabase
    .from('badges')
    .select('id, title, description, trigger_condition, organizations(name)')
    .eq('id', id)
    .maybeSingle()

  const orgName = (badge?.organizations as any)?.name || 'ChurchCore LMS'
  const condition = (badge?.trigger_condition || {}) as Record<string, any>

  const frame: BadgeFrame = condition.frame || 'shield'
  const theme: BadgeTheme = condition.theme || 'gold'
  const icon: BadgeIcon = condition.icon || 'cross'

  const svg = generateBadgeSvg({
    title: badge?.title || 'Achievement Badge',
    frame,
    theme,
    icon,
    issuerName: orgName,
  })

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
