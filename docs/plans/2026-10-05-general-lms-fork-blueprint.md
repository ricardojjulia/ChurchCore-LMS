# Architectural Blueprint: General LMS Fork & Multi-Vertical Strategy

**Document Ref:** PLAN-2026-001  
**Target Architecture:** ChurchCore LMS $\rightarrow$ General Purpose LMS ("CoreLMS" / "OmniLMS")  
**Status:** Planning / Blueprint Only (Do Not Execute)  
**Date:** 2026-10-05  

---

## 1. Executive Summary & Forking Approaches

ChurchCore LMS contains an enterprise-grade academic engine (OneRoster 1.2, SCORM 1.2/2004, H5P, Open Badges 2.0/3.0, Rubrics, Gradebook Grid, Stripe Connect, Hosted Video, and AI Course Synthesis).

There are two viable architectural strategies for delivering a general-purpose LMS:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ARCHITECTURAL STRATEGIES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STRATEGY A: Single Monorepo with Multi-Vertical Tenant Engine (Recommended) │
│  - Single codebase; zero duplicate maintenance.                             │
│  - Tenant vertical flag (`organizations.vertical`) switches prompts,        │
│    dictionaries, and visible navigation items dynamically.                  │
│                                                                             │
│  STRATEGY B: Clean Hard-Fork ("CoreLMS")                                    │
│  - Independent repo tailored exclusively for K-12, Higher-Ed, & Corporate.  │
│  - Strip church-specific ChMS sync and theological AI prompts.              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer-by-Layer Architectural Separation

### Layer 1: Data Model & Schema Generalization
* **Tenant Vertical Classification:**
  ```sql
  ALTER TABLE organizations 
  ADD COLUMN vertical TEXT NOT NULL DEFAULT 'faith_based' 
  CHECK (vertical IN ('faith_based', 'higher_ed', 'k12', 'corporate', 'creator'));
  ```
* **Neutral Table & Column Naming:**
  * `groups` and `cohorts` are already domain-neutral.
  * `churchcore_connect_pairs` is isolated into an optional module loaded only when `vertical === 'faith_based'`.

---

### Layer 2: Terminology & Adaptive Dictionary Engine
Implement an adaptive terminology resolver (`src/lib/terminology/`) that dynamically maps UI labels based on tenant vertical and user locale:

| Canonical Key | `faith_based` (Default) | `higher_ed` | `corporate` | `creator` |
| :--- | :--- | :--- | :--- | :--- |
| `entity.organization` | Church / Ministry | University / College | Company / Enterprise | Academy |
| `entity.group` | Small Group / Ministry Team | Section / Study Group | Department / Cohort | Community Circle |
| `entity.leader` | Pastor / Ministry Director | Professor / Instructor | Training Manager / Lead | Coach / Creator |
| `entity.learner` | Member / Disciple | Student / Scholar | Employee / Trainee | Member / Student |
| `entity.pathway` | Discipleship Pathway | Degree / Certificate Track | Onboarding / Compliance Track | Mastery Program |
| `entity.event` | Service / Gathering | Lecture / Seminar | Workshop / Training Session | Live Masterclass |

---

### Layer 3: AI Modular Persona Engine
Generalize `callOpenRouter` prompts via a Persona Provider (`src/lib/ai/personas.ts`):

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
* **`corporate`:** Generates SOP microlearning blocks, compliance checklists, scenario-based workplace simulations, and executive summaries.
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

## 3. Four-Phase Execution Plan (When Ready)

### Phase 1: Multi-Vertical Core Extraction (Estimate: 3 Days)
1. Add `organizations.vertical` column with migration and schema type generation.
2. Build `src/lib/terminology/resolver.ts` and integrate with `next-intl` dictionary hooks.
3. Replace hardcoded "church/ministry" strings with contextual dictionary lookups across admin and learner portals.

### Phase 2: AI Multi-Vertical Synthesis (Estimate: 2 Days)
1. Refactor `MultiDocumentSynthesizerInput` to accept `vertical` and `pedagogicalGoal`.
2. Implement persona templates (`higher_ed_academic.ts`, `corporate_compliance.ts`, `general_creator.ts`).
3. Update `MultiDocumentCourseSynthesizerModal` to allow selecting course context (Academic, Corporate, Creative, Ministry).

### Phase 3: Brand & White-Labeling Engine (Estimate: 2 Days)
1. Support custom organization favicon, logo, and primary brand colors via CSS variables (`--brand-primary`, `--brand-accent`).
2. Neutralize default email templates and push notification sound/copy.
3. Configure dynamic metadata (`app/layout.tsx`) reading tenant branding.

### Phase 4: Standalone Repository Fork / Packaging (Estimate: 2 Days)
1. Create target repo `core-lms` (or `omni-lms`).
2. Script automated sync tool to pull upstream core engine updates (SCORM, Gradebook, Video, Open Badges) while maintaining decoupled vertical branding.
3. Run complete verification (`test:surface`, `typecheck`, `lint`, and 100% green test passes).

---

## 4. Zero-Regression & Council Safeguards

* **Council Verification:** All new features must maintain `covers(...)` test surface parity across all verticals.
* **Backward Compatibility:** Default `vertical` must always resolve to `'faith_based'` for existing ChurchCore LMS tenants to guarantee zero breaking changes.
* **Test Isolation:** Dedicated unit test matrix verifying that changing `vertical` generates correct terminology, hides unneeded integrations, and selects proper AI personas.
