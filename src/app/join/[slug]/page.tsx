import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import JoinForm from './JoinForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export default async function JoinPage({ params }: Props) {
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, settings')
    .eq('slug', params.slug)
    .eq('status', 'active')
    .single()

  if (!org) redirect('/')

  const branding = (org.settings as Record<string, unknown> | null)?.branding as
    | { logo_url?: string; primary_color?: string }
    | undefined

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {branding?.logo_url && (
          <img
            src={branding.logo_url}
            alt={org.name}
            className="h-12 mb-6 mx-auto object-contain"
          />
        )}
        <h1 className="text-2xl font-bold text-center mb-2">Join {org.name}</h1>
        <p className="text-muted-foreground text-center mb-6 text-sm">
          Create your account to access courses and learning materials.
        </p>
        <JoinForm
          orgId={org.id}
          orgName={org.name}
          primaryColor={branding?.primary_color}
        />
      </div>
    </main>
  )
}
