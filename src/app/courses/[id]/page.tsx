import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { BLOCK_TYPE_META } from '@/types/blocks'
import EnrollButton from '@/components/learning/EnrollButton'
import LiveMeetingCard from '@/components/academic/LiveMeetingCard'
import type { CourseBlock } from '@/types/blocks'
import { getTranslations } from 'next-intl/server'

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
  const t = await getTranslations()
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()

  let profile: { uid: string; role: string; current_level: number } | null = null
  if (user) {
    const { data: pr } = await supabase
      .from('profiles')
      .select('uid, role, current_level')
      .eq('auth_id', user.id)
      .single()

    if (pr) {
      profile = pr
    } else {
      const { data: serviceProf } = await service
        .from('profiles')
        .select('uid, role, current_level')
        .eq('auth_id', user.id)
        .single()
      if (serviceProf) {
        profile = serviceProf
      } else {
        const { data: roleData } = await service
          .from('profile_roles')
          .select('uid, role')
          .eq('auth_id', user.id)
          .single()
        if (roleData) {
          profile = { uid: roleData.uid, role: roleData.role, current_level: 1 }
        }
      }
    }
  }

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile?.role ?? '')
  const queryClient = isStaff ? service : supabase

  const [courseResult, blocksResult, materialsResult] = await Promise.all([
    queryClient
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
    queryClient
      .from('course_blocks')
      .select('id, title, block_type_id, parent_block_id, sort_order, is_published, gamification')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true }),
    queryClient
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
      <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4 text-slate-100">
        <div className="max-w-md text-center card-crisp border-rose-800/60 p-10">
          <h2 className="text-lg font-display font-bold text-rose-300">{t('courses.detail.notFoundHeading')}</h2>
          <p className="text-sm text-rose-400/80 mt-1">{t('courses.detail.notFoundMessage')}</p>
          <Link href="/courses" className="mt-4 inline-block text-sm text-amber-300 hover:text-amber-200 transition-colors underline">
            {t('courses.detail.notFoundBackLink')}
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

  let liveSchedules: Array<{
    id:              string
    section_code:    string
    delivery_format: string
    rrule:           string | null
    start_time:      string | null
    end_time:        string | null
    timezone:        string
    effective_from:  string
    effective_until: string | null
    location_type:   string | null
    location_detail: string | null
  }> = []

  if (blueprint?.id) {
    const { data } = await supabase
      .from('course_sections')
      .select('id, section_code, delivery_format, enrollment_type, is_active, academic_terms(term_name, term_code)')
      .eq('blueprint_id', blueprint.id)
      .order('created_at', { ascending: false })

    blueprintSections = (data ?? []) as unknown as typeof blueprintSections

    const activeSectionIds = blueprintSections.filter((s) => s.is_active).map((s) => s.id)
    if (activeSectionIds.length > 0) {
      const { data: schedData } = await supabase
        .from('meeting_schedules')
        .select('*')
        .in('section_id', activeSectionIds)
        .order('effective_from', { ascending: true })

      if (schedData && schedData.length > 0) {
        liveSchedules = schedData.map((sch) => {
          const sec = blueprintSections.find((s) => s.id === sch.section_id)
          return {
            ...sch,
            section_code: sec?.section_code || 'Section',
            delivery_format: sec?.delivery_format || 'hybrid',
          }
        })
      }
    }
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
    : enrollment?.transit_status === 'completed' ? t('courses.detail.ctaReview')
    : enrollment?.transit_status === 'in_progress' ? t('courses.detail.ctaContinue')
    : t('courses.detail.ctaStart')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link href="/courses" className="hover:text-amber-300 transition-colors font-medium">{t('courses.detail.coursescrumb')}</Link>
          <span aria-hidden="true" className="text-slate-600">/</span>
          <span className="text-slate-200 font-semibold truncate">{course.title}</span>
        </nav>

        {/* Course hero */}
        <div className="card-crisp overflow-hidden mb-8">
          <div className="px-8 py-7">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    course.status === 'published'
                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                      : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                  }`}>
                    {course.status === 'published' ? t('courses.detail.statusPublished') : (course.status ? t('common.draft') : t('courses.detail.statusDraft'))}
                  </span>
                </div>
                <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight font-display">{course.title}</h1>
                {course.description && (
                  <p className="text-slate-300 mt-2 text-base leading-relaxed">{course.description}</p>
                )}

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-400">
                  {publishedCount > 0 && (
                    <span>{t('courses.detail.lessonCountTemplate', { publishedCount })}</span>
                  )}
                  {totalXp > 0 && (
                    <span className="text-amber-300 font-semibold">{t('courses.detail.xpAvailableTemplate', { totalXp })}</span>
                  )}
                  {moduleHeaders.length > 0 && (
                    <span>{t('courses.detail.moduleCountTemplate', { count: moduleHeaders.length })}</span>
                  )}
                  {materialsCount > 0 && (
                    <span>📚 {t('courses.detail.materialsCountTemplate', { materialsCount })}</span>
                  )}
                  {course.min_required_level > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-300 font-semibold bg-amber-950/60 border border-amber-800/60 rounded-full px-2.5 py-0.5 text-xs">
                      ⚡ {t('courses.detail.levelRequiredBadge', { level: course.min_required_level })}
                    </span>
                  )}
                  {course.prereq && (
                    <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                      {t('courses.detail.requiresLabel')} <span className="font-medium text-slate-200">{course.prereq.title}</span>
                    </span>
                  )}
                  {(course.age_min != null || course.age_max != null) && (
                    <span className="inline-flex items-center bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 text-xs px-2.5 py-0.5 rounded-full font-medium">
                      {course.age_min != null && course.age_max != null
                        ? t('courses.detail.ageRangeTemplate', { min: course.age_min, max: course.age_max })
                        : course.age_min != null
                        ? t('courses.detail.ageRangeMinTemplate', { min: course.age_min })
                        : t('courses.detail.ageRangeMaxTemplate', { max: course.age_max! })}
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
                      className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all shadow-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                    >
                      {ctaLabel} →
                    </Link>
                    {enrollment && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>{t('courses.detail.progressBarLabel')}</span>
                          <span>{enrollment.progress_percent}%</span>
                        </div>
                        <div className="h-1.5 w-40 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-amber-400 rounded-full"
                            style={{ width: `${enrollment.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {materialsCount > 0 && !isStaff && (
                      <Link
                        href={`/courses/${courseId}/pages`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-xl px-4 py-2 hover:bg-slate-900/60 transition-colors"
                      >
                        {t('courses.detail.materialsLink', { materialsCount })}
                      </Link>
                    )}
                  </>
                ) : !isStaff && user ? (
                  <>
                    <EnrollButton courseId={courseId} locked={enrollLocked} lockReason={enrollLockReason} />
                    {hasInviteOnly && (
                      <p className="text-xs text-rose-400 font-medium mt-1">
                        {t('courses.detail.inviteOnlyNotice')}
                      </p>
                    )}
                    {!hasInviteOnly && hasCohortGated && (
                      <p className="text-xs text-amber-300 font-medium mt-1">
                        {t('courses.detail.cohortRequiredNotice')}
                      </p>
                    )}
                  </>
                ) : !user ? (
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-6 py-3 rounded-xl transition-colors text-sm"
                  >
                    {t('courses.detail.loginToEnrollButton')}
                  </Link>
                ) : null}

                {isStaff && (
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`/courses/${courseId}/build`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      ✏️ Builder
                    </Link>
                    <Link
                      href={`/courses/${courseId}/analytics`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      Analytics
                    </Link>
                    <Link
                      href={`/courses/${courseId}/submissions`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      Submissions
                    </Link>
                    <Link
                      href={`/courses/${courseId}/enroll`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      Enrollment
                    </Link>
                    <Link
                      href={`/courses/${courseId}/pages`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      📚 Materials
                    </Link>
                    <Link
                      href={`/courses/${courseId}/attendance`}
                      className="text-xs font-semibold text-slate-300 hover:text-white border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                    >
                      🗓️ Attendance
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isStaff && allBlocks.some((b) => b.block_type_id === 'survey') && (
          <section className="card-crisp p-6 mb-8">
            <h2 className="text-lg font-bold text-slate-100 font-display">Survey results</h2>
            <ul className="mt-3 space-y-2">
              {allBlocks.filter((b) => b.block_type_id === 'survey').map((b) => (
                <li key={b.id}>
                  <Link href={`/courses/${courseId}/surveys/${b.id}`} className="text-sm font-semibold text-amber-300 hover:underline">
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isStaff && (
          <section className="card-crisp p-6 mb-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-100 font-display">Academic Placement</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Courses attach to blueprints. Tracks live on blueprints; terms and sections are created from blueprints.
                </p>
              </div>
              <Link
                href={`/courses/${courseId}/edit`}
                className="text-sm font-semibold text-amber-300 border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
              >
                Edit Course Placement
              </Link>
            </div>

            {blueprint ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/50">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Blueprint</p>
                    <p className="font-semibold text-slate-100 mt-1">{blueprint.title}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{blueprint.course_code}</p>
                  </div>
                  <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/50">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Program Track</p>
                    {blueprint.program_tracks ? (
                      <>
                        <p className="font-semibold text-slate-100 mt-1">{blueprint.program_tracks.name}</p>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">{blueprint.program_tracks.code}</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400 mt-1">No track assigned.</p>
                    )}
                  </div>
                  <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/50">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Sections</p>
                    <p className="font-semibold text-slate-100 mt-1">{blueprintSections.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Scheduled offerings from this blueprint.</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/blueprints/${blueprint.id}`}
                    className="text-sm font-semibold text-amber-300 border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                  >
                    Edit Blueprint
                  </Link>
                  <Link
                    href={`/admin/sections/new?blueprint=${blueprint.id}`}
                    className="text-sm font-semibold text-amber-300 border border-slate-700/80 rounded-lg px-3 py-1.5 hover:bg-slate-900/60 transition-colors"
                  >
                    Create Section for this Blueprint
                  </Link>
                </div>

                {blueprintSections.length > 0 && (
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900/70 border-b border-slate-800">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold text-slate-400">Section</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-400">Term</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-400">Format</th>
                          <th className="text-left px-4 py-2 font-semibold text-slate-400">Enrollment</th>
                          <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {blueprintSections.map((section) => {
                          const enrollBadge =
                            section.enrollment_type === 'cohort_gated'
                              ? { label: 'Cohort Required', className: 'bg-amber-950/60 text-amber-300 border-amber-800/60' }
                              : section.enrollment_type === 'invite_only'
                              ? { label: 'Invite Only',     className: 'bg-rose-950/60  text-rose-400  border-rose-800/60'  }
                              : { label: 'Open',            className: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' }
                          return (
                            <tr key={section.id} className="hover:bg-slate-900/40">
                              <td className="px-4 py-3 font-mono text-slate-200">{section.section_code}</td>
                              <td className="px-4 py-3">
                                <p className="text-slate-200">{section.academic_terms?.term_name ?? '—'}</p>
                                <p className="text-xs text-slate-400 font-mono">{section.academic_terms?.term_code ?? ''}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-400">{section.delivery_format}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded border ${enrollBadge.className}`}>
                                  {enrollBadge.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link href={`/admin/sections/${section.id}`} className="text-sm font-semibold text-amber-300 hover:underline">
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
              <div className="mt-5 border border-amber-900/60 bg-amber-950/30 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-300">This course is standalone.</p>
                <p className="text-sm text-slate-300 mt-1">
                  Link it to a blueprint before creating term-based sections or cohort enrollment for this content.
                </p>
                <Link
                  href={`/courses/${courseId}/edit`}
                  className="mt-3 inline-block text-sm font-semibold text-amber-300 hover:underline"
                >
                  Attach a Blueprint →
                </Link>
              </div>
            )}
          </section>
        )}

        {/* Live Classroom & Hybrid Meetings */}
        {liveSchedules.length > 0 && (
          <LiveMeetingCard courseTitle={course.title} schedules={liveSchedules} />
        )}

        {/* Curriculum */}
        <h2 className="text-lg font-bold text-slate-100 mb-4 font-display">{t('courses.detail.curriculumHeading')}</h2>

        <div className="space-y-4">
          {moduleHeaders.length === 0 && allBlocks.length === 0 ? (
            <div className="card-crisp p-10 text-center">
              <p className="text-slate-400 italic">{t('courses.detail.emptyCurriculum')}</p>
              {isStaff && (
                <Link href={`/courses/${courseId}/build`} className="mt-3 inline-block text-sm text-amber-300 hover:underline">
                  Add content in Builder →
                </Link>
              )}
            </div>
          ) : moduleHeaders.length === 0 ? (
            // Flat list (no modules)
            <div className="card-crisp overflow-hidden">
              <ul className="divide-y divide-slate-800">
                {allBlocks
                  .filter((b) => b.block_type_id !== 'module_header' && (b.is_published || isStaff))
                  .map((block) => (
                    <CurriculumItem key={block.id} block={block} courseId={courseId} isEnrolled={isEnrolled} lockedLabel={t('courses.detail.lockedTooltip')} />
                  ))}
              </ul>
            </div>
          ) : (
            moduleHeaders.map((mod) => {
              const items = itemsFor(mod.id)
              return (
                <section
                  key={mod.id}
                  className="card-crisp overflow-hidden"
                  aria-label={mod.title}
                >
                  <div className="bg-slate-900/60 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                    <h3 className="font-bold text-slate-100 font-display">{mod.title}</h3>
                    <span className="text-xs text-slate-400">
                      {t('courses.detail.moduleItemCountTemplate', { count: items.length })}
                    </span>
                  </div>
                  {items.length > 0 ? (
                    <ul className="divide-y divide-slate-800">
                      {items.map((block) => (
                        <CurriculumItem key={block.id} block={block} courseId={courseId} isEnrolled={isEnrolled} lockedLabel={t('courses.detail.lockedTooltip')} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400 italic px-6 py-4">{t('courses.detail.emptyModule')}</p>
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
  block, courseId, isEnrolled, lockedLabel,
}: {
  block:       CourseBlock
  courseId:    string
  isEnrolled:  boolean
  lockedLabel: string
}) {
  const meta = BLOCK_TYPE_META[block.block_type_id]
  const href = isEnrolled ? `/courses/${courseId}/learn?block=${block.id}` : null

  const inner = (
    <div className="flex items-center gap-3 px-6 py-3.5">
      <span className="text-xl shrink-0" aria-hidden="true">{meta?.icon ?? '📦'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate">{block.title}</p>
        <p className="text-xs text-slate-400 capitalize">
          {meta?.label ?? block.block_type_id}
        </p>
      </div>
      {(block.gamification as GamificationJSON)?.base_xp_reward != null &&
       (block.gamification as GamificationJSON).base_xp_reward! > 0 && (
        <span className="text-xs text-amber-300 font-bold bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60 shrink-0">
          +{(block.gamification as GamificationJSON).base_xp_reward} XP
        </span>
      )}
      {!isEnrolled && (
        <span className="text-slate-500 text-sm shrink-0" aria-label={lockedLabel}>🔒</span>
      )}
      {isEnrolled && (
        <span className="text-slate-400 text-sm shrink-0" aria-hidden="true">→</span>
      )}
    </div>
  )

  if (href) {
    return (
      <li className="hover:bg-slate-900/50 transition-colors">
        <Link href={href} className="block">{inner}</Link>
      </li>
    )
  }
  return <li>{inner}</li>
}
