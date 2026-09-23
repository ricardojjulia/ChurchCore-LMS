// COUNCIL-2026-029: Admin — Learning Paths list

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function AdminPathsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profile_roles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role ?? '')) {
    redirect('/dashboard')
  }

  const { data: paths } = await supabase
    .from('learning_paths')
    .select('id, title, description, is_published, created_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Learning Paths</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Group courses into structured programs for your learners.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/paths/new">New Path</Link>
        </Button>
      </div>

      {(!paths || paths.length === 0) ? (
        <div className="rounded-lg border bg-muted/30 p-12 text-center">
          <p className="text-muted-foreground mb-4">No learning paths yet.</p>
          <Button asChild variant="outline">
            <Link href="/admin/paths/new">Create your first path</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {paths.map((path) => (
            <Link
              key={path.id}
              href={`/admin/paths/${path.id}`}
              className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium group-hover:underline">{path.title}</span>
                  {path.is_published ? (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Published</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Draft</Badge>
                  )}
                </div>
                {path.description && (
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{path.description}</p>
                )}
              </div>
              <span className="text-sm text-muted-foreground shrink-0">Edit →</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
