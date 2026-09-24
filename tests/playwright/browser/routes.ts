// COUNCIL-2026-031 D4.1 — every page, who may see it, and how to reach it.
//
// `allow` is the reviewed access rule, read from each page's own gate. The
// sweep asserts it both ways: allowed actors get a healthy, accessible page;
// everyone else is redirected away or gets a 404/permission state. A new page
// without a row here fails `npm run test:surface`.
import { covers } from '../fixtures/covers'
import { ADMINS, ORG_A_ROLES, STAFF, USERS, type Actor, type Role } from '../fixtures/roles'
import { BLOCK, CERT_NO, COURSE, IDS, ORG_A, ORG_A_SLUG } from '../fixtures/data'

void BLOCK

export type RouteSpec = {
  surface: string
  path: string
  allow: Actor[]
  /** Query string appended when navigating (the path assertion ignores it). */
  query?: string
  /** Allowed actors this page legitimately forwards elsewhere (e.g. /reports dispatch). */
  redirects?: Partial<Record<Actor, RegExp>>
  /** Include in the mobile-viewport project. */
  mobile?: boolean
}

const EVERYONE: Actor[] = ['anon', ...ORG_A_ROLES]
const AUTHED: Role[] = ORG_A_ROLES
const ADMIN_ONLY: Role[] = ['admin']
const ADMIN_TEACHER: Role[] = ['admin', 'teacher']
const PLATFORM: Role[] = ['platform']
const ENROLLED: Role[] = [...STAFF, 'student']

