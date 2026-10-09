# ChurchCore Platform Super-Admin & Multi-Tenant Governance Pattern
**Specification & Implementation Blueprint for ChurchCore Suite Products**  
*Document Version:* 1.0.0  
*Target Stack:* PostgreSQL (Supabase / Neon), Next.js App Router (TypeScript), Row Level Security (RLS)

---

## 1. Architectural Philosophy & Security Invariants

In multi-tenant SaaS applications for ministry, churches, and academic institutions, tenant isolation is enforced at the database layer through **Row Level Security (RLS)** keyed on `org_id`. 

### The Fundamental Flaw of `profiles.role = 'superadmin'`
Many architectures attempt to implement super-admin access by adding a role value (e.g. `'superadmin'`, `'platform_admin'`) into the standard tenant `profiles` table. This creates serious vulnerabilities:
1. **Privilege Escalation:** If an org admin can modify profile records in their tenant or import CSV users, a bug or race condition could allow promoting a local user to global super-admin.
2. **Enum Pollution:** Tenant-level role checks (e.g., `role IN ('admin', 'manager', 'teacher', 'student')`) fail or require dirty casts when platform-level roles are mixed into domain enums.
3. **Multi-Tenant Leakage:** Super-admins do not belong to a single `org_id`; forcing them into one distorts organizational analytics, billing seat counts, and reporting.

### The ChurchCore Solution: The Split Identity Plane
1. **Tenant Identity Plane:** Users belong to an organization (`organizations`) via `profiles (uid, auth_id, org_id, role)`. Their permissions are scoped strictly to their `org_id`.
2. **Platform Identity Plane:** Super-admins exist solely in a separate table: `public.platform_admins (id, auth_id, display_name)`.
3. **Database Security Gate:** Access is evaluated via a dedicated PostgreSQL `SECURITY DEFINER` function `public.is_platform_admin()` which queries `public.platform_admins` directly.

```mermaid
graph TD
    subgraph Client ["Client Browser"]
        A[Auth Session Cookie / JWT]
    end

    subgraph AuthLayer ["Supabase Auth"]
        B[auth.users ID: UUID]
    end

    subgraph TenantPlane ["Tenant Plane (RLS: org_id = caller.org_id)"]
        C[profiles: role = admin/manager/member]
        D[courses, members, finances, content]
    end

    subgraph PlatformPlane ["Platform Governance Plane"]
        E[public.platform_admins: auth_id = auth.uid()]
        F[public.platform_audit_log]
        G[Cross-Tenant Governance & Features]
    end

    A --> B
    B -->|Regular User| C
    C -->|Scoped Access| D
    B -->|Checked by is_platform_admin()| E
    E -->|Global Governance| G
    G -->|Immutable Log| F
```

---

## 2. Database Schema & Migration DDL (PostgreSQL)

Save as `supabase/migrations/<TIMESTAMP>_platform_admins.sql`.

```sql
-- ============================================================================
-- 1. Table: public.platform_admins
-- Separate identity plane for platform super-administrators
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id      UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Function: public.is_platform_admin()
-- The single gate for platform-level access.
-- SECURITY DEFINER allows the function to read platform_admins bypassing RLS.
-- SET search_path explicitly includes auth and public while preventing temp hijacking.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_id = auth.uid()
  );
$$;

-- Secure function execution permissions
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

-- ============================================================================
-- 3. RLS Policies on platform_admins
-- ============================================================================
CREATE POLICY "platform_admins: platform admins read"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admins: platform admins insert"
  ON public.platform_admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_admins: platform admins delete"
  ON public.platform_admins FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- Service role bypass for automated bootstrapping
CREATE POLICY "platform_admins: service role all"
  ON public.platform_admins FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. Table: public.platform_audit_log
-- Tamper-proof, immutable log of all cross-tenant super-admin operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID        REFERENCES auth.users(id) ON DELETE RESTRICT,
  action     TEXT        NOT NULL,
  target_org UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload    JSONB       DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor   ON public.platform_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_org     ON public.platform_audit_log(target_org);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_log(created_at DESC);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_audit_log: platform admins read"
  ON public.platform_audit_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_audit_log: platform admins insert"
  ON public.platform_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_audit_log: service role insert"
  ON public.platform_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);
```

---

## 3. Bootstrapping the First Platform Admin

Because nobody is a platform admin initially, the first super-admin cannot be created through the UI. Bootstrap via SQL CLI:

```sql
-- 1. Identify the auth UUID of the owner
SELECT id, email FROM auth.users WHERE email = 'admin@yourchurchcore.com';

-- 2. Insert into platform_admins
INSERT INTO public.platform_admins (auth_id, display_name)
VALUES ('<AUTH_USER_UUID>', 'Platform Owner')
ON CONFLICT (auth_id) DO NOTHING;
```

---

## 4. Application Layer Implementation (Next.js / TypeScript)

### 4.1 Server Guard Utility (`src/lib/auth/platform-guard.ts`)

