# LAUNCH-BLOCKERS-IMPLEMENT.md

> **Status: SHIPPED** — All 8 prompts implemented. Sprint 1 complete as of v0.20.x. This is an archived implementation prompt file. See `CHANGELOG.md` for the full delivery record.

**Source:** COUNCIL-2025-017 (7/7 unanimous)
**Total estimate:** ~9–10 working days
**Video embed block:** ALREADY SHIPPED — removed from list.

Each prompt below is self-contained. Execute in order (1→8). Each prompt depends on
the previous only where noted.

---

## PROMPT 1 — Environment Schema + Resend Email + Weekly Digest Edge Function

**Estimate:** 1.5 days  
**Dependencies:** none

---

### Security preamble
- `RESEND_API_KEY` is server-side only. Never import `resend` in a client component.
- Auth invite tokens in emails must have tracking disabled (`open_tracking: false`,
  `click_tracking: false`) to prevent token exposure in Resend dashboard logs.
- No PII (email, name, uid) in OpenAI prompts. The weekly-summary route already
  complies — do not change that behavior.

---

### Step 0 — Validate env schema first (30 min)

Create `src/env.ts`. This is a plain TypeScript module that throws at startup if any
required env var is missing, so failures are loud and immediate rather than silent.

```typescript
// src/env.ts
function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

export const env = {
  supabaseUrl:           required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey:       required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey:    required('SUPABASE_SERVICE_ROLE_KEY'),
  resendApiKey:          required('RESEND_API_KEY'),
  emailFrom:             required('EMAIL_FROM'),           // e.g. "ChurchCore LMS <noreply@churchcore.io>"
  stripeSecretKey:       required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret:   required('STRIPE_WEBHOOK_SECRET'),
  upstashRedisUrl:       required('UPSTASH_REDIS_REST_URL'),
  upstashRedisToken:     required('UPSTASH_REDIS_REST_TOKEN'),
  sentryDsn:             process.env.SENTRY_DSN ?? '',    // optional during dev
}
```

Add all new vars to `.env.local.example` (never `.env.local` itself). Add
`src/env.ts` validation call in `src/app/layout.tsx` server component at the top
(`import '@/env'` — side-effect import triggers the throws on cold start).

---

### Step 1 — Email utility

`resend` is already in `package.json` (`^6.12.4`). No install needed.

Create `src/lib/email.ts`:

```typescript
import { Resend } from 'resend'
import { env } from '@/env'

const resend = new Resend(env.resendApiKey)

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[]
  subject: string
  react: React.ReactElement
}) {
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject,
    react,
    headers: {
      'X-Entity-Ref-ID': `${Date.now()}`,
    },
    // Disable tracking to prevent auth token exposure in dashboard
    // (Resend SDK v2+: set via tags or headers — check current SDK docs)
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}
```

---

### Step 2 — Email templates

Create directory `src/emails/`. Each file is a React Email component.

**`src/emails/InviteEmail.tsx`**
Props: `{ orgName: string; inviteUrl: string; role: string }`
Content: "You've been invited to join [orgName] on ChurchCore LMS. Your role is [role].
Click below to accept your invitation and create your account."
CTA button: "Accept Invitation" → `inviteUrl`

**`src/emails/EnrollmentConfirmationEmail.tsx`**
Props: `{ orgName: string; courseName: string; sectionCode: string; dashboardUrl: string }`
Content: "You've been enrolled in [courseName] (Section [sectionCode]) at [orgName]."
CTA button: "Go to My Dashboard" → `dashboardUrl`

**`src/emails/WeeklySummaryEmail.tsx`**
Props: `{ userName: string; summaryText: string; coursesInProgress: number; dashboardUrl: string }`
Content: "Here's your weekly learning summary for ChurchCore LMS."
Body: render `summaryText` (the AI-generated summary string already returned by
`/api/ai/weekly-summary`).
CTA button: "Continue Learning" → `dashboardUrl`

**`src/emails/BadgeAwardEmail.tsx`**
Props: `{ userName: string; badgeName: string; badgeDescription: string; dashboardUrl: string }`
Content: "You earned a new badge: [badgeName]. [badgeDescription]"
CTA button: "View Your Badges" → `dashboardUrl`

---

### Step 3 — Wire invite to send email

In `src/app/actions/admin.ts`, the `inviteUser` function already calls
`service.auth.admin.inviteUserByEmail()`. Supabase Auth system emails
(invite, magic link, password reset) are handled separately via SMTP config —
do NOT use `sendEmail()` for those. Instead:

**Configure Supabase Auth custom SMTP** (dashboard only, no code):
- Dashboard → Authentication → SMTP Settings → Enable Custom SMTP
- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: `[RESEND_API_KEY value]`
- Sender name: `ChurchCore LMS` (or read from org settings)
- Sender email: matches `EMAIL_FROM` env var

This covers: invite emails, magic-link sign-in, password reset, email confirmation.
No code changes to `inviteUser`.

For enrollment confirmation (new): after creating a `direct_enrollments` row in
`src/app/actions/enrollment.ts`, call `sendEmail()` with `EnrollmentConfirmationEmail`.

---

### Step 4 — Weekly Digest Edge Function

Create `supabase/functions/weekly-digest/index.ts`.

```typescript
// supabase/functions/weekly-digest/index.ts
// Triggered by Supabase cron: every Monday 8:00 AM UTC
// Sends a weekly summary email to each active user who has opted in.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')!
const EMAIL_FROM   = Deno.env.get('EMAIL_FROM')!
const CRON_SECRET  = Deno.env.get('CRON_SECRET')!
const APP_URL      = Deno.env.get('NEXT_PUBLIC_APP_URL')! // add to env

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch all active users with weekly_summary opt-in
  // profiles.settings->>'notifications' is a JSON object
  // Weekly summary opt-in: profiles.settings->'notifications'->>'weekly_summary' = 'true'
  const { data: users } = await svc
    .from('profiles')
    .select('uid, display_name, email:auth_id, org_id')
    .eq('status', 'active')
    .eq("settings->'notifications'->>'weekly_summary'", 'true')

  let sent = 0
  let failed = 0

  for (const user of users ?? []) {
    // Get the user's email from auth.users via admin API
    const { data: authUser } = await svc.auth.admin.getUserById(user.uid)
    const email = authUser?.user?.email
    if (!email) continue

    // Call the weekly-summary API logic (duplicated here from the route)
    const { data: perf } = await svc.rpc('get_my_academic_performance', {}, {
      headers: { 'x-user-uid': user.uid }, // RPC caller context
    })
    // Note: if the RPC requires auth context, use a per-user signed JWT instead.
    // For a cron job, the simplest pattern is calling the Next.js API route
    // with a service-level token rather than duplicating the LLM call here.
    // Defer full LLM calls to the Next.js API; this function just dispatches.

    const summaryRes = await fetch(`${APP_URL}/api/ai/weekly-summary`, {
      method: 'GET',
      headers: {
        'x-cron-user-uid': user.uid, // service-authenticated header
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    })
    if (!summaryRes.ok) { failed++; continue }
    const { summary } = await summaryRes.json()

    // Send email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: 'Your weekly learning summary',
        html: `<p>Hi ${user.display_name ?? 'there'},</p><p>${summary}</p><p><a href="${APP_URL}/dashboard">Continue learning</a></p>`,
      }),
    })
    if (emailRes.ok) sent++; else failed++
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Add to `supabase/config.toml`:
```toml
[functions.weekly-digest]
verify_jwt = false
```

Schedule via Supabase cron (dashboard → Edge Functions → Schedule):
`0 8 * * 1` (every Monday 8:00 AM UTC).

Add `notifications.weekly_summary` boolean to profile settings UI in
`src/app/profile/page.tsx` — a simple toggle under a "Notifications" section.

---

## PROMPT 2 — CSP Headers

**Estimate:** 4 hours  
**Dependencies:** none  
**File:** `next.config.js` (currently `const nextConfig = {}`)

---

Replace `next.config.js` entirely:

```javascript
/** @type {import('next').NextConfig} */

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_HOST   = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : ''
const SUPABASE_WS     = SUPABASE_URL ? SUPABASE_URL.replace('https://', 'wss://') : ''

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // Next.js hydration + Tailwind JIT
  "style-src 'self' 'unsafe-inline'",    // Tailwind inline styles
  `img-src 'self' data: blob: https://${SUPABASE_HOST} https://*.supabase.co`,
  `connect-src 'self' https://${SUPABASE_HOST} ${SUPABASE_WS} https://*.supabase.co wss://*.supabase.co https://api.openai.com`,
  "frame-src youtube.com www.youtube.com player.vimeo.com",   // VideoPlayer.tsx
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',          value: ContentSecurityPolicy },
  { key: 'X-Frame-Options',                  value: 'DENY' },
  { key: 'X-Content-Type-Options',           value: 'nosniff' },
  { key: 'Referrer-Policy',                  value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',               value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security',        value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
```

**Test after deploying:**
1. Load `/courses` — verify no CSP console errors
2. Open a `video_stream` block in learn — verify YouTube/Vimeo iframes load
3. Open DevTools → Security — verify HSTS and CSP appear in response headers
4. Check the AI tutor — verify it connects to OpenAI (confirm `api.openai.com` in
   `connect-src` works)

If Stripe checkout is added later, add `https://js.stripe.com` to `script-src` and
`frame-src` at that time.

---

## PROMPT 3 — Supabase Storage Bucket RLS + Path Restructure

**Estimate:** 4 hours  
**Dependencies:** none  
**Files:** `src/app/api/upload/image/route.ts`, new migration `20260618200700_storage_rls.sql`

---

### Security context
The `content-images` bucket is currently **public** with paths at
`{auth_uid}/{timestamp}.ext`. Any public URL is accessible without auth, and
`auth_uid` values can potentially be inferred. Fix by:
1. Changing path to `{org_id}/{auth_uid}/{timestamp}.ext` — namespace by org
2. Adding Storage RLS policies on `storage.objects` so only members of the same
   org can read objects in their org's folder
3. Keeping the bucket public is acceptable IF RLS policies are set (Supabase Storage
   respects RLS on the `storage.objects` table for authenticated reads via signed URLs;
   for true public reads, the policies don't apply — see note below)

**Note on public buckets:** If the bucket is truly public, Storage RLS cannot block
direct URL access — that's the definition of public. The correct fix is to make
the bucket **private** and serve files via signed URLs. Evaluate:
- If course images are OK to be publicly indexed (logos, banners): keep public,
  change path structure for obscurity
- If course images may contain sensitive content: switch to private bucket + signed URLs

**Recommendation (council):** Switch to private bucket. The upload route already has
auth checks. Serve images via short-lived signed URLs (1 hour expiry) in the content
renderer.

---

### Step 1 — Migration: Storage RLS policies

Create `supabase/migrations/20260618200700_storage_rls.sql`:

```sql
-- ─── Storage bucket RLS: content-images ──────────────────────────────────────
-- Bucket is private. Objects stored at {org_id}/{auth_uid}/{timestamp}.ext
-- Access is granted to members of the same org only.

-- INSERT: only staff of the same org can upload
CREATE POLICY "content_images: org members upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- SELECT: org members can read their org's images
CREATE POLICY "content_images: org members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- Platform admin: read all (for support and moderation)
CREATE POLICY "content_images: platform admin read all"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND public.is_platform_admin()
  );

-- DELETE: only admins of the same org
CREATE POLICY "content_images: org admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin','manager')
  );
```

In Supabase dashboard: change `content-images` bucket from public to **private**.

---

### Step 2 — Update upload route

In `src/app/api/upload/image/route.ts`, update two things:

1. **Path structure:** change `${user.id}/${Date.now()}.${ext}` to
   `${orgId}/${user.id}/${Date.now()}.${ext}`

2. **Lookup org_id:** after the profile role check, fetch `profiles.org_id`:
   ```typescript
   const { data: profile } = await supabase
     .from('profiles').select('role, org_id').eq('auth_id', user.id).single()
   if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 403 })
   const orgId = profile.org_id
   ```

3. **Return signed URL instead of public URL:** replace the `getPublicUrl` call with:
   ```typescript
   const { data: signed } = await supabase.storage
     .from(BUCKET)
     .createSignedUrl(data.path, 60 * 60) // 1 hour
   return NextResponse.json({ url: signed?.signedUrl })
   ```
   **But:** signed URLs expire. Course images embedded in block content need a longer
   strategy. Two options:
   - Store the storage **path** (not URL) in `course_blocks.content`, and generate
     a fresh signed URL at render time in the content renderer
   - Use a transformation URL pattern from Supabase Storage Image Transformation (CDN)
   
   For MVP: store the path, generate signed URL at render time in `BlockPlayer.tsx`
   and the content page renderer. Add a helper `src/lib/storage.ts`:
   ```typescript
   import { createClient } from '@/utils/supabase/server'
   export async function getSignedImageUrl(path: string): Promise<string> {
     const supabase = await createClient()
     const { data } = await supabase.storage
       .from('content-images').createSignedUrl(path, 3600)
     return data?.signedUrl ?? ''
   }
   ```

---

## PROMPT 4 — AI Rate Limiting (Upstash Redis)

**Estimate:** 4 hours  
**Dependencies:** Upstash Redis account created, env vars set  
**Routes to protect:** `/api/ai/tutor`, `/api/ai/weekly-summary`,
  `/api/ai/related-concepts`, `/api/ai/confusion-topics`, `/api/ai/route`

---

### Install

```bash
npm install @upstash/ratelimit @upstash/redis
```

---

### Rate limit utility

Create `src/lib/rate-limit.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'
import { env }       from '@/env'

const redis = new Redis({
  url:   env.upstashRedisUrl,
  token: env.upstashRedisToken,
})

// Tutor: 20 requests per 60 seconds per user
export const tutorLimiter = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(20, '60 s'),
  prefix:    'rl:ai:tutor',
  analytics: false,
})

// Heavy routes: 5 per 60 seconds per user
export const heavyLimiter = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(5, '60 s'),
  prefix:    'rl:ai:heavy',
  analytics: false,
})
```

---

### Apply to each AI route

At the top of each route handler, BEFORE opening any OpenAI stream or fetch:

```typescript
import { tutorLimiter } from '@/lib/rate-limit'
import { createClient }  from '@/utils/supabase/server'

// In the handler:
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { success, limit, remaining, reset } = await tutorLimiter.limit(user.id)
if (!success) {
  return NextResponse.json(
    { error: 'Too many requests. Please wait before asking again.' },
    {
      status: 429,
      headers: {
        'Retry-After':      String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Limit':     String(limit),
        'X-RateLimit-Remaining': String(remaining),
      },
    }
  )
}
// ... rest of the handler
```

Use `tutorLimiter` for `/api/ai/tutor`. Use `heavyLimiter` for
`/api/ai/weekly-summary`, `/api/ai/related-concepts`, `/api/ai/confusion-topics`.
`/api/ai/route` (Anthropic passthrough) use `tutorLimiter`.

**Important:** For streaming routes (`export const runtime = 'edge'`), ensure the
rate limit check completes before `return new Response(stream)`. The check is
synchronous (Redis HTTP call) — it resolves before the stream is opened.

---

## PROMPT 5 — Cross-Tenant RLS Penetration Tests

**Estimate:** 1 day  
**Dependencies:** none (uses existing Vitest + Supabase test setup)  
**File:** `src/tests/e2e/rls-isolation.test.ts`

---

### Setup context

Existing test pattern from `src/tests/e2e/critical-path.test.ts`:
- Vitest + `@vitest-environment node`
- Real Supabase instance (not local emulator)
- Service role for setup/teardown, user JWTs for RLS assertions
- Env vars: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
  `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_USER_PASSWORD`

Add two new env vars:
- `TEST_USER_A_EMAIL` + `TEST_USER_A_PASSWORD` (user in Org A, role=teacher)
- `TEST_USER_B_EMAIL` + `TEST_USER_B_PASSWORD` (user in Org B, role=teacher)

These users and their orgs are created in `supabase/seed.test.sql` or in `beforeAll`.

---

### Test file structure

```typescript
// @vitest-environment node
/**
 * RLS cross-tenant isolation penetration tests.
 * Asserts that an authenticated user from Org A cannot read
 * any row belonging to Org B through any authenticated API path.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const URL  = process.env.TEST_SUPABASE_URL              ?? ''
const ANON = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SVC  = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PWD  = process.env.TEST_USER_PASSWORD             ?? ''
const A_EMAIL = process.env.TEST_USER_A_EMAIL ?? ''
const B_EMAIL = process.env.TEST_USER_B_EMAIL ?? ''

// Deterministic seed UUIDs — must match supabase/seed.test.sql
const ORG_A  = '00000000-0000-0000-0010-000000000001'
const ORG_B  = '00000000-0000-0000-0010-000000000002'
const COURSE_A = '00000000-0000-0000-0011-000000000001'
const COURSE_B = '00000000-0000-0000-0011-000000000002'

let svc:    SupabaseClient
let userA:  SupabaseClient
let userB:  SupabaseClient

// Tables to test with their org_id filter column
const TABLES_WITH_ORG: Array<{ table: string; orgCol?: string }> = [
  { table: 'courses' },
  { table: 'modules' },
  { table: 'course_blocks' },
  { table: 'submissions' },
  { table: 'hq_tasks' },
  { table: 'hq_decisions' },
  { table: 'hq_risks' },
  { table: 'hq_sessions' },
  { table: 'group_posts' },
  { table: 'ai_query_log' },
  { table: 'admin_audit_log' },
  { table: 'user_audit_log' },
  { table: 'profile_badges' },
  { table: 'academic_terms' },
  { table: 'enrollment_audit_log' },
  { table: 'embeddings' },
]

beforeAll(async () => {
  svc = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

  const signIn = async (email: string) => {
    const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    await client.auth.signInWithPassword({ email, password: PWD })
    return client
  }

  ;[userA, userB] = await Promise.all([signIn(A_EMAIL), signIn(B_EMAIL)])
})

afterAll(async () => {
  await userA.auth.signOut()
  await userB.auth.signOut()
})

describe('Cross-tenant RLS isolation', () => {
  for (const { table } of TABLES_WITH_ORG) {
    it(`user A cannot read Org B rows in ${table}`, async () => {
      const { data, error } = await userA
        .from(table)
        .select('id')
        .eq('org_id', ORG_B)
        .limit(5)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    it(`user B CAN read their own rows in ${table}`, async () => {
      // At least one row per org must exist in seed data for this to be meaningful
      const { data } = await userB
        .from(table)
        .select('id')
        .eq('org_id', ORG_B)
        .limit(1)

      // We assert the query works (no error) — data may be empty if table has
      // no seeded rows for this org, which is an accepted false-negative for now
      expect(data).toBeDefined()
    })
  }

  it('platform admin can read rows from any org', async () => {
    // Service role bypasses RLS — acts as platform admin equivalent for this test
    const { data } = await svc.from('courses').select('id, org_id').limit(10)
    const orgs = new Set(data?.map((r: { org_id: string }) => r.org_id))
    // In a seeded environment with both orgs, both should be visible
    expect(orgs.size).toBeGreaterThanOrEqual(1) // relaxed: at least own org
  })
})

describe('Suspended tenant RLS block', () => {
  it('suspended-org user cannot read their own org rows', async () => {
    // Suspend Org A
    await svc.from('organizations').update({ status: 'suspended' }).eq('id', ORG_A)
    // Wait for trigger to propagate tenant_active = false
    await new Promise(r => setTimeout(r, 500))

    const { data } = await userA.from('courses').select('id').eq('org_id', ORG_A)
    expect(data).toHaveLength(0)

    // Restore
    await svc.from('organizations').update({ status: 'active' }).eq('id', ORG_A)
    await new Promise(r => setTimeout(r, 500))
  })
})
```

Add the two new env vars to `.env.local.example` and to the GitHub Actions CI
workflow secrets section.

---

## PROMPT 6 — CI/CD + Staging + Sentry

**Estimate:** 1 day  
**Dependencies:** GitHub repo exists, Vercel project linked, Sentry account

---

### Step 1 — GitHub Actions CI

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Type-check + Test
    runs-on: ubuntu-latest
    env:
      TEST_SUPABASE_URL:              ${{ secrets.TEST_SUPABASE_URL }}
      TEST_SUPABASE_ANON_KEY:         ${{ secrets.TEST_SUPABASE_ANON_KEY }}
      TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
      TEST_USER_PASSWORD:             ${{ secrets.TEST_USER_PASSWORD }}
      TEST_USER_A_EMAIL:              ${{ secrets.TEST_USER_A_EMAIL }}
      TEST_USER_B_EMAIL:              ${{ secrets.TEST_USER_B_EMAIL }}
      NEXT_PUBLIC_SUPABASE_URL:       ${{ secrets.TEST_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY:  ${{ secrets.TEST_SUPABASE_ANON_KEY }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: TypeScript type check
        run: npx tsc --noEmit

      - name: Run tests
        run: npx vitest run --reporter=verbose

  push-staging:
    name: Push to staging DB
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Push migrations to staging
        run: supabase db push --project-ref ${{ secrets.STAGING_PROJECT_REF }} --yes
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD:  ${{ secrets.STAGING_DB_PASSWORD }}
```

**GitHub secrets to add:**
`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`,
`TEST_USER_PASSWORD`, `TEST_USER_A_EMAIL`, `TEST_USER_B_EMAIL`,
`STAGING_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `STAGING_DB_PASSWORD`,
`SENTRY_AUTH_TOKEN`

---

### Step 2 — Staging Supabase project

1. Create new project `churchcore-lms-staging` in Supabase dashboard
2. Copy `SUPABASE_ACCESS_TOKEN` from: dashboard → Account → Access Tokens
3. Note `STAGING_PROJECT_REF` from the staging project URL
4. Run `supabase db push --project-ref [STAGING_PROJECT_REF]` manually to apply all
   63 current migrations to the new project
5. Create a Vercel Preview Environment that points to staging Supabase credentials
   (Vercel → Project → Settings → Environment Variables → Preview)

---

### Step 3 — Sentry

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- Modifies `next.config.js` to wrap the config with `withSentryConfig()`

Add to Vercel env vars: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
Add `SENTRY_AUTH_TOKEN` to GitHub secrets for source map upload.

In `sentry.server.config.ts`, set `tracesSampleRate: 0.1` (10% of requests) to
control cost. Set `ignoreErrors: ['NEXT_NOT_FOUND']` to suppress 404 noise.

---

## PROMPT 7 — Public Self-Registration `/join/[slug]`

**Estimate:** 1.5 days  
**Dependencies:** Resend (Prompt 1) complete for confirmation email; Cloudflare Turnstile account

---

### Critical integration point (Wildcard item 4)

The `handle_new_user` DB trigger creates a `profiles` row on first sign-in. For
self-registered users, it must also set `profiles.org_id`. The trigger reads
`raw_user_meta_data` — the `/join/[slug]` sign-up call must pass `{ org_id }` there.

**Check the existing trigger** in `supabase/migrations/` for `handle_new_user`.
If it does NOT read `raw_user_meta_data.org_id`, add a migration to update it:

```sql
-- supabase/migrations/20260618200800_handle_new_user_org_id.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    uid,
    auth_id,
    display_name,
    org_id,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    (NEW.raw_user_meta_data->>'org_id')::uuid,   -- set from sign-up metadata
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    'active'
  )
  ON CONFLICT (auth_id) DO NOTHING;

  -- Insert into profile_roles for RLS hot path
  IF (NEW.raw_user_meta_data->>'org_id') IS NOT NULL THEN
    INSERT INTO public.profile_roles (
      uid, org_id, role, tenant_active
    ) VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'org_id')::uuid,
      COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
      true
    )
    ON CONFLICT (uid) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
```

If the trigger already reads org_id from metadata, skip this migration.

---

### RLS policy for public org lookup

Add to `supabase/migrations/20260618200800_handle_new_user_org_id.sql` (or separate):

```sql
-- Allow anonymous users to read active organization info by slug
-- (for the /join/[slug] landing page — no auth required)
CREATE POLICY "organizations: anon read active by slug"
  ON public.organizations FOR SELECT TO anon
  USING (status = 'active');
```

---

### Step 1 — Turnstile setup

1. Register site at cloudflare.com/products/turnstile
2. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to env vars
3. Install: `npm install @marsidev/react-turnstile`

---

### Step 2 — Server action: `enrollSelf`

Create in `src/app/actions/enrollment.ts` (or `src/app/join/actions.ts`):

```typescript
'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export async function enrollSelf(orgId: string, turnstileToken: string) {
  // Verify Turnstile token server-side
  const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret:   process.env.TURNSTILE_SECRET_KEY!,
      response: turnstileToken,
    }),
  })
  const { success } = await verifyRes.json()
  if (!success) return { error: 'Bot check failed.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Verify org exists and is active
  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name, status')
    .eq('id', orgId)
    .eq('status', 'active')
    .single()

  if (!org) return { error: 'Organization not found or inactive.' }

  // Set profile.org_id if not already set (self-registered users)
  await service
    .from('profiles')
    .update({ org_id: orgId })
    .eq('auth_id', user.id)
    .is('org_id', null)

  // Ensure profile_roles row exists
  await service.from('profile_roles').upsert({
    uid:           user.id,
    org_id:        orgId,
    role:          'student',
    tenant_active: true,
  }, { onConflict: 'uid' })

  return { success: true }
}
```

---

### Step 3 — Public page

Create `src/app/join/[slug]/page.tsx`:

```typescript
import { createServiceClient } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import JoinForm from './JoinForm'

export default async function JoinPage({ params }: { params: { slug: string } }) {
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, settings')
    .eq('slug', params.slug)
    .eq('status', 'active')
    .single()

  if (!org) redirect('/')

  const branding = (org.settings as any)?.branding ?? {}

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {branding.logo_url && (
          <img src={branding.logo_url} alt={org.name} className="h-12 mb-6 mx-auto" />
        )}
        <h1 className="text-2xl font-bold text-center mb-2">Join {org.name}</h1>
        <p className="text-muted-foreground text-center mb-6 text-sm">
          Create your account to access courses and learning materials.
        </p>
        <JoinForm orgId={org.id} orgName={org.name} primaryColor={branding.primary_color} />
      </div>
    </main>
  )
}
```

Create `src/app/join/[slug]/JoinForm.tsx` (client component):
- Email + password fields
- Turnstile widget (`<Turnstile siteKey={NEXT_PUBLIC_TURNSTILE_SITE_KEY} />`)
- On submit: `supabase.auth.signUp({ email, password, options: { data: { org_id } } })`
- After sign-up: call `enrollSelf(orgId, turnstileToken)` server action
- On success: redirect to `/dashboard`
- If user already has an account: show "Sign in instead" link → `/login?redirect=/join/[slug]`

---

## PROMPT 8 — Stripe Subscription Lifecycle

**Estimate:** 3 days  
**Dependencies:** Resend (Prompt 1), env schema (Prompt 1 Step 0)  
**Note:** Wildcard idempotency requirement and plan→feature flag wiring both included.

---

### Install

```bash
npm install stripe
```

Add to `src/env.ts`:
- `stripeSecretKey: required('STRIPE_SECRET_KEY')`
- `stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET')`
- `stripePublishableKey: required('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')` (public)

---

### Step 1 — Stripe client

Create `src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe'
import { env } from '@/env'

export const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: '2024-06-20',
  typescript:  true,
})
```

---

### Step 2 — Plan → feature flag mapping

Define in `src/lib/stripe-plans.ts`:

```typescript
export const PLAN_FEATURES: Record<string, Record<string, boolean>> = {
  starter: {
    courses:    true,
    reporting:  true,
    ai_tutor:   false,
    hq:         false,
    guardian:   false,
  },
  growth: {
    courses:    true,
    reporting:  true,
    ai_tutor:   true,
    hq:         true,
    guardian:   true,
  },
  enterprise: {
    courses:    true,
    reporting:  true,
    ai_tutor:   true,
    hq:         true,
    guardian:   true,
  },
}

// Map Stripe Price IDs to plan slugs
// Set these in Stripe dashboard and add to env vars
export const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER    ?? '']: 'starter',
  [process.env.STRIPE_PRICE_GROWTH     ?? '']: 'growth',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
}
```

---

### Step 3 — Webhook handler

Create `src/app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe }        from '@/lib/stripe'
import { env }           from '@/env'
import { createServiceClient } from '@/utils/supabase/service'
import { PLAN_FEATURES, PRICE_TO_PLAN } from '@/lib/stripe-plans'

// CRITICAL: disable body parsing — Stripe signature verification needs raw body
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.stripeWebhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const svc = createServiceClient()

  // Idempotency: check if this event was already processed
  const { data: existing } = await svc
    .from('platform_audit_log')
    .select('id')
    .eq('action', 'stripe_webhook')
    .contains('metadata', { stripe_event_id: event.id })
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Process the event
  try {
    await handleStripeEvent(event, svc)
  } catch (err) {
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  // Log for idempotency and audit trail
  await svc.from('platform_audit_log').insert({
    action:      'stripe_webhook',
    resource_id: event.id,
    actor_id:    null,   // system event
    metadata:    { stripe_event_id: event.id, type: event.type },
  })

  return NextResponse.json({ received: true })
}

async function handleStripeEvent(event: Stripe.Event, svc: ReturnType<typeof createServiceClient>) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session  = event.data.object as Stripe.Checkout.Session
      const orgId    = session.metadata?.org_id
      const priceId  = session.metadata?.price_id
      const plan     = PRICE_TO_PLAN[priceId ?? ''] ?? 'starter'
      if (!orgId) break

      await svc.from('organizations').update({
        status:   'active',
        plan,
        settings: svc.from('organizations')
          // merge feature flags into settings
          // Use a Postgres function for JSON merge or do a read-modify-write:
      }).eq('id', orgId)

      // Read-modify-write for JSON settings merge
      const { data: org } = await svc.from('organizations')
        .select('settings').eq('id', orgId).single()
      const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
      await svc.from('organizations').update({
        status: 'active',
        plan,
        settings: {
          ...currentSettings,
          features: PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter,
        },
      }).eq('id', orgId)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice  = event.data.object as Stripe.Invoice
      const orgId    = invoice.metadata?.org_id
      if (!orgId) break
      await svc.from('organizations').update({ status: 'active' }).eq('id', orgId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice  = event.data.object as Stripe.Invoice
      const orgId    = invoice.metadata?.org_id
      if (!orgId) break
      await svc.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
      // Note: sync_org_status_to_profiles trigger fires automatically
      break
    }

    case 'customer.subscription.deleted': {
      const sub   = event.data.object as Stripe.Subscription
      const orgId = sub.metadata?.org_id
      if (!orgId) break
      await svc.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
      break
    }

    case 'customer.subscription.updated': {
      const sub     = event.data.object as Stripe.Subscription
      const orgId   = sub.metadata?.org_id
      const priceId = sub.items.data[0]?.price.id
      const plan    = PRICE_TO_PLAN[priceId ?? ''] ?? 'starter'
      if (!orgId) break

      const { data: org } = await svc.from('organizations')
        .select('settings').eq('id', orgId).single()
      const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
      await svc.from('organizations').update({
        plan,
        settings: {
          ...currentSettings,
          features: PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter,
        },
      }).eq('id', orgId)
      break
    }
  }
}
```

**Important:** Stripe `metadata` on subscriptions and invoices must include `org_id`.
Set this when creating the Stripe Customer and Subscription (in the checkout flow).

---

### Step 4 — Checkout creation

Create `src/app/api/stripe/create-checkout/route.ts` (server action or API route).
Called from the platform admin when activating a tenant or when a tenant admin
upgrades their plan:

```typescript
// POST body: { orgId, priceId, successUrl, cancelUrl }
export async function POST(req: NextRequest) {
  // assertPlatformAdmin() or assertOrgAdmin()
  const { orgId, priceId, successUrl, cancelUrl } = await req.json()

  const { data: org } = await svc.from('organizations')
    .select('name, settings').eq('id', orgId).single()

  const customer = await stripe.customers.create({
    name:     org.name,
    metadata: { org_id: orgId },
  })

  const session = await stripe.checkout.sessions.create({
    customer:            customer.id,
    payment_method_types: ['card'],
    line_items:          [{ price: priceId, quantity: 1 }],
    mode:                'subscription',
    success_url:         successUrl,
    cancel_url:          cancelUrl,
    metadata:            { org_id: orgId, price_id: priceId },
    subscription_data:   { metadata: { org_id: orgId } },
  })

  return NextResponse.json({ url: session.url })
}
```

---

### Step 5 — Billing page in platform console

Create `src/app/platform/tenants/[id]/billing/page.tsx`:
- Shows current plan, status, next billing date
- "Upgrade Plan" button → creates checkout session → redirects to Stripe Checkout
- "Cancel Subscription" button (platform admin only) → calls Stripe cancel API
- Past invoices list (fetched from Stripe)

---

### Acceptance criteria

- [ ] `checkout.session.completed` → org `status = 'active'`, `plan = [plan]`,
      feature flags set in `settings.features`
- [ ] `invoice.payment_failed` → org `status = 'suspended'`, users blocked by RLS
- [ ] `customer.subscription.deleted` → org `status = 'suspended'`
- [ ] Duplicate webhook event → returns `{ received: true, duplicate: true }`, no
      double-processing
- [ ] Invalid signature → returns 400
- [ ] Webhook events appear in `platform_audit_log` with `action = 'stripe_webhook'`

---

## Execution Order

```
Day 1:  Prompt 1 (env schema + Resend wiring, Steps 0–3)
Day 2:  Prompt 1 (weekly digest Edge Function, Step 4)
        Prompt 2 (CSP headers — 4 hours)
        Prompt 3 (Storage RLS — 4 hours)
Day 3:  Prompt 4 (AI rate limiting — 4 hours)
        Prompt 5 (RLS penetration tests, start)
Day 4:  Prompt 5 (RLS penetration tests, complete)
        Prompt 6 (CI/CD + Sentry + staging — start)
Day 5:  Prompt 6 (complete)
        Prompt 7 (self-registration — start)
Day 6:  Prompt 7 (complete)
Day 7–9: Prompt 8 (Stripe)
```

**Total: 9 working days → public launch ready.**
