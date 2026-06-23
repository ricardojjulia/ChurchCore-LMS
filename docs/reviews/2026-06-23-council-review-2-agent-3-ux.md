# Council Review 2 — Agent 3 UX Audit
_Date: 2026-06-23_

## ChurchCore LMS — UX & Shell Quality Audit

---

### 1. Config-Behavior Gaps (Form Saves / Player Ignores)

**VideoPlayer Gap — HIGH**
- Files: `src/components/builder/node-forms/VideoForm.tsx` (lines 12-14, 34) vs `src/components/learning/VideoPlayer.tsx`
- VideoForm saves `duration_minutes` and `requirements.must_view`, but VideoPlayer completely ignores both fields.
- `src/components/learning/BlockPlayer.tsx` (lines 46-51) never extracts or passes these fields to VideoPlayer.
- Students see no duration or viewing requirement. Teacher-configured `must_view` has no effect.

**DiscussionForm Missing max_score — MEDIUM**
- File: `src/components/builder/node-forms/DiscussionForm.tsx`
- DiscussionForm has no `max_score` field. BlockPlayer (line 180) hardcodes a default of 10 points.
- Teachers cannot configure per-discussion grading scales. The hardcoded default creates confusion for discussions intended to be worth different point values.

**QuizForm/QuizPlayer — CONFIRMED CORRECT**
- `time_limit_minutes`: enforced — BlockPlayer passes `timeLimitMinutes` to QuizPlayer, which implements localStorage-persisted countdown and auto-submits.
- `bank_draws`: enforced — BlockPlayer passes `bankDraws`, QuizPlayer calls `loadQuizQuestions` server action.
- `attempts_allowed`, `minimum_grade_pct`: NOT enforced (flagged independently by Agent 4 with full detail).

**LiveSessionForm — CONFIRMED CORRECT**
- All fields (provider, meeting_url, scheduled_for, duration_min, recording_url) correctly passed and rendered.

---

### 2. ARIA Correctness Issues

**aria-expanded String Literal Bug — HIGH**
- File: `src/components/layout/NotificationBell.tsx` (line 75)
- `aria-expanded` is set using string literals `"true"` and `"false"` via a spread: `{..{ 'aria-expanded': (open ? 'true' : 'false') as 'true' | 'false' }}`
- ARIA spec and React expect boolean `true`/`false`, not string values.
- Affects every user on every page load (notification bell is always rendered).
- Fix: `aria-expanded={open}` directly.

**Clear Button Missing aria-label — MEDIUM**
- File: `src/components/layout/GlobalSearch.tsx` (lines 181-187)
- The ✕ clear button is icon-only with no `aria-label`. Screen reader users cannot identify it.

---

### 3. Loading & Empty States

**Positive coverage:**
- `/admin/users/page.tsx` — handles `sorted.length === 0` with friendly message
- `/courses/page.tsx` — empty states for both empty catalog and filtered results
- `/guardian/page.tsx` — "No linked students yet" with guidance
- `/admin/cohorts/page.tsx` — "No cohorts yet" with CTA
- `/admin/terms/page.tsx` — "No terms yet" with CTA
- All major list pages have `loading.tsx` skeleton files
- No unguarded `.map()` calls found

---

### 4. Modal/Dialog ARIA Compliance

All modals confirmed correct:
- NotificationBell dialog: `role="dialog"` + `aria-modal="true"` + `aria-label` ✓
- GlobalSearch dialog: `role="dialog"` + `aria-modal="true"` + `aria-label` ✓
- MobileAdminDrawer: `role="dialog"` + `aria-modal="true"` + `aria-label` ✓

---

### 5. Nav Active State

Consistent pattern across all shells — `usePathname()` correctly detects active routes, `aria-current="page"` set on active items in:
- `src/components/layout/SidebarClient.tsx` ✓
- `src/components/layout/MobileBottomNav.tsx` ✓
- `src/components/layout/MobileAdminDrawer.tsx` ✓
- `src/app/platform/PlatformNav.tsx` ✓

---

### 6. CSS & Print Styles

- **No `@media print` rules** in `src/app/globals.css`
- Transcripts and certificates use `print:` Tailwind utility classes, but no global print stylesheet is defined.
- Recommend adding minimal print base styles at the global level.

---

### 7. Mobile Responsiveness

- No fixed-width layouts found.
- Mobile nav correctly hidden on desktop (`md:hidden`).
- Sidebar correctly hidden on mobile (`hidden md:flex`).
- Bottom nav has proper `safe-area-inset-bottom` for notched devices.

---

### 8. Error Boundaries

Present at all appropriate levels:
- `src/app/error.tsx` ✓
- `src/app/not-found.tsx` ✓
- `src/app/admin/error.tsx` ✓
- `src/app/courses/error.tsx` ✓
- `src/app/courses/[id]/error.tsx` ✓
- `src/app/courses/[id]/learn/error.tsx` ✓
- `src/app/dashboard/error.tsx` ✓
- `src/app/platform/error.tsx` ✓
- `src/app/(reports)/error.tsx` ✓

Database error handling: `/admin/users/page.tsx` (lines 61-71) checks for Supabase errors and displays user-facing message without leaking stack traces. ✓

---

### Top 3 UX Pain Points

1. **VideoPlayer Ignores Viewing Requirements and Duration** — `src/components/learning/VideoPlayer.tsx`. Students see no duration or must_view requirement. HIGH.
2. **aria-expanded String Literal Bug** — `src/components/layout/NotificationBell.tsx` (line 75). Affects all users on all pages. HIGH.
3. **DiscussionForm Can't Configure Points** — `src/components/builder/node-forms/DiscussionForm.tsx`. No `max_score` field; BlockPlayer defaults to 10. MEDIUM.
