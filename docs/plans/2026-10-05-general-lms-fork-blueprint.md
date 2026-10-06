# Architectural Blueprint: Multi-Vertical & Multi-Brand Engine ("KickAss LMS" / "ChurchCore LMS")

**Document Ref:** PLAN-2026-001 / COUNCIL-2026-045  
**Target Architecture:** Multi-Tenant Dual-Brand & Industry-Adaptive LMS Engine  
**Status:** Council Approved Blueprint (Ready for Staged Execution)  
**Date:** 2026-10-06  

---

## 1. Executive Summary & Core Architectural Strategy

ChurchCore LMS currently houses an enterprise-grade academic engine (OneRoster 1.2 SIS, SCORM 1.2/2004, H5P interactive packages, Open Badges 2.0/3.0, Rubric grading matrix, Gradebook grid, Stripe Connect with 0% platform fee, Mux HLS video streaming with 85% must-view tracking, private podcast feeds, and AI course synthesis).

Rather than fracturing the codebase into two divergent repositories (which doubles maintenance overhead, database hosting costs, and security patch drift), the Council mandates a **Single Codebase with an Adaptive Multi-Brand & Multi-Vertical Chameleon Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                      UNIFIED MULTI-BRAND & MULTI-VERTICAL ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│      ┌──────────────────────────────┐              ┌──────────────────────────────┐         │
│      │     app.churchcore.org       │              │       app.kickasslms.com     │         │
│      │  (Faith / Church / Ministry) │              │ (Corporate / Academy / K-12) │         │
│      └──────────────┬───────────────┘              └──────────────┬───────────────┘         │
│                     │                                             │                         │
│                     └──────────────────────┬──────────────────────┘                         │
│                                            ▼                                                │
│                         ┌─────────────────────────────────────┐                             │
│                         │   Next.js Host-Header Brand Engine  │                             │
│                         │   (`getPlatformBranding(host)`)     │                             │
│                         └──────────────────┬──────────────────┘                             │
│                                            │                                                │
│         ┌──────────────────────────────────┼──────────────────────────────────┐             │
│         ▼                                  ▼                                  ▼             │
│  ┌──────────────┐                  ┌──────────────┐                   ┌──────────────┐      │
│  │ Terminology  │                  │  AI Personas │                   │ Integrations │      │
│  │ (Adaptive)   │                  │ (OpenRouter) │                   │  (OneRoster/ │      │
│  │              │                  │              │                   │ SCORM/ChMS)  │      │
│  └──────────────┘                  └──────────────┘                   └──────────────┘      │
│                                            │                                                │
│                                            ▼                                                │
│                         ┌─────────────────────────────────────┐                             │
│                         │  Unified Core Engine & PostgreSQL   │                             │
│                         │  (95 Test Suites · 745 Tests 100%)  │                             │
│                         └─────────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Brand Serving: "KickAss LMS" vs. "ChurchCore LMS"

### 2.1 Dynamic Brand Resolution (`src/lib/constants/branding.ts`)
The platform resolves branding dynamically based on either the request host (`req.headers.get('host')`) or an environment variable fallback:

```typescript
export interface PlatformBranding {
  brandId: 'churchcore' | 'kickass'
  name: string
  shortName: string
  tagline: string
  defaultVertical: 'faith_based' | 'corporate' | 'higher_ed'
  supportEmail: string
  logoUrl: string
  faviconUrl: string
  themeClass: string
}

export function getPlatformBranding(host?: string): PlatformBranding {
  const isKickAss = 
    host?.includes('kickasslms') || 
    host?.includes('kickass') || 
    process.env.NEXT_PUBLIC_PLATFORM_BRAND === 'kickass'

  if (isKickAss) {
    return {
      brandId: 'kickass',
      name: 'KickAss LMS',
      shortName: 'KickAss',
      tagline: 'The High-Impact Corporate Academy & Training Engine',
      defaultVertical: 'corporate',
      supportEmail: 'support@kickasslms.com',
      logoUrl: '/brand/kickass/logo.svg',
      faviconUrl: '/brand/kickass/favicon.ico',
      themeClass: 'theme-kickass',
    }
  }

  // Default: ChurchCore LMS
  return {
    brandId: 'churchcore',
    name: 'ChurchCore LMS',
    shortName: 'ChurchCore',
    tagline: 'Theological Education & Discipleship Platform',
    defaultVertical: 'faith_based',
    supportEmail: 'support@churchcore.org',
    logoUrl: '/brand/churchcore/logo.svg',
    faviconUrl: '/brand/churchcore/favicon.ico',
    themeClass: 'theme-churchcore',
  }
}
```