export const ROUTES: RouteSpec[] = [
  // ── Public ────────────────────────────────────────────────────────────────
  { surface: covers('page:/'), path: '/', allow: AUTHED, mobile: true },
  { surface: covers('page:/login'), path: '/login', allow: ['anon'], mobile: true },
  // Offline fallback is served from the service-worker cache; online it sits behind auth.
  { surface: covers('page:/offline'), path: '/offline', allow: AUTHED },
  { surface: covers('page:/join/[slug]'), path: `/join/${ORG_A_SLUG}`, allow: EVERYONE, mobile: true },
  { surface: covers('page:/join/[slug]/courses'), path: `/join/${ORG_A_SLUG}/courses`, allow: EVERYONE, mobile: true },
  { surface: covers('page:/join/[slug]/courses/[courseId]'), path: `/join/${ORG_A_SLUG}/courses/${COURSE.a}`, allow: EVERYONE, mobile: true },
  { surface: covers('page:/verify/[certNo]'), path: `/verify/${CERT_NO}`, allow: EVERYONE },

  // ── Every signed-in user ──────────────────────────────────────────────────
  { surface: covers('page:/dashboard'), path: '/dashboard', allow: AUTHED, mobile: true },
  { surface: covers('page:/announcements'), path: '/announcements', allow: AUTHED },
  { surface: covers('page:/calendar'), path: '/calendar', allow: AUTHED },
  { surface: covers('page:/certificates'), path: '/certificates', allow: AUTHED },
  // Students create personal events; the form offers course/institutional scopes to staff only.
  { surface: covers('page:/calendar/new'), path: '/calendar/new', allow: AUTHED },
  { surface: covers('page:/courses'), path: '/courses', allow: AUTHED, mobile: true },
  { surface: covers('page:/courses/[id]'), path: `/courses/${COURSE.a}`, allow: AUTHED, mobile: true },
  { surface: covers('page:/leaderboard'), path: '/leaderboard', allow: AUTHED },
  { surface: covers('page:/messages'), path: '/messages', allow: AUTHED, mobile: true },
  { surface: covers('page:/my-groups'), path: '/my-groups', allow: AUTHED },
  { surface: covers('page:/notifications'), path: '/notifications', allow: AUTHED },
  { surface: covers('page:/onboarding'), path: '/onboarding', allow: AUTHED },
  { surface: covers('page:/paths'), path: '/paths', allow: AUTHED, mobile: true },
  { surface: covers('page:/paths/[id]'), path: `/paths/${IDS.learningPath}`, allow: AUTHED },
  { surface: covers('page:/performance'), path: '/performance', allow: AUTHED },
  { surface: covers('page:/profile'), path: '/profile', allow: AUTHED, mobile: true },
  {
    // Dispatches by role; guardians get an in-place "no reports view" message.
    surface: covers('page:/reports'), path: '/reports', allow: AUTHED,
    redirects: {
      admin: /^\/admin\/reports$/, manager: /^\/instructor\/reports$/, teacher: /^\/instructor\/reports$/,
      student: /^\/student\/reports$/, platform: /^\/student\/reports$/,
    },
  },

  // ── Learner (enrolled) + staff ────────────────────────────────────────────
  { surface: covers('page:/courses/[id]/learn'), path: `/courses/${COURSE.a}/learn`, allow: ENROLLED, mobile: true },
  { surface: covers('page:/courses/[id]/pages'), path: `/courses/${COURSE.a}/pages`, allow: ENROLLED },
  {
    // Staff are sent straight to the editor.
    surface: covers('page:/courses/[id]/pages/[pageId]'), path: `/courses/${COURSE.a}/pages/${IDS.contentPage}`, allow: ENROLLED,
    redirects: { admin: /\/edit$/, manager: /\/edit$/, teacher: /\/edit$/ },
  },
  { surface: covers('page:/courses/[id]/tutor'), path: `/courses/${COURSE.a}/tutor`, query: `?section=${IDS.section}`, allow: ENROLLED },
  { surface: covers('page:/courses/[id]/complete'), path: `/courses/${COURSE.advanced}/complete`, allow: ['student'] },
  { surface: covers('page:/student/reports'), path: '/student/reports', allow: AUTHED },

  // ── Messaging / groups: participants + staff ──────────────────────────────
  { surface: covers('page:/messages/[threadId]'), path: `/messages/${IDS.thread}`, allow: ['teacher', 'student'] },
  { surface: covers('page:/my-groups/[groupId]'), path: `/my-groups/${IDS.group}`, allow: [...STAFF, 'student'] },

  // ── Guardian ──────────────────────────────────────────────────────────────
  { surface: covers('page:/guardian'), path: '/guardian', allow: ['guardian', ...STAFF] },
  // Guardian-only (COUNCIL-2026-033): staff are redirected to /guardian.
  { surface: covers('page:/guardian/[studentId]'), path: `/guardian/${USERS.student.uid}`, allow: ['guardian'] },

  // ── Staff ─────────────────────────────────────────────────────────────────
  { surface: covers('page:/hq'), path: '/hq', allow: STAFF },
  { surface: covers('page:/announcements/new'), path: '/announcements/new', allow: STAFF },

  { surface: covers('page:/instructor/reports'), path: '/instructor/reports', allow: STAFF },
  { surface: covers('page:/courses/new'), path: '/courses/new', allow: ADMIN_TEACHER },
  { surface: covers('page:/courses/[id]/build'), path: `/courses/${COURSE.a}/build`, allow: ADMIN_TEACHER },
  { surface: covers('page:/courses/[id]/edit'), path: `/courses/${COURSE.a}/edit`, allow: STAFF },
  { surface: covers('page:/courses/[id]/analytics'), path: `/courses/${COURSE.a}/analytics`, allow: STAFF },
  { surface: covers('page:/courses/[id]/attendance'), path: `/courses/${COURSE.a}/attendance`, allow: STAFF },
  { surface: covers('page:/courses/[id]/enroll'), path: `/courses/${COURSE.a}/enroll`, allow: STAFF },
  { surface: covers('page:/courses/[id]/gradebook'), path: `/courses/${COURSE.a}/gradebook`, allow: STAFF },
  { surface: covers('page:/courses/[id]/submissions'), path: `/courses/${COURSE.a}/submissions`, allow: STAFF },
  { surface: covers('page:/courses/[id]/pages/[pageId]/edit'), path: `/courses/${COURSE.a}/pages/${IDS.contentPage}/edit`, allow: STAFF },
  { surface: covers('page:/admin/sections'), path: '/admin/sections', allow: STAFF },
  { surface: covers('page:/admin/sections/[id]'), path: `/admin/sections/${IDS.section}`, allow: STAFF },

  // ── Org admins (admin + manager) ──────────────────────────────────────────
  { surface: covers('page:/admin/reports'), path: '/admin/reports', allow: ADMINS },
  { surface: covers('page:/admin/ai-analytics'), path: '/admin/ai-analytics', allow: ADMINS },
  { surface: covers('page:/admin/badges'), path: '/admin/badges', allow: ADMINS },
  { surface: covers('page:/admin/billing'), path: '/admin/billing', allow: ADMINS },
  { surface: covers('page:/admin/blueprints'), path: '/admin/blueprints', allow: ADMINS },
  { surface: covers('page:/admin/blueprints/new'), path: '/admin/blueprints/new', allow: ADMINS },
  { surface: covers('page:/admin/blueprints/[id]'), path: `/admin/blueprints/${IDS.blueprint}`, allow: ADMINS },
  { surface: covers('page:/admin/cohorts'), path: '/admin/cohorts', allow: ADMINS },
  { surface: covers('page:/admin/cohorts/new'), path: '/admin/cohorts/new', allow: ADMINS },
  { surface: covers('page:/admin/cohorts/[id]'), path: `/admin/cohorts/${IDS.cohort}`, allow: ADMINS },
  { surface: covers('page:/admin/cohorts/[id]/enroll'), path: `/admin/cohorts/${IDS.cohort}/enroll`, allow: ADMINS },
  { surface: covers('page:/admin/integrations/oneroster'), path: '/admin/integrations/oneroster', allow: ADMINS },
  { surface: covers('page:/admin/paths'), path: '/admin/paths', allow: ADMINS },
  { surface: covers('page:/admin/paths/new'), path: '/admin/paths/new', allow: ADMINS },
  { surface: covers('page:/admin/paths/[id]'), path: `/admin/paths/${IDS.learningPath}`, allow: ADMINS },
  { surface: covers('page:/admin/program-tracks'), path: '/admin/program-tracks', allow: ADMINS },
  { surface: covers('page:/admin/program-tracks/new'), path: '/admin/program-tracks/new', allow: ADMINS },
  { surface: covers('page:/admin/program-tracks/[id]'), path: `/admin/program-tracks/${IDS.programTrack}`, allow: ADMINS },
  { surface: covers('page:/admin/question-banks'), path: '/admin/question-banks', allow: ADMINS },
  { surface: covers('page:/admin/question-banks/new'), path: '/admin/question-banks/new', allow: ADMINS },
  { surface: covers('page:/admin/question-banks/[id]'), path: `/admin/question-banks/${IDS.questionBank}`, allow: ADMINS },
  { surface: covers('page:/admin/sections/new'), path: '/admin/sections/new', allow: ADMINS },
  { surface: covers('page:/admin/settings'), path: '/admin/settings', allow: ADMINS },
  { surface: covers('page:/admin/terms'), path: '/admin/terms', allow: ADMINS },
  { surface: covers('page:/admin/terms/new'), path: '/admin/terms/new', allow: ADMINS },
  { surface: covers('page:/admin/terms/[id]'), path: `/admin/terms/${IDS.term}`, allow: ADMINS },
  { surface: covers('page:/admin/users/[id]'), path: `/admin/users/${USERS.student.uid}`, allow: ADMINS },

  // ── Org admin only ────────────────────────────────────────────────────────
  { surface: covers('page:/admin/health'), path: '/admin/health', allow: ADMIN_ONLY },
  { surface: covers('page:/admin/users'), path: '/admin/users', allow: ADMIN_ONLY },
  { surface: covers('page:/admin/users/import'), path: '/admin/users/import', allow: ADMIN_ONLY },

  // ── Platform console (platform_admins only) ───────────────────────────────
  { surface: covers('page:/platform'), path: '/platform', allow: PLATFORM },
  { surface: covers('page:/platform/audit'), path: '/platform/audit', allow: PLATFORM },
  { surface: covers('page:/platform/feedback'), path: '/platform/feedback', allow: PLATFORM },
  { surface: covers('page:/platform/tenants/new'), path: '/platform/tenants/new', allow: PLATFORM },
  { surface: covers('page:/platform/tenants/[id]'), path: `/platform/tenants/${ORG_A}`, allow: PLATFORM },
  { surface: covers('page:/platform/tenants/[id]/edit'), path: `/platform/tenants/${ORG_A}/edit`, allow: PLATFORM },
  { surface: covers('page:/platform/tenants/[id]/billing'), path: `/platform/tenants/${ORG_A}/billing`, allow: PLATFORM },
]
