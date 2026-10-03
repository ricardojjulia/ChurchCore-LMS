import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/utils/supabase/service'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string; courseId: string }>
}

type PreviewBlock = {
  id: string
  title: string
  block_type_id: string
  parent_block_id: string | null
  sort_order: number
}

// Public preview cap — mirrors the "fixed limit" required by COUNCIL-2026-027
// Prompt B item 2. A previewable curriculum outline has no legitimate reason
// to exceed this; it also bounds an anon-facing query's worst case.
const BLOCK_LIMIT = 200

const HEX_COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i

// COUNCIL-2026-027 — public course detail page, no authentication required.
// D5: a request for a course that doesn't exist, belongs to an inactive org,
// isn't marked is_public_preview, or isn't status = 'published' must all
// produce the *identical* notFound() — never a distinguishing signal. Every
// one of those cases is folded into the single filtered `.single()` query
// below, so there is exactly one call site that can 404, and it always looks
// the same regardless of which condition failed.
//
// The block select below must never contain `content` or `gamification` —
// enforced by convention here and checked by grep in PR review, per the
// council doc. Uses createServiceClient() for the same reason as the
// catalog page: the anon RLS policies + column-level grants from
// 20260920200000_public_course_preview.sql are the actual security boundary
// for any *other* client, not a substitute for this app-level filtering.
export default async function PublicCourseDetailPage({ params }: Props) {
  const { slug, courseId } = await params
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, settings')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (!org) notFound()

  const { data: course } = await service
    .from('courses')
    .select('id, title, description, price_cents, currency, seat_limit')
    .eq('id', courseId)
    .eq('org_id', org.id)
    .eq('is_public_preview', true)
    .eq('status', 'published')
    .single()

  if (!course) notFound()

  const isPaid = typeof course.price_cents === 'number' && course.price_cents > 0
  const formattedPrice = isPaid
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (course.currency || 'usd').toUpperCase(),
      }).format(course.price_cents! / 100)
    : 'Free'

  // is_published filter matches the authenticated course detail page's
  // `is_published || isStaff` rule for every non-staff viewer — an anonymous
  // visitor has no staff exception, so a draft block must never appear here,
  // even inside an otherwise-published, previewable course.
  const { data: blocksData } = await service
    .from('course_blocks')
    .select('id, title, block_type_id, parent_block_id, sort_order')
    .eq('course_id', courseId)
    .eq('org_id', org.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .limit(BLOCK_LIMIT)

  const blocks = (blocksData ?? []) as PreviewBlock[]

  const moduleHeaders = blocks.filter(
    (b) => b.block_type_id === 'module_header' && !b.parent_block_id
  )
  const itemsFor = (moduleId: string) =>
    blocks.filter((b) => b.parent_block_id === moduleId)
  const flatItems = blocks.filter((b) => b.block_type_id !== 'module_header' && !b.parent_block_id)

  const branding = (org.settings as Record<string, unknown> | null)?.branding as
    | { logo_url?: string; primary_color?: string }
    | undefined
  // Same inline-style approach as JoinForm's submit button. Hex-only so an
  // arbitrary settings string can never become an unexpected CSS value.
  const ctaStyle = branding?.primary_color && HEX_COLOR.test(branding.primary_color)
    ? { backgroundColor: branding.primary_color }
    : undefined

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href={`/join/${slug}/courses`} className="hover:text-indigo-400 transition-colors font-medium">
            {org.name}
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold truncate">{course.title}</span>
        </nav>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8 shadow-sm">
          {branding?.logo_url && (
            <img
              src={branding.logo_url}
              alt={org.name}
              className="h-10 mb-4 object-contain"
            />
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{course.title}</h1>
            <span
              className={`shrink-0 self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold ${
                isPaid
                  ? 'bg-amber-950/70 border border-amber-800/80 text-amber-300'
                  : 'bg-emerald-950/70 border border-emerald-800/80 text-emerald-300'
              }`}
            >
              {formattedPrice}
            </span>
          </div>
          {course.description && (
            <p className="text-slate-300 mt-3 text-base leading-relaxed">{course.description}</p>
          )}
          <Link
            href={`/join/${slug}`}
            style={ctaStyle}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-500 transition-colors text-sm mt-6 shadow-sm"
          >
            {isPaid ? `Sign up & Enroll — ${formattedPrice} →` : 'Sign up to Enroll →'}
          </Link>
        </div>

        <h2 className="text-xl font-extrabold text-white mb-4">Curriculum</h2>

        {blocks.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center shadow-sm">
            <p className="text-slate-400 italic">Curriculum coming soon.</p>
          </div>
        ) : moduleHeaders.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <ul className="divide-y divide-slate-800">
              {flatItems.map((block) => (
                <li key={block.id} className="px-6 py-3.5 text-sm font-medium text-slate-200">
                  {block.title}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {moduleHeaders.map((mod) => {
              const items = itemsFor(mod.id)
              return (
                <section key={mod.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-4">
                    <h3 className="font-bold text-white text-base">{mod.title}</h3>
                  </div>
                  {items.length > 0 ? (
                    <ul className="divide-y divide-slate-800">
                      {items.map((block) => (
                        <li key={block.id} className="px-6 py-3.5 text-sm font-medium text-slate-200">
                          {block.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400 italic px-6 py-4">No items yet.</p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
