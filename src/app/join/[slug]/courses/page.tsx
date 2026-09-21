import { notFound } from 'next/navigation'
import { createServiceClient } from '@/utils/supabase/service'
import PublicCourseCard from '@/components/lms/PublicCourseCard'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

// COUNCIL-2026-027 — public course catalog for an org, no authentication
// required. Mirrors the org-by-slug lookup in src/app/join/[slug]/page.tsx
// exactly (createServiceClient(), same select/eq/eq/single shape). Uses
// createServiceClient() rather than an anon-keyed client because this is an
// app-level read, not the security boundary — the anon RLS policies and
// column-level grants added in 20260920200000_public_course_preview.sql are
// the boundary for any *other* client that queries these tables directly.
export default async function PublicCourseCatalogPage({ params }: Props) {
  const { slug } = await params
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, settings')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (!org) notFound()

  const { data: courses } = await service
    .from('courses')
    .select('id, title, description')
    .eq('org_id', org.id)
    .eq('is_public_preview', true)
    .eq('status', 'published')

  const branding = (org.settings as Record<string, unknown> | null)?.branding as
    | { logo_url?: string; primary_color?: string }
    | undefined

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          {branding?.logo_url && (
            <img
              src={branding.logo_url}
              alt={org.name}
              className="h-12 mb-4 mx-auto object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">Public course catalog</p>
        </div>

        {!courses || courses.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <p className="text-muted-foreground italic">No courses are open for public preview right now.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {courses.map((course) => (
              <PublicCourseCard key={course.id} slug={slug} course={course} />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
