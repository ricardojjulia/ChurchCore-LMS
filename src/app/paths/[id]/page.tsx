// COUNCIL-2026-029: Learner — Learning Path detail

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLearningPathsForLearner } from '@/app/actions/learning-paths'

export const dynamic = 'force-dynamic'

export default async function LearningPathDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id) redirect('/login')

  const paths = await getLearningPathsForLearner(profile.org_id)
  const path = paths.find((p) => p.id === id)
  if (!path) notFound()

  // Fetch the learner's completed course IDs
  const { data: certs } = await supabase
    .from('course_certificates')
    .select('course_id')
    .eq('user_id', user.id)
  const completedIds = new Set(certs?.map((c) => c.course_id) ?? [])

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/paths" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        ← All Learning Paths
      </Link>

      <h1 className="text-2xl font-bold mb-1">{path.title}</h1>
      {path.description && (
        <p className="text-muted-foreground mb-4">{path.description}</p>
      )}

      <div className="text-sm text-muted-foreground mb-6">
        {path.completedCount} of {path.totalCount} courses complete
        {path.totalCount > 0 && (
          <span className="ml-2 text-primary font-medium">
            ({Math.round((path.completedCount / path.totalCount) * 100)}%)
          </span>
        )}
      </div>

      {path.learning_path_courses.length === 0 ? (
        <p className="text-muted-foreground italic">No courses in this path yet.</p>
      ) : (
        <ol className="space-y-3">
          {path.learning_path_courses.map((lpc, index) => {
            const done = completedIds.has(lpc.course_id)
            return (
              <li key={lpc.course_id} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground w-6 shrink-0 text-center">
                  {done ? '✓' : index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{lpc.course.title}</p>
                  {lpc.course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{lpc.course.description}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {done && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                      Complete
                    </Badge>
                  )}
                  <Button asChild size="sm" variant={done ? 'outline' : 'default'}>
                    <Link href={`/courses/${lpc.course_id}`}>
                      {done ? 'Review' : 'Start'}
                    </Link>
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
