import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { BLOCK_TYPE_META } from '@/types/blocks'
import EnrollButton from '@/components/learning/EnrollButton'
import type { CourseBlock } from '@/types/blocks'

// Supabase's select('*, alias:join(...)') doesn't narrow to a concrete TS type.
// CourseRow captures the full shape returned by the courses query below.
type CourseRow = {
  id: string
  title: string
  description: string | null
  status: string
  org_id: string
  owner_id: string | null
  min_required_level: number
  prerequisite_course_id: string | null
  age_min: number | null
  age_max: number | null
  prereq: { id: string; title: string } | null
  blueprint: {
    id: string
    title: string
    course_code: string
    program_tracks: { name: string; code: string } | null
  } | null
}

type GamificationJSON = { base_xp_reward?: number }

export const dynamic = 'force-dynamic'

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let profile: { uid: string; role: string; current_level: number } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('uid, role, current_level')
      .eq('auth_id', user.id)
      .single()
    profile = data
  }

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile?.role ?? '')

  const [courseResult, blocksResult, materialsResult] = await Promise.all([
    supabase
      .from('courses')
      .select(`
        *,
        prereq:prerequisite_course_id(id,title),
        blueprint:course_blueprints(
          id,
          title,
          course_code,
          program_tracks(name, code)
        )
      `)
      .eq('id', courseId)
      .single(),
    supabase
      .from('course_blocks')
      .select('id, title, block_type_id, parent_block_id, sort_order, is_published, gamification')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('content_pages')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .eq('status', 'published'),
  ])

  const course         = courseResult.data as CourseRow | null
  const allBlocks      = (blocksResult.data ?? []) as CourseBlock[]
  const materialsCount = materialsResult.count ?? 0

  if (!course) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white border border-rose-200 rounded-2xl p-10">
          <h2 className="text-lg font-bold text-rose-800">Course Not Found</h2>
          <p className="text-sm text-rose-600 mt-1">Check the URL or contact your administrator.</p>
          <Link href="/courses" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to courses
          </Link>
        </div>
      </main>
    )
  }

  const blueprint = course?.blueprint

  let blueprintSections: {
    id: string
    section_code: string
    delivery_format: string
    enrollment_type: string
    is_active: boolean
    academic_terms: { term_name: string; term_code: string } | null
  }[] = []

  if (blueprint?.id) {
    const { data } = await supabase
      .from('course_sections')
      .select('id, section_code, delivery_format, enrollment_type, is_active, academic_terms(term_name, term_code)')
      .eq('blueprint_id', blueprint.id)
      .order('created_at', { ascending: false })

    blueprintSections = (data ?? []) as unknown as typeof blueprintSections
  }

  // Derive student-facing enrollment notices from active sections
  const activeSections = blueprintSections.filter((s) => s.is_active)
  const hasInviteOnly  = activeSections.some((s) => s.enrollment_type === 'invite_only')
  const hasCohortGated = activeSections.some((s) => s.enrollment_type === 'cohort_gated')

  // Check enrollment
  let enrollment: { transit_status: string; progress_percent: number } | null = null
  if (profile) {
    const { data } = await supabase
      .from('enrollments')
      .select('transit_status, progress_percent')
      .eq('user_id',   profile.uid)
      .eq('course_id', courseId)
      .maybeSingle()
    enrollment = data
  }

  const isEnrolled = !!enrollment || isStaff

  // Prerequisite eligibility (students only)
  let enrollLocked    = false
  let enrollLockReason: string | undefined
  if (profile && !isStaff && !isEnrolled) {
    const requiredLevel = course.min_required_level ?? 1
    const studentLevel  = profile.current_level ?? 1
    if (studentLevel < requiredLevel) {
      enrollLocked     = true
      enrollLockReason = `Level ${requiredLevel} required — you are level ${studentLevel}`
    } else if (course.prerequisite_course_id) {
      const { data: prereqDone } = await supabase
        .from('enrollments')
        .select('transit_status')
        .eq('user_id',   profile.uid)
        .eq('course_id', course.prerequisite_course_id)
        .eq('transit_status', 'completed')
        .maybeSingle()
      if (!prereqDone) {
        enrollLocked     = true
        const prereqTitle = course.prereq?.title
        enrollLockReason = prereqTitle
          ? `Complete "${prereqTitle}" first`
          : 'Complete the prerequisite course first'
      }
    }
  }

  // Build module groups
  const moduleHeaders = allBlocks.filter(
    (b) => b.block_type_id === 'module_header' && !b.parent_block_id
  )
  const itemsFor = (moduleId: string) =>
    allBlocks.filter(
      (b) => b.parent_block_id === moduleId && (b.is_published || isStaff)
    )

  const publishedCount = allBlocks.filter((b) => b.is_published && b.block_type_id !== 'module_header').length
  const totalXp        = allBlocks.reduce(
    (s, b) => s + ((b.gamification as GamificationJSON)?.base_xp_reward ?? 0), 0
  )

  // Find first lesson for Start / Continue CTA
  const firstBlock = allBlocks.find(
    (b) => b.block_type_id !== 'module_header' && (b.is_published || isStaff)
  )

  const ctaHref = `/courses/${courseId}/learn${firstBlock ? `?block=${firstBlock.id}` : ''}`
  const ctaLabel =
    !isEnrolled ? null
    : enrollment?.transit_status === 'completed' ? 'Review Course'
    : enrollment?.transit_status === 'in_progress' ? 'Continue Learning'
    : 'Start Learning'

  return (
    <main id="main-content" className="min-h-screen bg-slate-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link href="/courses" className="hover:text-primary transition-colors font-medium">Courses</Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground font-semibold truncate">{course.title}</span>
        </nav>

        {/* Course hero */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden mb-8 shadow-sm">
          <div className="px-8 py-7">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold uppercase tracking-widest ${
                    course.status === 'published' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {course.status === 'published' ? 'Published' : (course.status ?? 'Draft')}
                  </span>
                </div>
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{course.title}</h1>
                {course.description && (
                  <p className="text-muted-foreground mt-2 text-base leading-relaxed">{course.description}</p>
                )}

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
                  {publishedCount > 0 && (
                    <span>{publishedCount} lesson{publishedCount !== 1 ? 's' : ''}</span>
                  )}
                  {totalXp > 0 && (
                    <span className="text-indigo-600 font-semibold">{totalXp} XP available</span>
                  )}
                  {moduleHeaders.length > 0 && (
                    <span>{moduleHeaders.length} module{moduleHeaders.length !== 1 ? 's' : ''}</span>
                  )}
                  {materialsCount > 0 && (
                    <span>📚 {materialsCount} additional material{materialsCount !== 1 ? 's' : ''}</span>
                  )}
                  {course.min_required_level > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs">
                      ⚡ Level {course.min_required_level}+ required
                    </span>
                  )}
                  {course.prereq && (
                    <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                      Requires: <span className="font-medium text-slate-700">{course.prereq.title}</span>
                    </span>
                  )}
                  {(course.age_min != null || course.age_max != null) && (
                    <span className="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2 py-0.5 rounded font-medium">
                      {course.age_min != null && course.age_max != null
                        ? `Ages ${course.age_min}–${course.age_max}`
                        : course.age_min != null
                        ? `Ages ${course.age_min}+`
                        : `Up to age ${course.age_max}`}
                    </span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-col gap-2 shrink-0">
                {isEnrolled && ctaLabel ? (
                  <>
                    <Link
                      href={ctaHref}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {ctaLabel} →
                    </Link>
                    {enrollment && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{enrollment.progress_percent}%</span>
                        </div>
                        <div className="h-1.5 w-40 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${enrollment.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {materialsCount > 0 && !isStaff && (
                      <Link
                        href={`/courses/${courseId}/pages`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-xl px-4 py-2 hover:bg-slate-50 transition-colors"
                      >
                        📚 Additional Materials ({materialsCount})
                      </Link>
                    )}
                  </>
                ) : !isStaff && user ? (
                  <>
                    <EnrollButton courseId={courseId} locked={enrollLocked} lockReason={enrollLockReason} />
                    {hasInviteOnly && (
                      <p className="text-xs text-rose-600 font-medium mt-1">
                        Enrollment by invitation only
                      </p>
                    )}
                    {!hasInviteOnly && hasCohortGated && (
                      <p className="text-xs text-amber-600 font-medium mt-1">
                        Cohort enrollment required
                      </p>
                    )}
                  </>
                ) : !user ? (
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors text-sm"
                  >
                    Log in to Enroll
                  </Link>
                ) : null}

                {isStaff && (
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`/courses/${courseId}/build`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      ✏️ Builder
                    </Link>
                    <Link
                      href={`/courses/${courseId}/analytics`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      Analytics
                    </Link>
                    <Link
                      href={`/courses/${courseId}/submissions`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      Submissions
                    </Link>
                    <Link
                      href={`/courses/${courseId}/enroll`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      Enrollment
                    </Link>
                    <Link
                      href={`/courses/${courseId}/pages`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      📚 Materials
                    </Link>
                    <Link
                      href={`/courses/${courseId}/attendance`}
                      className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      🗓️ Attendance
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isStaff && (
          <section className="bg-white border border-border rounded-2xl p-6 mb-8 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-foreground">Academic Placement</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Courses attach to blueprints. Tracks live on blueprints; terms and sections are created from blueprints.
                </p>
              </div>
              <Link
                href={`/courses/${courseId}/edit`}
                className="text-sm font-semibold text-primary border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
              >
                Edit Course Placement
              </Link>
            </div>

            {blueprint ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="border border-border rounded-xl p-4 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Blueprint</p>
                    <p className="font-semibold text-foreground mt-1">{blueprint.title}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{blueprint.course_code}</p>
                  </div>
                  <div className="border border-border rounded-xl p-4 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Program Track</p>
                    {blueprint.program_tracks ? (
                      <>
                        <p className="font-semibold text-foreground mt-1">{blueprint.program_tracks.name}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{blueprint.program_tracks.code}</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">No track assigned.</p>
                    )}
                  </div>
                  <div className="border border-border rounded-xl p-4 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sections</p>
                    <p className="font-semibold text-foreground mt-1">{blueprintSections.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Scheduled offerings from this blueprint.</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/blueprints/${blueprint.id}`}
                    className="text-sm font-semibold text-primary border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    Edit Blueprint
                  </Link>
                  <Link
                    href={`/admin/sections/new?blueprint=${blueprint.id}`}
                    className="text-sm font-semibold text-primary border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    Create Section for this Blueprint
                  </Link>
                </div>

                {blueprintSections.length > 0 && (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Section</th>
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Term</th>
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Format</th>
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Enrollment</th>
                          <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {blueprintSections.map((section) => {
                          const enrollBadge =
                            section.enrollment_type === 'cohort_gated'
                              ? { label: 'Cohort Required', className: 'bg-amber-50 text-amber-700 border-amber-200' }
                              : section.enrollment_type === 'invite_only'
                              ? { label: 'Invite Only',     className: 'bg-rose-50  text-rose-700  border-rose-200'  }
                              : { label: 'Open',            className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                          return (
                            <tr key={section.id}>
                              <td className="px-4 py-3 font-mono text-foreground">{section.section_code}</td>
                              <td className="px-4 py-3">
                                <p className="text-foreground">{section.academic_terms?.term_name ?? '—'}</p>
                                <p className="text-xs text-muted-foreground font-mono">{section.academic_terms?.term_code ?? ''}</p>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{section.delivery_format}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded border ${enrollBadge.className}`}>
                                  {enrollBadge.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link href={`/admin/sections/${section.id}`} className="text-sm font-semibold text-primary hover:underline">
                                  Manage →
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 border border-amber-200 bg-amber-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-900">This course is standalone.</p>
                <p className="text-sm text-amber-800 mt-1">
                  Link it to a blueprint before creating term-based sections or cohort enrollment for this content.
                </p>
                <Link
                  href={`/courses/${courseId}/edit`}
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  Attach a Blueprint →
                </Link>
              </div>
            )}
          </section>
        )}

        {/* Curriculum */}
        <h2 className="text-lg font-bold text-foreground mb-4">Curriculum</h2>
        <div className="space-y-4">
          {moduleHeaders.length === 0 && allBlocks.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-10 text-center">
              <p className="text-muted-foreground italic">No content published yet.</p>
              {isStaff && (
                <Link href={`/courses/${courseId}/build`} className="mt-3 inline-block text-sm text-primary hover:underline">
                  Add content in Builder →
                </Link>
              )}
            </div>
          ) : moduleHeaders.length === 0 ? (
            // Flat list (no modules)
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <ul className="divide-y divide-border">
                {allBlocks
                  .filter((b) => b.block_type_id !== 'module_header' && (b.is_published || isStaff))
                  .map((block) => (
                    <CurriculumItem key={block.id} block={block} courseId={courseId} isEnrolled={isEnrolled} />
                  ))}
              </ul>
            </div>
          ) : (
            moduleHeaders.map((mod) => {
              const items = itemsFor(mod.id)
              return (
                <section
                  key={mod.id}
                  className="bg-white border border-border rounded-xl overflow-hidden shadow-sm"
                  aria-label={mod.title}
                >
                  <div className="bg-slate-50 border-b border-border px-6 py-4 flex items-center justify-between">
                    <h3 className="font-bold text-foreground">{mod.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {items.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {items.map((block) => (
                        <CurriculumItem key={block.id} block={block} courseId={courseId} isEnrolled={isEnrolled} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic px-6 py-4">No lessons yet.</p>
                  )}
                </section>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}

function CurriculumItem({
  block, courseId, isEnrolled,
}: {
  block:      CourseBlock
  courseId:   string
  isEnrolled: boolean
}) {
  const meta = BLOCK_TYPE_META[block.block_type_id]
  const href = isEnrolled ? `/courses/${courseId}/learn?block=${block.id}` : null

  const inner = (
    <div className="flex items-center gap-3 px-6 py-3.5">
      <span className="text-xl shrink-0" aria-hidden="true">{meta?.icon ?? '📦'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{block.title}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {meta?.label ?? block.block_type_id}
        </p>
      </div>
      {(block.gamification as GamificationJSON)?.base_xp_reward != null &&
       (block.gamification as GamificationJSON).base_xp_reward! > 0 && (
        <span className="text-xs text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shrink-0">
          +{(block.gamification as GamificationJSON).base_xp_reward} XP
        </span>
      )}
      {!isEnrolled && (
        <span className="text-slate-300 text-sm shrink-0" aria-label="Locked">🔒</span>
      )}
      {isEnrolled && (
        <span className="text-slate-400 text-sm shrink-0" aria-hidden="true">→</span>
      )}
    </div>
  )

  if (href) {
    return (
      <li className="hover:bg-slate-50 transition-colors">
        <Link href={href} className="block">{inner}</Link>
      </li>
    )
  }
  return <li>{inner}</li>
}
