# Council Review 2 — Synthesis
_Date: 2026-06-23 · MVP Score: 68/100_

Agent reports: [State](2026-06-23-council-review-2-agent-1-state.md) · [Routes](2026-06-23-council-review-2-agent-2-routes.md) · [UX](2026-06-23-council-review-2-agent-3-ux.md) · [Features](2026-06-23-council-review-2-agent-4-features.md)

---

## Cross-Agent Consensus Findings

### Consensus Finding: Assessment Config-Behavior Gap
**Flagged by:** Agent 3 (UX), Agent 4 (Features)  
**Finding:** `attempts_allowed` and `requirements.minimum_grade_pct` are saved by QuizForm and AssignmentForm respectively, but neither field is read by `submitQuiz`, `submitAssignment`, or any player component. Teachers configure limits and thresholds that have zero runtime effect.  
**Priority:** CRITICAL — blocks credentialing use case entirely.

### Consensus Finding: VideoPlayer Config-Behavior Gap
**Flagged by:** Agent 3 (UX), Agent 4 (Features — identified pattern class)  
**Finding:** VideoForm saves `duration_minutes` and `requirements.must_view`. BlockPlayer (`src/components/learning/BlockPlayer.tsx` lines 46–51) never extracts these fields and passes neither to VideoPlayer. Students see no duration and `must_view` has no effect.  
**Priority:** HIGH

### Consensus Finding: Orphaned `/api/analytics/events` Route
**Flagged by:** Agent 1 (State — noted as "OK but no client caller"), Agent 2 (Routes — marked ORPHANED)  
**Finding:** `src/app/api/analytics/events/route.ts` is a POST endpoint with auth that has no frontend caller. It co-exists with the `engagement_events` table (migration 20260622100000). Either it should be called from the learn page on block view, or it should be removed.  
**Priority:** MEDIUM

### Consensus Finding: Guardian Workflow Gaps
**Flagged by:** Agent 1 (State — guardian links not seeded), Agent 4 (Features — no grade notification, no self-service linking)  
**Finding:** (1) `gradeSubmission` server action does not insert to `guardian_notification_queue`, so guardians never receive email when a grade is posted. (2) No self-service guardian-to-student linking exists; requires admin to create `guardian_links` row manually.  
**Priority:** HIGH

### Consensus Finding: live_session Block Type is_active Mismatch
**Flagged by:** Agent 1 (State), confirmed present in `src/types/blocks.ts` (line 28 `is_active: true`) vs. migration `20240601000002` (`is_active: false`)  
**Finding:** TypeScript and DB disagree on whether `live_session` is active. If the DB value is ever used to filter active block types, live session blocks would disappear from the builder.  
**Priority:** MEDIUM

---

## ADR Drafted

- **[ADR-2026-008](../decisions/ADR-2026-008.md)** — Assessment Enforcement Contract: any field in `course_blocks.content` that expresses a constraint (`attempts_allowed`, `minimum_grade_pct`, `must_view`) is a binding server-side constraint, not a display hint. Server actions must enforce it; player components must display it.

---

## Implementation Prompts

### Prompt A — Enforce Quiz Attempt Limits and Minimum Grade Threshold

**ADR Reference:** ADR-2026-008  
**Files:** `src/app/actions/learning.ts`, `src/components/learning/QuizPlayer.tsx`, `src/components/learning/BlockPlayer.tsx`  
**Scope:** `submitQuiz` must count prior attempts for the same `(block_id, enrollment_id)` and reject the submission if `attempts_allowed` is exceeded. `BlockPlayer` must pass `attemptsAllowed` and `minimumGradePct` to `QuizPlayer`. `QuizPlayer` must display remaining attempts and the passing threshold to the student before they submit.

**Work:**
1. In `submitQuiz` (`src/app/actions/learning.ts`): read `attempts_allowed` from `course_blocks.content` for the given `blockId`. Count rows in `block_submissions` where `block_id = blockId AND enrollment_id = <enrollment>`. If count >= `attempts_allowed` (and `attempts_allowed > 0`), return `{ error: 'No attempts remaining' }` without processing.
2. After scoring, read `requirements.minimum_grade_pct` from block content. If the earned score percentage is below the threshold, set submission `status = 'returned'` and add to `feedback` a note indicating the minimum required. Do not set `status = 'submitted'` for a below-threshold attempt.
3. In `BlockPlayer.tsx` (quiz branch): extract `content.attempts_allowed` and `content.requirements?.minimum_grade_pct`. Pass as `attemptsAllowed` and `minimumGradePct` props to `QuizPlayer`.
4. In `QuizPlayer.tsx`: accept these props. Before rendering questions, query prior submission count (can use the `existingSub` pattern or a separate count prop passed from the learn page). Display "Attempt X of Y" and "Passing score: Z%" above the question list. Disable the submit button and show "No attempts remaining" if exhausted.

