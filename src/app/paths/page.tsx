// COUNCIL-2026-029: Learner — Learning Paths list

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import LearningPathCard from '@/components/lms/LearningPathCard'
import { getLearningPathsForLearner } from '@/app/actions/learning-paths'

export const dynamic = 'force-dynamic'

export default async function LearningPathsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profile_roles')
    .select('org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id) redirect('/login')

  const paths = await getLearningPathsForLearner(profile.org_id)

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Learning Paths</h1>
      <p className="text-muted-foreground mb-6">
        Structured programs to guide your learning journey.
      </p>

      {paths.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-12 text-center">
          <p className="text-muted-foreground">No learning paths available yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <LearningPathCard key={path.id} path={path} />
          ))}
        </div>
      )}
    </main>
  )
}
