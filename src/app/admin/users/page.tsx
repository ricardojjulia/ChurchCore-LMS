import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import UserRow from './UserRow'
import UsersControls from './UsersControls'
import InviteUserForm from './InviteUserForm'

export const dynamic = 'force-dynamic'

const ROLE_ORDER = { admin: 0, manager: 1, teacher: 2, student: 3 }
const PAGE_SIZE  = 20

interface SearchParams {
  q?:    string
  role?: string
  page?: string
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (me?.role !== 'admin') redirect('/dashboard')

  // Parse filters
  const q        = (searchParams.q ?? '').trim().toLowerCase()
  const roleFilter = searchParams.role ?? ''
  const page     = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const from     = (page - 1) * PAGE_SIZE
  const to       = from + PAGE_SIZE - 1

  // Build query
  let query = supabase
    .from('profiles')
    .select('uid, display_name, email, role, status, student_id, xp_points, current_level', { count: 'exact' })

  if (roleFilter && roleFilter !== 'all') {
    query = query.eq('role', roleFilter)
  }
  if (q) {
    query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  query = query.order('role').order('display_name').range(from, to)

  const { data: profiles, error, count } = await query

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 py-10 px-4">
        <p className="text-destructive">Failed to load users: {error.message}</p>
      </main>
    )
  }

  const total     = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Sort by role precedence client-side (the DB returns within the selected page)
  const sorted = (profiles ?? []).sort(
    (a, b) =>
      (ROLE_ORDER[a.role as keyof typeof ROLE_ORDER] ?? 9) -
      (ROLE_ORDER[b.role as keyof typeof ROLE_ORDER] ?? 9)
  )

  // Counts for the stats bar (full table, not paginated)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('role, status')

  const allRows = allProfiles ?? []
  const counts = {
    total:     allRows.length,
    admin:     allRows.filter((p) => p.role === 'admin').length,
    manager:   allRows.filter((p) => p.role === 'manager').length,
    teacher:   allRows.filter((p) => p.role === 'teacher').length,
    student:   allRows.filter((p) => p.role === 'student').length,
    suspended: allRows.filter((p) => p.status === 'suspended').length,
  }

  const buildHref = (updates: Record<string, string | number>) => {
    const params = new URLSearchParams()
    if (q)          params.set('q', q)
    if (roleFilter) params.set('role', roleFilter)
    for (const [k, v] of Object.entries(updates)) params.set(k, String(v))
    return `/admin/users?${params.toString()}`
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Click any user to expand and edit their role or status.
            </p>
          </div>
          <InviteUserForm />
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { label: 'Total',     value: counts.total,     className: 'bg-slate-100 text-slate-700 border-slate-200' },
            { label: 'Admins',    value: counts.admin,     className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
            { label: 'Managers',  value: counts.manager,   className: 'bg-purple-100 text-purple-800 border-purple-200' },
            { label: 'Teachers',  value: counts.teacher,   className: 'bg-sky-100 text-sky-800 border-sky-200' },
            { label: 'Students',  value: counts.student,   className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
            ...(counts.suspended > 0
              ? [{ label: 'Suspended', value: counts.suspended, className: 'bg-rose-100 text-rose-800 border-rose-200' }]
              : []),
          ].map(({ label, value, className }) => (
            <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${className}`}>
              <span>{value}</span><span className="opacity-70">{label}</span>
            </div>
          ))}
        </div>

        {/* Search + role filter (client component) */}
        <UsersControls total={total} />

        {/* Result info */}
        {(q || roleFilter) && (
          <p className="text-xs text-muted-foreground mb-3">
            {total} result{total !== 1 ? 's' : ''}
            {q && <> matching <strong>&ldquo;{q}&rdquo;</strong></>}
            {roleFilter && <> · role: <strong>{roleFilter}</strong></>}
          </p>
        )}

        {/* User list */}
        {sorted.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground italic">No users match your filters.</p>
            <Link href="/admin/users" className="text-xs text-primary mt-2 inline-block hover:underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((profile) => (
              <UserRow key={profile.uid} profile={profile as any} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {total} users
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildHref({ page: page - 1 })}
                  className="px-4 py-2 border border-border rounded-lg bg-white hover:bg-slate-50 text-foreground font-medium transition-colors"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildHref({ page: page + 1 })}
                  className="px-4 py-2 border border-border rounded-lg bg-white hover:bg-slate-50 text-foreground font-medium transition-colors"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
