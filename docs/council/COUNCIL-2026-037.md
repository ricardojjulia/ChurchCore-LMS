# COUNCIL-2026-037: Assignment Rubrics & Multi-Criterion Assessment

**Status:** RATIFIED — Implemented & Verified
**Date:** 2026-09-29
**Council:** Architecture Council, ChurchCore LMS (6/6 unanimous)
**Related:** COUNCIL-2026-005, COUNCIL-2026-030, COUNCIL-2026-031
**Tags:** grading, rubrics, assessments, gradebook, accreditation

---

## Context

Seminaries, Bible colleges, and Christian high schools require rigorous, multi-criterion assessment frameworks for essays, sermons, exegesis papers, and practicum reports. Currently, ChurchCore LMS supports point-based grading and qualitative text feedback, but lacks structured grading rubrics.

Adding Rubric-Based Assessment fulfills accreditation criteria for higher education institutions while providing students with clear, transparent grading expectations.

---

## Council Positions & Architectural Guardrails

- **The Architect:** Rubrics attach directly to `assignment` and `graded_discussion` blocks. Teachers define criteria (e.g., *Biblical Exegesis*, *Theological Coherence*, *Clarity & Grammar*, *Practical Application*), score weights, and achievement performance levels (e.g., *Exemplary*, *Proficient*, *Developing*, *Beginning*).
- **The Engineer:** Implement standalone server actions `getPrebuiltRubricTemplates()`, `saveBlockRubric()`, and `gradeWithRubric()` in `src/app/actions/rubrics.ts`. Store student rubric evaluations in submission content and auto-compute total scores.
- **The QA Lead:** Provide interactive scoring components (`RubricGrader.tsx`), rubric builder dialogs (`RubricBuilderModal.tsx`), and student feedback breakdowns (`RubricFeedbackView.tsx`).
- **The Product Owner:** Include pre-built theological rubric templates (*Theological Exegesis Paper Rubric* and *Expository Sermon Preparation Rubric*).

---

## Technical Specifications

### 1. Types & Data Structures (`src/types/rubrics.ts`)
- `RubricCriterionLevel` (`id`, `label`, `points`, `description`)
- `RubricCriterion` (`id`, `title`, `description`, `levels`)
- `AssignmentRubric` (`title`, `criteria`)
- `CriterionEvaluation` (`criterionId`, `levelId`, `points`, `comments`)

### 2. Server Actions & Security (`src/app/actions/rubrics.ts`)
- Role validation: `admin`, `manager`, `teacher` only.
- Cross-org and course ownership validation.
- Automated score summation and side-effect dispatch (`applyGradeSideEffects`).

### 3. UI Components (`src/components/rubrics/`)
- `RubricBuilderModal.tsx`: Preset template selection, criteria editing, point weighting.
- `RubricGrader.tsx`: Interactive criterion level selection with live total calculation.
- `RubricFeedbackView.tsx`: Student-facing view with level badges and instructor feedback.

---

## Definition of Done

- [x] TypeScript type system for rubrics and evaluations in `src/types/rubrics.ts`.
- [x] Server actions for template retrieval, rubric attachment, and submission scoring in `src/app/actions/rubrics.ts`.
- [x] UI components `RubricBuilderModal`, `RubricGrader`, and `RubricFeedbackView`.
- [x] Unit test suite covering templates, validation, unauthorized attempts, and score calculation.
- [x] Test surface coverage registered and verified via `npm run test:surface`.
- [x] All quality gates (`npm run verify`) passing with zero errors.

---
*Ratified by full council - COUNCIL-2026-037*
*The Architect | The Engineer | The Security Lead*
*The Product Owner | The QA Lead | The Data Engineer*
