# IMPLEMENT: ChurchCore LMS — Multi-Tenant Architecture

> **Status: SHIPPED** — Multi-tenant isolation implemented as of v0.20.x (COUNCIL-2025-014). Platform admin bootstrap, `organizations` table, tenant lifecycle, and RLS isolation are live. See `supabase/migrations/` and `ADR-2026-001` for the authoritative record.

**ADR:** ADR-2025-008
**Council:** COUNCIL-2025-014 (7/7 unanimous)
**Date:** 2026-06-18

This document contains three sequenced implementation prompts. Complete Prompt 1 before
starting Prompt 2. Complete Prompt 2 before starting Prompt 3. Each prompt is
self-contained and can be handed to an AI coder independently.

---

---

# PROMPT 1 OF 3 — Database: Platform Admin, Tenant Lifecycle, RLS Isolation

## Context

ChurchCore LMS is a Next.js + Supabase LMS. The stack: Next.js App Router, TypeScript,
Supabase Postgres + RLS, Edge runtime, Vercel.

This prompt implements the database layer of multi-tenant isolation as specified in
ADR-2025-008. No UI changes are required in this prompt — database and migrations only.

## SECURITY NON-NEGOTIABLES

- RLS must remain ENABLED on every table. Never `SET row_security = off`.
- `is_platform_admin()` reads ONLY `platform_admins`. Never `profiles.role`.
- The first platform admin is inserted via migration with a hardcoded auth UUID. Never
  via the application UI.
- Setting `profiles.role = 'admin'` grants org-level admin only. It cannot grant
  platform admin.
- Service role key is server-side only. Never in client components.

---

## Migration 1: Platform Admin Table and Function

Create `supabase/migrations/<timestamp>_platform_admins.sql`:

```sql
-- ─── platform_admins: separate identity plane for super-admins ───────────────
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id      uuid        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read or write this table
CREATE POLICY "platform_admins: read own"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admins: insert"
  ON public.platform_admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_admins: delete"
  ON public.platform_admins FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- ─── is_platform_admin(): the single gate for platform-level access ───────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_id = auth.uid()
  )
$$;

REVOKE ALL   ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ─── platform_audit_log: every platform admin action logged ──────────────────
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid        NOT NULL REFERENCES auth.users(id),
  action     text        NOT NULL,
  target_org uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_audit_log: platform admins read"
  ON public.platform_audit_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_audit_log: service role insert"
  ON public.platform_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── Bootstrap: first platform admin ─────────────────────────────────────────
-- Replace <YOUR_AUTH_UID> with the auth.users.id of the platform owner account.
-- Run `SELECT id FROM auth.users WHERE email = 'your@email.com'` to find it.
-- INSERT INTO public.platform_admins (auth_id, display_name)
-- VALUES ('<YOUR_AUTH_UID>', 'Platform Owner');
```

---

## Migration 2: Tenant Lifecycle Columns

Create `supabase/migrations/<timestamp>_tenant_lifecycle.sql`:

```sql
-- ─── organizations: add lifecycle columns ────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'suspended', 'deleted')),
  ADD COLUMN IF NOT EXISTS plan         text        NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'standard', 'premium')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- settings JSONB already exists — ensure it has branding/features/onboarding keys
UPDATE public.organizations
SET settings = settings
  || '{"branding": {}, "features": {"ai_tutor": true, "guardian_portal": true, "leaderboard": true, "hq": true, "reporting": true}, "onboarding": {"logo_uploaded": false, "first_teacher_invited": false, "first_course_created": false, "first_announcement_published": false}}'::jsonb
WHERE settings IS NOT NULL
  AND NOT (settings ? 'features');

-- ─── profile_roles: add tenant_active for suspended-tenant RLS ───────────────
ALTER TABLE public.profile_roles
  ADD COLUMN IF NOT EXISTS tenant_active boolean NOT NULL DEFAULT true;

-- ─── sync_profile_roles: extend trigger to set tenant_active ─────────────────
-- Re-create the trigger function to also sync tenant_active from organizations.
CREATE OR REPLACE FUNCTION public.sync_profile_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_active boolean := true;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.org_id IS NOT NULL THEN
    SELECT (status NOT IN ('suspended', 'deleted'))
      INTO v_tenant_active
      FROM public.organizations
      WHERE id = NEW.org_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profile_roles (auth_id, uid, role, status, current_level, org_id, tenant_active)
    VALUES (NEW.auth_id, NEW.uid, NEW.role, NEW.status,
            COALESCE(NEW.current_level, 1), NEW.org_id, COALESCE(v_tenant_active, true))
    ON CONFLICT (auth_id) DO UPDATE
      SET uid           = EXCLUDED.uid,
          role          = EXCLUDED.role,
          status        = EXCLUDED.status,
          current_level = EXCLUDED.current_level,
          org_id        = EXCLUDED.org_id,
          tenant_active = EXCLUDED.tenant_active;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.profile_roles
    SET uid           = NEW.uid,
        role          = NEW.role,
        status        = NEW.status,
        current_level = COALESCE(NEW.current_level, 1),
        org_id        = NEW.org_id,
        tenant_active = COALESCE(v_tenant_active, true)
    WHERE auth_id = NEW.auth_id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_roles WHERE auth_id = OLD.auth_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Function to suspend all profiles when org is suspended ──────────────────
CREATE OR REPLACE FUNCTION public.sync_org_status_to_profiles(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT (status NOT IN ('suspended', 'deleted')) INTO v_active
    FROM public.organizations WHERE id = p_org_id;

  UPDATE public.profile_roles
    SET tenant_active = COALESCE(v_active, true)
    WHERE org_id = p_org_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.sync_org_status_to_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_org_status_to_profiles(uuid) TO service_role;

-- ─── Rewrite organizations RLS to include platform admin bypass ───────────────
DROP POLICY IF EXISTS "organizations: admin manage"      ON public.organizations;
DROP POLICY IF EXISTS "organizations: members read own org" ON public.organizations;

CREATE POLICY "organizations: platform admin full access"
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "organizations: members read own"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
  );

CREATE POLICY "organizations: org admin update own"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND public.current_user_role() = 'admin'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND public.current_user_role() = 'admin'
  );
```

---

## Migration 3: org_id Backfill and RLS Rewrite for Missing Tables

Create `supabase/migrations/<timestamp>_org_id_rls_isolation.sql`:

```sql
-- ─── Add org_id to tables that are missing it ────────────────────────────────
-- Pattern: add column, backfill from created_by → profiles.org_id, add NOT NULL,
--          add FK, rewrite RLS.

-- ANNOUNCEMENTS
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.announcements a
SET org_id = p.org_id
FROM public.profiles p
WHERE a.created_by = p.uid AND a.org_id IS NULL;

ALTER TABLE public.announcements ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "announcements: published visible" ON public.announcements;
DROP POLICY IF EXISTS "announcements: staff manage"      ON public.announcements;

CREATE POLICY "announcements: members read own org"
  ON public.announcements FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.current_user_org_id() = org_id);

CREATE POLICY "announcements: staff manage own org"
  ON public.announcements FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- CALENDAR_EVENTS
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.calendar_events e
SET org_id = p.org_id
FROM public.profiles p
WHERE e.created_by = p.uid AND e.org_id IS NULL;

ALTER TABLE public.calendar_events ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "calendar_events: authenticated read" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events: staff manage"       ON public.calendar_events;

CREATE POLICY "calendar_events: members read own org"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.current_user_org_id() = org_id);

CREATE POLICY "calendar_events: staff manage own org"
  ON public.calendar_events FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- NOTIFICATIONS
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.notifications n
SET org_id = p.org_id
FROM public.profiles p
WHERE n.user_id = p.uid AND n.org_id IS NULL;

ALTER TABLE public.notifications ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "notifications: users read own" ON public.notifications;
DROP POLICY IF EXISTS "notifications: users manage own" ON public.notifications;

CREATE POLICY "notifications: users read own"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND (public.is_platform_admin() OR public.current_user_org_id() = org_id)
  );

CREATE POLICY "notifications: service role insert"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "notifications: users update own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

-- MESSAGE_THREADS
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.message_threads t
SET org_id = p.org_id
FROM public.profiles p
JOIN public.message_thread_participants mtp ON mtp.thread_id = t.id
WHERE mtp.user_id = p.uid AND t.org_id IS NULL
LIMIT 1;

ALTER TABLE public.message_threads ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "message_threads: participants read" ON public.message_threads;

CREATE POLICY "message_threads: participants read own org"
  ON public.message_threads FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND id IN (
      SELECT thread_id FROM public.message_thread_participants
      WHERE user_id = public.current_user_uid()
    )
  );

CREATE POLICY "message_threads: participants insert"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (public.current_user_org_id() = org_id);

-- MESSAGES
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.messages m
SET org_id = t.org_id
FROM public.message_threads t
WHERE m.thread_id = t.id AND m.org_id IS NULL;

ALTER TABLE public.messages ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "messages: thread participants read" ON public.messages;
DROP POLICY IF EXISTS "messages: thread participants send" ON public.messages;

CREATE POLICY "messages: thread participants read own org"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND thread_id IN (
      SELECT thread_id FROM public.message_thread_participants
      WHERE user_id = public.current_user_uid()
    )
  );

CREATE POLICY "messages: thread participants send"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND sender_id = public.current_user_uid()
  );

-- BLOCK_SUBMISSIONS
ALTER TABLE public.block_submissions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.block_submissions s
SET org_id = p.org_id
FROM public.profiles p
WHERE s.user_id = p.uid AND s.org_id IS NULL;

ALTER TABLE public.block_submissions ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "block_submissions: students manage own" ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: teachers read"       ON public.block_submissions;

CREATE POLICY "block_submissions: students manage own"
  ON public.block_submissions FOR ALL TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND user_id = public.current_user_uid()
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND user_id = public.current_user_uid()
  );

CREATE POLICY "block_submissions: staff read own org"
  ON public.block_submissions FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- COURSE_CERTIFICATES
ALTER TABLE public.course_certificates
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_certificates c
SET org_id = p.org_id
FROM public.profiles p
WHERE c.user_id = p.uid AND c.org_id IS NULL;

ALTER TABLE public.course_certificates ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "course_certificates: students read own" ON public.course_certificates;
DROP POLICY IF EXISTS "course_certificates: staff manage"      ON public.course_certificates;

CREATE POLICY "course_certificates: students read own"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND user_id = public.current_user_uid()
  );

CREATE POLICY "course_certificates: staff read own org"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

CREATE POLICY "course_certificates: service role insert"
  ON public.course_certificates FOR INSERT TO service_role
  WITH CHECK (true);

-- GUARDIAN_LINKS
ALTER TABLE public.guardian_links
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.guardian_links g
SET org_id = p.org_id
FROM public.profiles p
WHERE g.guardian_uid = p.uid AND g.org_id IS NULL;

ALTER TABLE public.guardian_links ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "guardian_links: guardians read own" ON public.guardian_links;

CREATE POLICY "guardian_links: guardians read own"
  ON public.guardian_links FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND guardian_uid = public.current_user_uid()
  );

CREATE POLICY "guardian_links: admins manage"
  ON public.guardian_links FOR ALL TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() = 'admin'
  );

-- USER_AUDIT_LOG
ALTER TABLE public.user_audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.user_audit_log l
SET org_id = p.org_id
FROM public.profiles p
WHERE l.user_id = p.uid AND l.org_id IS NULL;

DROP POLICY IF EXISTS "user_audit_log: admins read" ON public.user_audit_log;

CREATE POLICY "user_audit_log: admins read own org"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "user_audit_log: service role insert"
  ON public.user_audit_log FOR INSERT TO service_role
  WITH CHECK (true);

-- PROFILES: add suspended-tenant block
DROP POLICY IF EXISTS "profiles: users read own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff read others" ON public.profiles;
DROP POLICY IF EXISTS "profiles: users update own"  ON public.profiles;

CREATE POLICY "profiles: users read own"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    uid = public.current_user_uid()
    AND (
      SELECT tenant_active FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1
    ) = true
  );

CREATE POLICY "profiles: staff read same org"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
    AND (
      SELECT tenant_active FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1
    ) = true
  );

CREATE POLICY "profiles: platform admin read all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "profiles: users update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (uid = public.current_user_uid())
  WITH CHECK (uid = public.current_user_uid());
```

---

## Acceptance Criteria — Prompt 1

- [ ] `platform_admins` table exists with RLS enabled
- [ ] `is_platform_admin()` returns false for all non-platform-admin users
- [ ] `is_platform_admin()` returns true for a user in `platform_admins`
- [ ] `organizations` has `status`, `plan`, `trial_ends_at`, `deleted_at` columns
- [ ] `profile_roles` has `tenant_active` column, synced by trigger
- [ ] All 9 tables listed above have `org_id` and rewritten RLS policies
- [ ] User in Tenant A cannot SELECT from Tenant B's announcements, messages, or notifications
- [ ] Suspended tenant: `profile_roles.tenant_active = false`, user cannot read their profile
- [ ] `platform_audit_log` exists with RLS: only platform admins can read
- [ ] `sync_org_status_to_profiles()` function exists and callable by service_role