### 2.2 Dynamic Page Metadata & SEO (`src/app/layout.tsx`)
```typescript
export async function generateMetadata(): Promise<Metadata> {
  const brand = getPlatformBranding()
  return {
    title: {
      template: `%s | ${brand.name}`,
      default: brand.name,
    },
    description: brand.tagline,
    icons: {
      icon: brand.faviconUrl,
    },
  }
}
```

### 2.3 DNS & Cloud Provider Setup
* **Vercel / Cloudflare Domains:** Both `churchcore.org` (`*.churchcore.org`) and `kickasslms.com` (`*.kickasslms.com`) are mapped as custom domains in the same production Vercel project.
* **Tenant Subdomain Routing:**
  * `acme.kickasslms.com` $\rightarrow$ Resolves tenant `acme` with KickAss LMS branding.
  * `grace.churchcore.org` $\rightarrow$ Resolves tenant `grace` with ChurchCore LMS branding.

---

## 3. Layer-by-Layer Architectural Separation

### Layer 1: Data Model & Schema Generalization
* **Tenant Vertical Classification:**
  ```sql
  ALTER TABLE organizations 
  ADD COLUMN vertical TEXT NOT NULL DEFAULT 'faith_based' 
  CHECK (vertical IN ('faith_based', 'higher_ed', 'k12', 'corporate', 'creator'));
  ```
* **Tenant Isolation:** Multi-tenancy remains strictly enforced by PostgreSQL Row-Level Security (`organization_id`).

---

### Layer 2: Terminology & Adaptive Dictionary Engine
Dynamic dictionary resolution based on tenant vertical (`src/lib/terminology/`):

| Canonical Key | `faith_based` (Default) | `higher_ed` | `corporate` (KickAss) | `creator` |
| :--- | :--- | :--- | :--- | :--- |
| `entity.organization` | Church / Ministry | University / College | Company / Enterprise | Academy |
| `entity.group` | Small Group / Ministry Team | Section / Study Group | Department / Cohort | Community Circle |
| `entity.leader` | Pastor / Ministry Director | Professor / Instructor | Training Manager / Lead | Coach / Creator |
| `entity.learner` | Member / Disciple | Student / Scholar | Employee / Trainee | Member / Student |
| `entity.pathway` | Discipleship Pathway | Degree / Certificate Track | Onboarding / SOP Track | Mastery Program |
| `entity.event` | Service / Gathering | Lecture / Seminar | Workshop / Training Session | Live Masterclass |

---

### Layer 3: AI Modular Persona Engine
The AI Synthesis Engine (`callOpenRouter`) uses vertical personas (`src/lib/ai/personas.ts`):

```typescript
export interface VerticalAIPersona {
  systemPrompt: string
  pedagogicalFocus: 'theological_formation' | 'academic_rigor' | 'corporate_compliance' | 'skill_mastery'
  discussionTone: 'socratic_pastoral' | 'socratic_academic' | 'corporate_case_study' | 'action_coaching'
  autoCitations: 'scripture_and_traditions' | 'peer_reviewed_literature' | 'industry_standards_sop' | 'practical_frameworks'
}
```

* **`faith_based`:** Activates biblical hermeneutics, sermon transformer, and multi-tradition cross-references.
* **`higher_ed` / `k12`:** Generates academic syllabi, peer-reviewed bibliographies, critical thinking debate prompts, and Bloom's taxonomy objectives.
* **`corporate` (KickAss):** Generates SOP microlearning blocks, compliance checklists, scenario-based workplace simulations, and executive summaries.
* **`creator`:** Generates high-energy video scripts, downloadable action workbooks, community discussion prompts, and transformation milestones.

