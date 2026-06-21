# ChurchCore LMS — Demo Environment Setup

Fresh Supabase project + Vercel frontend. Follow steps in order.

**Time to complete:** ~30 minutes  
**Demo password (all seeded accounts):** `ChurchCoreDemo!2026`

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a region close to your Vercel deployment region
3. Note these values from **Settings → API**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service role key** → `SUPABASE_SERVICE_ROLE_KEY`
   - **JWT Secret** (Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`
   - **Project Ref** (Settings → General) → used in CLI commands

---

## Step 2 — Apply Database Migrations

```bash
# Link the CLI to the new project
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations — tables, RLS, functions, triggers, pg_cron
supabase db push
```

This applies 50+ migrations in order. Takes ~60 seconds. Watch for errors — if any migration fails, check `supabase/migrations/` and re-run.

---

## Step 3 — Deploy to Vercel

### 3a. Create the Vercel project

```bash
# Or use the Vercel dashboard → Import Git Repository
vercel --cwd "/path/to/ChurchCore LMS"
```

When prompted, accept the defaults (Next.js auto-detected).

### 3b. Set environment variables

In Vercel dashboard → Settings → Environment Variables, add:

#### Required (app won't start without these)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from Step 1 |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (your Vercel deployment URL) |

#### For AI features

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic console → API Keys |
| `OPENAI_API_KEY` | OpenAI platform → API Keys |

#### For email (enrollment, certificates, guardian notifications)

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys |
| `EMAIL_FROM` | `ChurchCore LMS <noreply@yourdomain.com>` |

#### For rate limiting (strongly recommended for demo)

| Variable | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash console → Database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | same location |

#### For guardian email unsubscribe

| Variable | Value |
|---|---|
| `SUPABASE_JWT_SECRET` | from Step 1 (JWT Settings) |
| `CRON_SECRET` | generate: `openssl rand -base64 32` |

#### Skip for demo (optional)

- Stripe vars — billing UI shows graceful "no active subscription" state
- Sentry vars — error monitoring, not needed for demo
- Cloudflare Turnstile — only needed for `/join/[slug]` self-registration
- E2E test vars — CI only

### 3c. Deploy

```bash
vercel --prod
```

Or trigger via Vercel dashboard → Deployments → Redeploy.

---

## Step 4 — Deploy Edge Functions

```bash
supabase functions deploy search-users --project-ref YOUR_PROJECT_REF
supabase functions deploy system-health-check --project-ref YOUR_PROJECT_REF
supabase functions deploy send-guardian-notifications --project-ref YOUR_PROJECT_REF
```

### Set Edge Function secrets

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="ChurchCore LMS <noreply@yourdomain.com>" \
  NEXT_PUBLIC_APP_URL=https://your-project.vercel.app \
  CRON_SECRET=your-cron-secret \
  --project-ref YOUR_PROJECT_REF
```

> **Note:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` are **auto-injected** by Supabase into all Edge Functions — do NOT set them manually. Setting `SUPABASE_JWT_SECRET` will fail with a "reserved prefix" error.

---

## Step 5 — Register Guardian Notification CRON

This runs `send-guardian-notifications` every 5 minutes:

```bash
PROJECT_REF=YOUR_PROJECT_REF \
CRON_SECRET=your-cron-secret \
zsh scripts/register-guardian-cron.sh
```

Verify with:

```bash
supabase db query --linked \
  "SELECT jobname, schedule FROM cron.job WHERE jobname = 'guardian-notify';"
```

---

## Step 6 — Create First User + Bootstrap Platform Admin

### 6a. Sign up

Open your Vercel deployment URL and sign up with your email. This triggers the `handle_new_user` trigger that creates your `profiles` row.

### 6b. Get your auth UUID

Supabase dashboard → Authentication → Users → find your email → copy the **UUID**.

### 6c. Bootstrap platform admin

```bash
supabase db query --linked \
  "INSERT INTO public.platform_admins (auth_id, display_name)
   VALUES ('YOUR_AUTH_UUID', 'Platform Owner')
   ON CONFLICT (auth_id) DO NOTHING;"
```

Platform admin gives access to `/platform/` routes (tenant management). For org-level admin access, the demo reset script (Step 7) handles that automatically.

---

## Step 7 — Load Demo Data

```bash
node scripts/reset-demo-data.mjs --confirm --retain-email=you@example.com
```

This creates:
- 6 program tracks (Bible diploma, associate degree, discipleship, remote study, ministry formation, leadership)
- 20+ course blueprints with full block content
- 6 cohorts with demo students assigned
- 276 graded submissions
- 10 certificates
- Calendar events, announcements, and notifications
- All demo accounts use password `ChurchCoreDemo!2026`

> ⚠️ This is **destructive** — run only against your dedicated demo project, not production.

---

## Step 8 — Smoke Test

Open your deployment and verify:

| Check | Expected |
|---|---|
| `/` redirects to `/auth/login` | ✅ |
| Login with retained email | ✅ Dashboard loads |
| `/dashboard` shows role-aware widgets | ✅ |
| `/courses` shows demo course catalog | ✅ |
| `/admin/health` shows all green | ✅ (may show ⚠️ for embedding jobs if `OPENAI_API_KEY` not set) |
| `/leaderboard` shows demo students with XP | ✅ |
| `/admin/billing` shows plan card | ✅ |
| Course → Learn → discussion block shows posts | ✅ Teacher sees "Grade" button |
| Open course offline (DevTools → Network → Offline) | ✅ Amber banner appears |

---

## What Each Feature Requires

| Feature | Required env vars |
|---|---|
| Core LMS (auth, courses, learning) | Supabase vars only |
| Email (enrollment, certificates) | `RESEND_API_KEY` + `EMAIL_FROM` |
| AI Tutor + weekly digest | `ANTHROPIC_API_KEY` |
| Semantic search | `OPENAI_API_KEY` |
| Guardian email alerts | `RESEND_API_KEY` + `CRON_SECRET` + Edge Function deployed |
| Guardian unsubscribe | `SUPABASE_JWT_SECRET` in Vercel |
| Rate limiting | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| Billing page (free plan) | None — shows "Upgrade Plan" CTA |
| Billing page (paid plan / portal) | `STRIPE_SECRET_KEY` + Stripe Customer Portal configured |
| PWA / offline | No extra vars — built into the app |
| Self-registration `/join/[slug]` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` |

---

## Troubleshooting

**Health panel shows ❌ for embedding jobs**  
→ `OPENAI_API_KEY` not set. Semantic search is disabled but everything else works.

**Guardian emails not sending**  
→ Check `supabase functions logs send-guardian-notifications --project-ref YOUR_PROJECT_REF`

**`supabase secrets set` fails with "reserved" error**  
→ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` are auto-injected — remove them from your `secrets set` command.

**`/admin/health` shows ⚠️ for bridge sync**  
→ Normal on a fresh project with no enrollments. Run demo reset to populate data.

**Vercel build fails**  
→ Run `npm run typecheck` locally first. Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Vercel env vars — builds fail without them.

**`NEXT_PUBLIC_APP_URL` shows localhost in production emails**  
→ Update this var in Vercel to your actual deployment URL and redeploy.