---

---

# PROMPT 2 OF 3 — Platform Admin Console (`/platform`)

## Context

Prerequisite: Prompt 1 is complete and applied to Supabase.

Build the `/platform` route — the super-admin tenant management console. This is
completely separate from `/admin` (which is org-level). Only users in `platform_admins`
can access this route.

Stack: Next.js App Router, TypeScript, Supabase, Tailwind CSS, shadcn/ui components.
Server components where possible. Client components only for interactive forms.

## SECURITY NON-NEGOTIABLES

- The `/platform` route group must check `is_platform_admin()` at the server component
  level. A failed check redirects to `/dashboard`, not a 403 — do not confirm the route exists.
- The platform console never renders tenant course content or student records.
- Every mutating action (create, suspend, delete) writes to `platform_audit_log`.
- Tenant deletion is soft-delete only from the UI. Hard delete is a background job.
- `SUPABASE_SERVICE_ROLE_KEY` is used for admin operations — server actions only, never client.

---

## Route Structure

```
src/app/platform/
  layout.tsx          ← Server. Checks is_platform_admin(). Redirects non-admins to /dashboard.
  page.tsx            ← Server. Tenant list + usage overview.
  tenants/
    new/page.tsx      ← Client form. Create tenant + provision first admin.
    [id]/page.tsx     ← Server. Tenant detail: usage, settings, users.
    [id]/edit/page.tsx ← Client form. Edit name, plan, features, branding.
  audit/page.tsx      ← Server. Platform audit log.
```

---

## Layout: Auth Guard

```typescript
// src/app/platform/layout.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) redirect('/dashboard')  // silent redirect — don't reveal route exists

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Platform nav: Tenants | Audit Log */}
      {children}
    </div>
  )
}
```

---

## Main Page: Tenant List

`/platform/page.tsx` — server component.

**Query:** Select all organizations with aggregated metrics:
```sql
SELECT
  o.id, o.name, o.slug, o.status, o.plan, o.trial_ends_at, o.deleted_at, o.created_at,
  o.settings,
  COUNT(DISTINCT p.uid)::int AS user_count,
  COUNT(DISTINCT c.id)::int  AS course_count
FROM organizations o
LEFT JOIN profiles p ON p.org_id = o.id
LEFT JOIN courses c  ON c.org_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.id
ORDER BY o.created_at DESC
```

Use `supabase.rpc('platform_get_tenants')` — define this RPC as a SECURITY DEFINER
function callable only by platform admins.

**UI:**
- Stat bar: total tenants, active tenants, trial tenants, tenants expiring in 30 days
- Table: name, status badge, plan badge, users, courses, health score, trial_ends_at,
  actions (Edit | Suspend | Delete)
- "New Tenant" button → `/platform/tenants/new`

**Health score** (computed client-side from returned data):
```
score = (active_users_last_30d / total_users * 50) + (avg_course_completion * 50)
```
Since last-30d and completion data aren't in this query, simplify Phase 1 to:
```
score = min(100, (course_count * 10) + (user_count * 5))
```
Display as a colored badge: 0–39 red, 40–69 amber, 70–100 green.

---

## Create Tenant Form

`/platform/tenants/new/page.tsx` — client component.

**Fields:**
- Organization name (text)
- Slug (auto-generated from name, editable)
- Plan (select: free / standard / premium)
- Trial duration in days (number, default 14, only shown if plan = free)
- First admin email (text) — triggers invite email
- Feature flags (checkboxes): AI Tutor, Guardian Portal, Leaderboard, HQ, Reporting

**On submit:** call server action `createTenant(formData)`:

```typescript
'use server'
import { createServiceClient } from '@/lib/supabase/service'  // uses SUPABASE_SERVICE_ROLE_KEY

export async function createTenant(formData: FormData) {
  const supabase = createServiceClient()

  // 1. Verify caller is platform admin
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) throw new Error('Unauthorized')

  // 2. Insert organization
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: formData.get('name'),
      slug: formData.get('slug'),
      plan: formData.get('plan'),
      status: formData.get('plan') === 'free' ? 'trial' : 'active',
      trial_ends_at: formData.get('plan') === 'free'
        ? new Date(Date.now() + Number(formData.get('trial_days')) * 86400000).toISOString()
        : null,
      settings: {
        branding: {},
        features: {
          ai_tutor:        formData.get('feat_ai_tutor') === 'on',
          guardian_portal: formData.get('feat_guardian') === 'on',
          leaderboard:     formData.get('feat_leaderboard') === 'on',
          hq:              formData.get('feat_hq') === 'on',
          reporting:       formData.get('feat_reporting') === 'on',
        },
        onboarding: {
          logo_uploaded: false,
          first_teacher_invited: false,
          first_course_created: false,
          first_announcement_published: false,
        },
      },
    })
    .select()
    .single()

  if (orgErr) throw orgErr

  // 3. Invite first admin via Supabase Admin API
  const adminEmail = formData.get('admin_email') as string
  if (adminEmail) {
    await supabase.auth.admin.inviteUserByEmail(adminEmail, {
      data: { org_id: org.id, role: 'admin' },
    })
  }

  // 4. Log to platform_audit_log
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('platform_audit_log').insert({
    actor_id: user!.id,
    action: 'create_tenant',
    target_org: org.id,
    payload: { name: org.name, plan: org.plan, admin_email: adminEmail },
  })

  redirect(`/platform/tenants/${org.id}`)
}
```

---

## Suspend / Restore / Delete Actions

Server actions in `src/app/platform/actions.ts`:

```typescript
export async function suspendTenant(orgId: string) { /* set status='suspended', call sync_org_status_to_profiles, log */ }
export async function restoreTenant(orgId: string) { /* set status='active', call sync_org_status_to_profiles, log */ }
export async function softDeleteTenant(orgId: string) { /* set deleted_at=now(), status='deleted', log */ }
```

Each action: verify `is_platform_admin()`, mutate, call `sync_org_status_to_profiles(orgId)`,
write to `platform_audit_log`, revalidatePath.

---

## Tenant Detail Page

`/platform/tenants/[id]/page.tsx` — server component.

Shows: org name, status, plan, trial_ends_at, settings.branding, settings.features,
user list (uid, email, role, status, last_sign_in_at from auth.users), course list,
platform audit log entries for this org.

Queries via service role client (bypasses RLS to get full tenant metadata).

---

## Onboarding Checklist (Org Admin View)

This renders for org admins on first login, NOT in the platform console. Add to
`src/app/dashboard/page.tsx`:

```typescript
// If profile.org.settings.onboarding has any false values, show checklist banner
const onboarding = org.settings?.onboarding ?? {}
const steps = [
  { key: 'logo_uploaded',              label: 'Upload your organization logo',      href: '/profile' },
  { key: 'first_teacher_invited',      label: 'Invite your first teacher',          href: '/admin/users' },
  { key: 'first_course_created',       label: 'Create your first course',           href: '/courses' },
  { key: 'first_announcement_published', label: 'Publish a welcome announcement',  href: '/announcements' },
]
const complete = steps.filter(s => onboarding[s.key]).length
// If complete === steps.length, do not render the checklist
```

Update `organizations.settings.onboarding.*` via server action when each action completes.

---

## Feature Flags in Layout

In the app root layout (`src/app/layout.tsx`), fetch the user's org settings and pass
`features` to the sidebar:

```typescript
const { data: org } = await supabase
  .from('organizations')
  .select('settings, name')
  .eq('id', profile.org_id)
  .single()

const features = org?.settings?.features ?? {}
const branding = org?.settings?.branding ?? {}
// Pass features to SidebarServer; it filters LINKS by feature flag
```

In `SidebarClient.tsx`, add `featureGate?: string` to `NavLink` interface and filter:
```typescript
LINKS.filter(l => !l.featureGate || features[l.featureGate])
```

Apply branding CSS variables in the root layout `<html>` tag:
```typescript
style={{ '--color-primary': branding.primary_color ?? '#6366f1' } as React.CSSProperties}
```

---

## Acceptance Criteria — Prompt 2

- [ ] `/platform` redirects to `/dashboard` for non-platform-admin users (silently)
- [ ] `/platform` shows tenant list with status, plan, user count, course count, health score
- [ ] Create tenant form creates org + sends invite email to first admin
- [ ] Suspend sets `status = 'suspended'` and `profile_roles.tenant_active = false` for all org users
- [ ] Restore sets `status = 'active'` and `profile_roles.tenant_active = true` for all org users
- [ ] Soft delete sets `deleted_at` and `status = 'deleted'`
- [ ] Every mutating action writes to `platform_audit_log`
- [ ] Tenant detail page shows users and courses for selected org
- [ ] Org admin sees onboarding checklist on dashboard until all steps are complete
- [ ] Feature flags filter sidebar links correctly (AI tutor hidden when flag is false)
- [ ] Branding primary color applied as CSS variable from `organizations.settings.branding`