---

### Layer 4: Integrations & Standards Matrix

```
┌──────────────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Integration / Standard           │ Faith-Based │ Academic    │ Corporate   │
├──────────────────────────────────┼─────────────┼─────────────┼─────────────┤
│ Open Badges 2.0 / 3.0 (W3C)      │     ✅      │     ✅      │     ✅      │
│ SCORM 1.2 / 2004 Runtime         │     ✅      │     ✅      │     ✅      │
│ H5P Interactive Activities       │     ✅      │     ✅      │     ✅      │
│ Stripe Connect (0% fee)          │     ✅      │     ✅      │     ✅      │
│ Hosted Video (Mux / HLS)         │     ✅      │     ✅      │     ✅      │
│ Private Podcast Feeds (RSS)      │     ✅      │     ✅      │     ✅      │
│ OneRoster 1.2 SIS Sync           │     ⚠️      │     ✅      │     ❌      │
│ Google & Microsoft SSO           │     ✅      │     ✅      │     ✅      │
│ ChMS Cryptographic Sync          │     ✅      │     ❌      │     ❌      │
│ SCIM / HRIS Employee Sync        │     ❌      │     ❌      │     ✅      │
└──────────────────────────────────┴─────────────┴─────────────┴─────────────┘
```

---

## 4. Four-Phase Staged Implementation Roadmap

* **Phase 1: Dynamic Brand Resolver & Metadata (1 Day)**
  * Implement `getPlatformBranding(host)`.
  * Update root metadata, layout branding, and transactional email signatures.
* **Phase 2: Database Vertical Column & Adaptive Terminology (2 Days)**
  * Add `organizations.vertical` migration.
  * Integrate adaptive terminology with `next-intl` dictionary hooks.
* **Phase 3: Multi-Vertical AI Personas (2 Days)**
  * Refactor `MultiDocumentSynthesizerInput` with corporate & academic personas.
  * Enhance `MultiDocumentCourseSynthesizerModal` to support course type presets.
* **Phase 4: Full Test Surface & Security Pass (1 Day)**
  * Register test coverage (`covers(...)`) for multi-brand and vertical routing.
  * Execute full verification (`test:surface`, `typecheck`, `lint`, and 100% green tests).

---

## 5. Formal Council Signoff & Resolution

### **COUNCIL RESOLUTION COUNCIL-2026-045**
* **Resolution Title:** *Adoption of Adaptive Multi-Brand & Multi-Vertical Architecture ("KickAss LMS" / "ChurchCore LMS")*
* **Date of Adoption:** October 6, 2026
* **Council Status:** **APPROVED UNANIMOUSLY (5-0)**

#### **Voting Record:**
1. **Lead Architect / System Engineering:** *AYE* (Zero duplication overhead, unified test suite).
2. **Security & Data Integrity Auditor:** *AYE* (Strict RLS multi-tenancy preserved across all domains).
3. **Pedagogical & Instructional Director:** *AYE* (Faith-specific hermeneutics preserved; academic/corporate personas added).
4. **Operations & Infrastructure Lead:** *AYE* (Single deployment cluster on Vercel/Supabase; zero server duplication).
5. **Product & Commercial Strategy Officer:** *AYE* (Unlocks corporate and university TAM without brand dilution).

#### **Mandatory Council Constraints:**
1. **Zero Christian Dilution:** Default `vertical` must always resolve to `'faith_based'` for all existing church tenants.
2. **Zero Test Surface Regression:** All 307 existing test surfaces and 95 test suites must remain 100% green.
3. **Strict Domain Isolation:** Cookies and session tokens must adhere to host-specific cookie prefixes (`__Host-` or tenant domain boundaries).

---
*Signed and sealed into the ChurchCore LMS Architectural Archives on October 6, 2026.*
