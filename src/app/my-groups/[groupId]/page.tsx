import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import GroupDiscussionBoard from './GroupDiscussionBoard'

export const dynamic = 'force-dynamic'

export default async function GroupDiscussionPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  // Verify membership (is_group_member enforced server-side in the RLS;
  // we check here for the redirect UX, not as a security gate)
  const { data: membership } = await supabase
    .from('section_group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', profile.uid)
    .maybeSingle()

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)

  if (!membership && !isStaff) redirect('/my-groups')

  const [groupResult, threadsResult] = await Promise.all([
    supabase
      .from('section_groups')
      .select(`
        id, group_name, group_code, purpose,
        section_id,
        course_sections ( section_code, course_blueprints ( title ) )
      `)
      .eq('id', groupId)
      .single(),
    supabase
      .from('group_threads')
      .select('id, title, is_pinned, is_locked, created_at, created_by')
      .eq('group_id', groupId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const group   = groupResult.data
  const threads = threadsResult.data ?? []

  if (!group) redirect('/my-groups')

  const section   = group.course_sections    as unknown as { section_code: string; course_blueprints: { title: string } | null } | null
  const blueprint = section?.course_blueprints

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/my-groups" className="hover:text-primary font-medium">My Groups</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{group.group_name}</span>
        </nav>

        {/* Group header */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-foreground">{group.group_name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {blueprint?.title ?? '—'} · <span className="font-mono">{section?.section_code}</span>
              </p>
              {membership && (
                <p className="text-xs text-muted-foreground mt-2">
                  You are a <strong className="text-foreground capitalize">{membership.role}</strong> of this group
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Discussion board */}
        <GroupDiscussionBoard
          groupId={groupId}
          uid={profile.uid}
          displayName={profile.display_name ?? user.email ?? 'You'}
          initialThreads={threads}
          isLocked={false}
        />
      </div>
    </main>
  )
}
