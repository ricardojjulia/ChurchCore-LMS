# COUNCIL-APPROVED: Public Certificate Verification

> **Status: IN PROGRESS** — Council approved 2026-09-20 (revised after discovery that core certificate system is already shipped). Pivot to genuine gap: public verification page. Step 1 implemented.

**Council:** COUNCIL-2026-001 (4/4 unanimous)
**Date:** 2026-09-20
**Original proposal:** Course Completion Certificates
**Finding:** Core certificate feature is already fully shipped — `course_certificates` table,
`issue_certificate` RPC, `/api/certificates/[id]/pdf` route with `@react-pdf/renderer`,
`/certificates` learner page, email notification via Resend. All production-ready.

**Pivot:** The genuine gap is **Public Certificate Verification** — a public page at
`/verify/[certNo]` where anyone (employer, pastor, congregation) can verify a certificate's
authenticity without logging in.

## Council Vote Breakdown

| Voice       | Vote    | Rationale (certificates; applies to verification extension)         |
|-------------|---------|----------------------------------------------------------------------|
| Product     | APPROVE | Verification closes the trust loop for ministry credentialing        |
| Engineering | APPROVE | 1-day: single public page + anon Supabase query (no auth required)  |
| Design/UX   | APPROVE | Shareable verification URL = professional credentialing experience   |
| Risk        | APPROVE | Only public data (name, course, date, cert no.) — no PII exposure   |

---

## PROMPT 1 OF 2 — Public verification page ✅ SHIPPED (2026-09-20)

File: `src/app/verify/[certNo]/page.tsx`

Public, unauthenticated page that looks up a certificate by its `certificate_no` using
the Supabase service role (bypasses RLS to read public-facing cert data) and renders a
verification banner: VALID with learner name/course/date, or INVALID if not found.

The page is fully static-renderable and shareable. No login required.

---

## PROMPT 2 OF 2 — Share button on /certificates and complete pages

Add a "Copy verification link" button to:
- `src/app/certificates/page.tsx` — per-cert share button
- `src/app/courses/[id]/complete/page.tsx` — share button on completion

The button copies `${NEXT_PUBLIC_SITE_URL}/verify/${cert.certificate_no}` to the clipboard.