---

---

# PROMPT 3 OF 3 — Scheduled Functions: Trial Expiry and Tenant Purge

## Context

Prerequisites: Prompts 1 and 2 are complete.

Create two Supabase Edge Functions that run on a schedule. These enforce tenant lifecycle
automatically without manual platform admin intervention.

Stack: Supabase Edge Functions (Deno), Supabase Admin client with service role.

---

## Function 1: expire-trials

`supabase/functions/expire-trials/index.ts`

**Schedule:** Daily at 00:30 UTC (configured in Supabase Dashboard → Edge Functions → Schedule)

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Find orgs whose trials have expired
  const { data: expired, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('status', 'trial')
    .lt('trial_ends_at', new Date().toISOString())

  if (error) return new Response(error.message, { status: 500 })
  if (!expired?.length) return new Response('No trials to expire', { status: 200 })

  for (const org of expired) {
    // Suspend the org
    await supabase.from('organizations').update({ status: 'suspended' }).eq('id', org.id)

    // Sync profile_roles.tenant_active = false for all org users
    await supabase.rpc('sync_org_status_to_profiles', { p_org_id: org.id })

    // Log the action
    await supabase.from('platform_audit_log').insert({
      actor_id: '00000000-0000-0000-0000-000000000000', // system actor
      action: 'trial_expired_auto_suspend',
      target_org: org.id,
      payload: { org_name: org.name },
    })

    console.log(`Suspended expired trial: ${org.name} (${org.id})`)
  }

  return new Response(`Suspended ${expired.length} expired trial(s)`, { status: 200 })
})
```

---

## Function 2: purge-deleted-tenants

`supabase/functions/purge-deleted-tenants/index.ts`

**Schedule:** Daily at 01:00 UTC

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('status', 'deleted')
    .lt('deleted_at', cutoff)

  if (!orgs?.length) return new Response('No tenants to purge', { status: 200 })

  for (const org of orgs) {
    // Delete in FK dependency order
    const tables = [
      'block_submissions', 'course_certificates', 'enrollments', 'direct_enrollments',
      'course_blocks', 'courses', 'announcements', 'calendar_events', 'notifications',
      'messages', 'message_thread_participants', 'message_threads',
      'guardian_links', 'profile_badges', 'profile_roles', 'profiles',
      'org_members',
    ]

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('org_id', org.id)
      if (error) console.error(`Error purging ${table} for ${org.id}:`, error.message)
    }

    // Finally delete the org itself
    await supabase.from('organizations').delete().eq('id', org.id)

    await supabase.from('platform_audit_log').insert({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'tenant_hard_purged',
      target_org: null,
      payload: { org_id: org.id, org_name: org.name },
    })

    console.log(`Purged tenant: ${org.name} (${org.id})`)
  }

  return new Response(`Purged ${orgs.length} tenant(s)`, { status: 200 })
})
```

---

## Acceptance Criteria — Prompt 3

- [ ] `expire-trials` function exists, deploys, and is callable with CRON_SECRET header
- [ ] Orgs with `status = 'trial'` and `trial_ends_at` in the past are set to `suspended`
- [ ] `profile_roles.tenant_active` is set to false for users in suspended orgs
- [ ] Each suspension is logged to `platform_audit_log`
- [ ] `purge-deleted-tenants` function exists and deletes in FK dependency order
- [ ] Orgs where `deleted_at > 30 days ago` and `status = 'deleted'` are fully purged
- [ ] Purge is logged to `platform_audit_log` with org metadata preserved in payload
- [ ] Both functions return 401 for requests without valid CRON_SECRET

---

## Cross-Prompt Acceptance (verify after all 3 prompts are done)

- [ ] Tenant A user cannot read Tenant B's data in any table
- [ ] Platform admin can access `/platform` and see all tenants
- [ ] Platform admin cannot access tenant course content through the console UI
- [ ] Creating a tenant sends an invite email to the first admin
- [ ] Org admin sees onboarding checklist until complete
- [ ] Feature flags hide/show sidebar links correctly
- [ ] Suspended tenant: users get blocked at the RLS layer, not just the UI
- [ ] Trial expiry auto-suspends orgs (tested by setting `trial_ends_at` to past)
- [ ] Deleted orgs are purged after 30 days in correct FK order
- [ ] Every platform admin action appears in the audit log