**Security:** Caller must be authenticated (`supabase.auth.getUser()`). Enrollment lookup must use the authenticated user's ID — never a client-supplied enrollment_id. Attempt count query must be scoped to `block_id AND enrollment_id` (not just `block_id`) to prevent cross-student manipulation.

**Verification:**
- `npm run typecheck`
- `npm test`
- `npm run lint`
- Manual: configure a quiz with 2 attempts; verify third submission is rejected with error. Configure 80% minimum; verify a 50% score returns status `returned` with feedback.

---

### Prompt B — VideoPlayer Config-Behavior Gap (duration + must_view)

**ADR Reference:** ADR-2026-008  
**Files:** `src/components/learning/BlockPlayer.tsx`, `src/components/learning/VideoPlayer.tsx`  
**Scope:** `BlockPlayer` must extract `duration_minutes` and `requirements.must_view` from the video block's content and pass them to `VideoPlayer`. `VideoPlayer` must display duration and, when `must_view` is true, render a "Mark as Watched" confirmation button that records a `block_submissions` entry via a server action.

**Work:**
1. In `BlockPlayer.tsx` (video_stream branch): extract `content.duration_minutes` (number | undefined) and `content.requirements?.must_view` (boolean | undefined). Pass as `durationMinutes` and `mustView` props to `VideoPlayer`.
2. In `VideoPlayer.tsx`: accept `durationMinutes?: number` and `mustView?: boolean` props. If `durationMinutes` is set, display it below the video (e.g., "~12 min"). If `mustView` is true and no `existingSub` is present, render a "Mark as Watched" button below the player. On click, call a new server action `markVideoWatched(blockId)` that inserts a `block_submissions` row (`status: 'submitted'`, `content: { watched: true }`). After confirmation, show a "Watched ✓" badge and call `onComplete`.
3. Add `markVideoWatched` to `src/app/actions/learning.ts` following the same enrollment lookup pattern as `markSelfAttendance`.

**Security:** `markVideoWatched` must verify auth and enrollment before inserting. The `user_id` in the submission must come from the authenticated session, never a client-supplied value.

**Verification:**
- `npm run typecheck`
- `npm run lint`
- Manual: add a video block with `must_view = true`; confirm "Mark as Watched" button appears and submission is recorded. Add a video block without `must_view`; confirm no button appears.

---

### Prompt C — aria-expanded Boolean Fix in NotificationBell

**ADR Reference:** none  
**Files:** `src/components/layout/NotificationBell.tsx`  
**Scope:** Replace the string-literal spread pattern for `aria-expanded` with a direct boolean prop. Single-line fix.

**Work:**
1. Find the line (around line 75) using the spread `{..{ 'aria-expanded': (open ? 'true' : 'false') as 'true' | 'false' }}` on the notifications button.
2. Replace with `aria-expanded={open}` directly on the button element.

**Security:** None — this is a purely cosmetic ARIA fix with no auth or data implications.

**Verification:**
- `npm run typecheck`
- Manual: open browser dev tools, inspect the notification bell button, confirm `aria-expanded` attribute toggles between `true` (boolean) and absent/false when the panel opens and closes.

---

### Prompt D — DiscussionForm max_score Field

**ADR Reference:** none  
**Files:** `src/components/builder/node-forms/DiscussionForm.tsx`, `src/components/learning/BlockPlayer.tsx`  
**Scope:** Add a `max_score` number field to `DiscussionForm` so teachers can configure the point value per discussion. `BlockPlayer` reads the value from block content instead of the hardcoded default of 10.

**Work:**
1. In `DiscussionForm.tsx`: add a `max_score` state field (default 10, min 0, max 1000). Add a `Field` + `<input type="number">` for it in the form. Include `max_score` in the `content` object passed to `onSave`.
2. In `BlockPlayer.tsx` (discussion branch, around line 180): replace the hardcoded `?? 10` default with `(content.max_score as number | undefined) ?? 10` so the teacher-configured value is used.

**Security:** None — no auth or tenant implications. Builder already enforces teacher/admin role.

**Verification:**
- `npm run typecheck`
- `npm run lint`
- Manual: create a discussion block, set max_score to 25, save and re-open form — confirm value persists. Open the block in learn view and confirm DiscussionPlayer receives max_score 25.

---

### Prompt E — Guardian Grade Notification

**ADR Reference:** none  
**Files:** `src/app/actions/learning.ts` (specifically the `gradeSubmission` function)  
**Scope:** After a teacher saves a grade via `gradeSubmission`, insert a row to `guardian_notification_queue` for each guardian linked to the graded student, so the guardian email pipeline (already wired for course completion and badges) fires for grade events.

