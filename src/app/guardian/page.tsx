import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

interface StudentCard {
  student_uid:      string
  display_name:     string | null
  student_id:       string | null
  current_level:    number
  xp:               number
  enrollment_count: number
  completed_count:  number
  linked_at:        string
}

export default async function GuardianPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'guardian' && !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: students, error } = await supabase.rpc('get_guardian_students')
  const studentList = (students as StudentCard[] | null) ?? []

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Guardian Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only view of the students in your care.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4 text-sm text-rose-700">
            Failed to load students. Please refresh.
          </div>
        )}

        {studentList.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">👨‍👧</p>
            <h2 className="text-base font-bold text-foreground mb-1">No linked students yet</h2>
            <p className="text-sm text-muted-foreground">
              Ask a staff member or administrator to link you to your child&apos;s account.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {studentList.map((s) => (
              <Link
                key={s.student_uid}
                href={`/guardian/${s.student_uid}`}
                className="bg-white border border-border rounded-2xl p-5 hover:shadow-md hover:border-primary/30 transition-all group"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-indigo-700">
                      {(s.display_name ?? '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {s.display_name ?? 'Student'}
                    </p>
                    {s.student_id && (
                      <p className="text-xs text-muted-foreground">{s.student_id}</p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-lg py-2">
                    <p className="text-lg font-extrabold text-indigo-600">{s.current_level}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Level</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2">
                    <p className="text-lg font-extrabold text-foreground">{s.enrollment_count}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Courses</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2">
                    <p className="text-lg font-extrabold text-emerald-600">{s.completed_count}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Done</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-3">
                  View progress →
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
