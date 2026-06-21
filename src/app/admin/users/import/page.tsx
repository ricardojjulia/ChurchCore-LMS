import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ImportForm from './ImportForm'

export const dynamic = 'force-dynamic'

export default async function AdminUsersImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/admin/users" className="hover:text-foreground transition-colors">
            Users
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Import CSV</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Import Users via CSV</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload a CSV file to bulk-invite users to your organization.
          </p>
        </div>

        <ImportForm />
      </div>
    </main>
  )
}
