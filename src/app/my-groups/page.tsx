import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const PURPOSE_ICONS: Record<string, string> = {
  collaboration: '🤝',
  grading:       '📊',
  project:       '🚀',
  discussion:    '💬',
  lab:           '🔬',
  general:       '📌',
}

export default async function MyGroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- get_my_groups RPC return type is not in generated Supabase types
  const { data: { data: groups }, error } = await supabase.rpc('get_my_groups') as any

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">My Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your section groups and discussion boards.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm mb-6">
            {error.message}
          </div>
        )}

        {(!groups || groups.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-semibold text-foreground">You haven't been assigned to any groups yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your instructor will add you when group work begins.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- get_my_groups RPC return not typed */}
            {(groups as any[]).map((g) => (
              <Link
                key={g.group_id}
                href={`/my-groups/${g.group_id}`}
                className="block bg-white border border-border rounded-2xl p-6 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0" aria-hidden="true">
                    {PURPOSE_ICONS[g.purpose ?? ''] ?? '👥'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground">{g.group_name}</p>
                      {g.member_role === 'leader' && (
                        <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                          Leader
                        </span>
                      )}
                      {g.group_code && (
                        <span className="text-xs font-mono text-muted-foreground">{g.group_code}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {g.blueprint_title} · <span className="font-mono">{g.section_code}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