**Work:**
1. In `gradeSubmission` (`src/app/actions/learning.ts`): after the successful grade update, look up the graded student's `uid` (from the submission's `user_id` → join to `profiles` via `auth_id`).
2. Query `guardian_links` (or `profile_relationships` — verify exact table name in migration 20240601000033) where `student_uid = <student_uid>` to get all linked guardian profile UIDs.
3. For each guardian, insert a row to `guardian_notification_queue` with the appropriate event type (e.g., `'assignment_graded'`), student UID, course ID, score, and feedback. Follow the shape established by the course-completion inserts in that table.
4. The Edge Function `send-guardian-notifications` already processes this queue — no changes to the Edge Function needed.

**Security:** This runs inside an existing teacher-authenticated server action. The guardian lookup uses service client (already established pattern for service-side operations in learning.ts). Never expose guardian email or auth_id to the response.

**Verification:**
- `npm run typecheck`
- Manual: grade an assignment for a student who has a linked guardian; confirm a row appears in `guardian_notification_queue` in Supabase dashboard.

---

### Prompt F — Fix live_session Block Type is_active Mismatch

**ADR Reference:** none  
**Files:** `supabase/migrations/20260623110000_fix_live_session_block_type.sql` (new file)  
**Scope:** The `block_types` table has `live_session` as `is_active = false` from the original seed. TypeScript `BLOCK_TYPE_META` has it as `is_active: true`. Create a migration to align the DB with the TypeScript truth.

**Work:**
1. Create migration file `supabase/migrations/20260623110000_fix_live_session_block_type.sql`.
2. Content: `UPDATE public.block_types SET is_active = true WHERE id = 'live_session';`
3. Run `supabase db push` to apply.

**Security:** None — block_types is a reference table with no tenant data.

**Verification:**
- `supabase db push` with no errors.
- Query: `SELECT id, is_active FROM block_types WHERE id = 'live_session';` — confirm `true`.

---

### Prompt G — Wire or Remove Orphaned /api/analytics/events Route

**ADR Reference:** none  
**Files:** `src/app/api/analytics/events/route.ts`, `src/app/courses/[id]/learn/page.tsx` OR `src/components/learning/LearningShell.tsx`  
**Scope:** The `/api/analytics/events` POST route exists with auth but has no client caller. The `engagement_events` table (migration 20260622100000) was created for an engagement ledger. Determine whether the route should be called from the learn page on block view, or removed.

**Work:**
1. Read `src/app/api/analytics/events/route.ts` to understand what payload it expects.
2. Read migration `20260622100000_engagement_tracker.sql` to understand the `engagement_events` table shape.
3. If the route receives `{ block_id, event_type }` and inserts to `engagement_events`, wire it: in `LearningShell` or the block-view callback, fire a `fetch('/api/analytics/events', { method: 'POST', body: ... })` on block open. Use `navigator.sendBeacon` or a fire-and-forget pattern — do not block the UX on this call.
4. If the route is superseded by the `markBlockViewed` server action already tracking engagement, delete the route file and the dead code.

**Security:** Route already requires auth. If wired from the client, the payload must only contain block_id and event_type — never user_id (derive it server-side from the session).

**Verification:**
- If wired: confirm rows appear in `engagement_events` after opening a block.
- If removed: `npm run typecheck` passes, no broken imports.

---

## Execution Order

**Round 1 — Independent, can run in parallel:**
- Prompt C (aria-expanded fix — touches only NotificationBell)
- Prompt D (DiscussionForm max_score — touches only DiscussionForm + one BlockPlayer line)
- Prompt F (live_session migration — DB only)

**Round 2 — Can run in parallel after Round 1:**
- Prompt A (quiz enforcement — touches learning.ts submitQuiz + QuizPlayer + BlockPlayer)
- Prompt B (video must_view — touches BlockPlayer video branch + VideoPlayer + new markVideoWatched action)

**Round 3 — Must follow Round 2:**
- Prompt E (guardian grade notification — touches learning.ts gradeSubmission; must not conflict with Prompt A edits to same file)

**Round 4 — Independent investigation, any time:**
- Prompt G (analytics/events — read first, then decide wire vs. remove)

**File conflict map:**
- `src/app/actions/learning.ts` is touched by Prompt A (submitQuiz), Prompt B (markVideoWatched), and Prompt E (gradeSubmission). Run these sequentially, not in parallel.
- `src/components/learning/BlockPlayer.tsx` is touched by Prompt A and Prompt B. Run sequentially.

---

## Closed-Beta Gate

Before inviting any external users, the following prompts are mandatory:
1. **Prompt A** — assessment without attempt enforcement is a trust violation for any credentialing org
2. **Prompt C** — affects every page for every user
3. **Prompt F** — DB/TypeScript mismatch is a latent bug under any live_session block

Prompts B, D, E, and G are high-value but non-blocking for a supervised beta.
