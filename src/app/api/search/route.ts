import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ courses: [], announcements: [], people: [] })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  const pattern = `%${q}%`
  const isStaff = ['admin', 'manager', 'teacher'].includes(profile?.role ?? '')

  const [coursesResult, announcementsResult, peopleResult] = await Promise.all([
    // Courses: published only — uses status column, RLS scopes further
    supabase
      .from('courses')
      .select('id, title, description, status, course_blueprints ( course_code, title )')
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .eq('status', 'published')
      .order('title', { ascending: true })
      .limit(5),

    // Announcements
    supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .order('created_at', { ascending: false })
      .limit(4),

    // People (staff only)
    isStaff
      ? supabase
          .from('profiles')
          .select('uid, display_name, email, role')
          .or(`display_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(4)
      : Promise.resolve({ data: [] }),
  ])

  const courses       = (coursesResult.data      ?? []).slice(0, 5)
  const announcements = (announcementsResult.data ?? []).slice(0, 4)
  const people        = (peopleResult.data        ?? []).slice(0, 4)

  return NextResponse.json({
    courses,
    announcements,
    people,
    ...(courses.length === 0
      ? { message: 'No courses found for your search. Try different keywords.' }
      : {}),
  })
}