```typescript
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

/**
 * Verifies that the current request is from an authenticated platform super-admin.
 * Optionally validates MFA / AAL2 level for high-privilege governance.
 * If unauthorized, silently redirects to /dashboard without revealing route existence.
 */
export async function assertPlatformAdmin(options: { requireMfa?: boolean } = {}) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: isPlatformAdmin, error: rpcError } = await supabase.rpc('is_platform_admin')

  if (rpcError || !isPlatformAdmin) {
    // Silent redirection (Stealth Defense)
    redirect('/dashboard')
  }

  // Optional: Enterprise MFA assurance check (AAL2)
  if (options.requireMfa && supabase.auth.mfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal2' && aal?.nextLevel === 'aal2') {
      redirect('/login/mfa')
    }
  }

  return { user, supabase }
}

/**
 * Server Action helper: Executes an action only if caller is a platform admin,
 * correctly handling Next.js redirects and writing to the immutable audit log.
 */
export async function withPlatformAdminAction<T>(
  actionName: string,
  targetOrgId: string | null,
  handler: (context: { user: any; supabase: any }) => Promise<T>,
  details: Record<string, unknown> = {}
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const { user, supabase } = await assertPlatformAdmin()

    // Execute the super-admin mutation
    const result = await handler({ user, supabase })

    // Use service role admin client to guarantee tamper-proof audit log insertion
    const adminDb = createAdminClient()
    await adminDb.from('platform_audit_log').insert({
      actor_id: user.id,
      action: actionName,
      target_org: targetOrgId,
      payload: details,
    })

    return { success: true, data: result }
  } catch (err: any) {
    // CRITICAL: Next.js redirect() throws internal NEXT_REDIRECT error.
    // Must rethrow so HTTP 307 redirect executes rather than being caught as JSON error.
    if (isRedirectError(err)) {
      throw err
    }

    console.error(`[PlatformAction:${actionName}] Failed:`, err)
    return { success: false, error: err?.message ?? 'Operation failed' }
  }
}
```

---

### 4.2 Platform Layout Gate (`src/app/platform/layout.tsx`)

Place all platform administration routes under `src/app/platform/`.

```tsx
import { assertPlatformAdmin } from '@/lib/auth/platform-guard'
import Link from 'next/link'
import { PlatformNav } from './PlatformNav'

export const metadata = {
  title: 'Platform Admin — ChurchCore',
}

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Enforces server-side authentication & permission check before rendering any HTML
  await assertPlatformAdmin()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <span className="text-sm font-black tracking-widest text-indigo-400 uppercase">
              Platform Admin
            </span>
          </div>

          <PlatformNav />

          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              ← Back to App
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
```

---

### 4.3 Platform Navigation (`src/app/platform/PlatformNav.tsx`)

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/platform', label: 'Tenants & Metrics', exact: true },
  { href: '/platform/audit', label: 'Security Audit' },
  { href: '/platform/feedback', label: 'Triage Desk' },
]

export function PlatformNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1" aria-label="Platform sections">
      {LINKS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

---

## 5. Cross-Tenant Governance Server Actions

Example of tenant lifecycle operations (`src/app/platform/actions.ts`):

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { withPlatformAdminAction } from '@/lib/auth/platform-guard'

/**
 * Toggles suspension of a church organization
 */
export async function toggleTenantSuspension(orgId: string, suspend: boolean) {
  return withPlatformAdminAction(
    suspend ? 'tenant.suspend' : 'tenant.activate',
    orgId,
    async ({ supabase }) => {
      const status = suspend ? 'suspended' : 'active'
      const { error } = await supabase
        .from('organizations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orgId)

      if (error) throw error
      revalidatePath('/platform')
      return { status }
    },
    { orgId, suspend }
  )
}

/**
 * Overrides feature flags for a specific tenant
 */
export async function updateTenantFeatures(
  orgId: string,
  features: Record<string, boolean>
) {
  return withPlatformAdminAction(
    'tenant.features.update',
    orgId,
    async ({ supabase }) => {
      // Read existing settings
      const { data: org, error: readError } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single()

      if (readError) throw readError

      const newSettings = {
        ...(org.settings ?? {}),
        features: {
          ...(org.settings?.features ?? {}),
          ...features,
        },
      }

      const { error: writeError } = await supabase
        .from('organizations')
        .update({ settings: newSettings, updated_at: new Date().toISOString() })
        .eq('id', orgId)

      if (writeError) throw writeError
      revalidatePath('/platform')
      return newSettings
    },
    { orgId, features }
  )
}
```

---

## 6. Verification & Automated Test Checklist

When implementing this pattern in a new ChurchCore product, verify against this matrix:

| Test Case | Method | Expected Result |
|---|---|---|
| **Non-logged-in user visits `/platform`** | HTTP GET `/platform` | 307 Redirect to `/login` |
| **Standard student/member visits `/platform`** | HTTP GET `/platform` | 307 Silent Redirect to `/dashboard` |
| **Org admin (`role = 'admin'`) visits `/platform`** | HTTP GET `/platform` | 307 Silent Redirect to `/dashboard` (unless in `platform_admins`) |
| **Platform Admin visits `/platform`** | HTTP GET `/platform` | 200 OK — Renders tenant management |
| **Direct DB Query to `platform_admins` by regular user** | PostgREST / Supabase Client | Returns `[]` (RLS blocks read) |
| **Execution of `public.is_platform_admin()`** | `supabase.rpc('is_platform_admin')` | Returns `true` for super-admin, `false` otherwise |
| **Action Logging** | Trigger suspension / feature toggle | New row inserted into `platform_audit_log` with correct actor and org |

---

## 7. Adoption Summary for Other ChurchCore Products

To adopt this in **ChurchCore ChMS**, **ChurchCore Giving**, or **ChurchCore Events**:
1. Run the migration script in Step 2.
2. Insert your bootstrap admin auth UUID in Step 3.
3. Drop `platform-guard.ts` into `src/lib/auth/`.
4. Create the `src/app/platform/` directory structure with `layout.tsx`.
5. Add any product-specific cross-tenant tools (e.g. global giving fees, SMS gateway quotas, tenant sync diagnostics).
