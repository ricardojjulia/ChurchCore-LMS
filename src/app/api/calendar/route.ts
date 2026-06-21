import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date().toISOString()
  const to   = searchParams.get('to')   ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('v_unified_calendar')
    .select('source_id, event_type, title, description, starts_at, ends_at, is_all_day, color_code, course_name, location, scope')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load calendar events' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
