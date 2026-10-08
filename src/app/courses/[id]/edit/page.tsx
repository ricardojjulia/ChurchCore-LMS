import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CourseForm from '@/components/courses/CourseForm'
import PublicPreviewToggle from '@/components/courses/PublicPreviewToggle'
import CoursePricingForm from '@/components/courses/CoursePricingForm'

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  // COUNCIL-2026-027 D3 — a manager may reach this page to toggle public
  // preview, but (unlike admin) gets no general course-edit rights below.
  const canEditCourse = profile?.role === 'teacher' || profile?.role === 'admin'
  const canTogglePreview = profile?.role === 'admin' || profile?.role === 'manager'
  const canManagePricing = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'teacher'
  if (!canEditCourse && !canTogglePreview && !canManagePricing) redirect('/dashboard')

  const [courseResult, allCoursesResult, blueprintsResult, orgResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, description, status, min_required_level, prerequisite_course_id, owner_id, blueprint_id, age_min, age_max, is_public_preview, price_cents, currency, seat_limit, org_id')
      .eq('id', id)
      .single(),
    supabase
      .from('courses')
      .select('id, title')
      .eq('owner_id', profile?.uid)
      .order('title', { ascending: true }),
    supabase
      .from('course_blueprints')
      .select('id, title, course_code, program_tracks(name, code)')
      .eq('is_active', true)
      .order('title', { ascending: true }),
    supabase
      .from('organizations')
      .select('stripe_connect_status')
      .eq('id', profile?.org_id)
      .single(),
  ])

  const course = courseResult.data
  if (!course) notFound()
  const isOwnerOrAdmin = course.owner_id === profile?.uid || profile?.role === 'admin'
  if (!isOwnerOrAdmin && !canTogglePreview && !canManagePricing) redirect('/courses')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/courses" className="hover:text-amber-300 transition-colors font-medium">Courses</Link>
          <span className="text-slate-600">/</span>
          <Link href={`/courses/${id}`} className="hover:text-amber-300 transition-colors font-medium truncate">{course.title}</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">Edit</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">Edit Course</h1>
          <p className="text-slate-400 mt-1 text-sm">{course.title}</p>
        </div>

        {/* A manager reaches this page only to toggle public preview (D3) —
            never granted the general course-edit form below. */}
        {canEditCourse && isOwnerOrAdmin && (
          <div className="card-crisp p-8">
            <CourseForm
              userId={profile?.uid ?? ''}
              courseId={course.id}
              existingCourses={allCoursesResult.data ?? []}
              blueprints={blueprintsResult.data ?? []}
              initialTitle={course.title}
              initialDescription={course.description ?? ''}
              initialLevel={course.min_required_level}
              initialPrerequisiteId={course.prerequisite_course_id}
              initialStatus={course.status}
              initialBlueprintId={course.blueprint_id ?? null}
              initialAgeMin={course.age_min ?? null}
              initialAgeMax={course.age_max ?? null}
            />
          </div>
        )}

        {/* Course Pricing & Storefront Settings (COUNCIL-2026-039) */}
        {canManagePricing && (
          <CoursePricingForm
            courseId={course.id}
            initialPriceCents={course.price_cents}
            initialCurrency={course.currency}
            initialSeatLimit={course.seat_limit}
            stripeConnectStatus={orgResult.data?.stripe_connect_status}
          />
        )}

        {/* COUNCIL-2026-027 D3 — public preview toggle is admin/manager only,
            never a teacher even if they own the course. */}
        {canTogglePreview && (
          <div className="mt-6">
            <PublicPreviewToggle
              courseId={course.id}
              initialValue={course.is_public_preview ?? false}
              courseStatus={course.status}
            />
          </div>
        )}
      </div>
    </main>
  )
}

