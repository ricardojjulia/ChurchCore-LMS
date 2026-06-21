# Demo Data Reset

This repo includes a destructive demo-data reset utility:

```bash
npm run demo:reset -- --confirm --retain-email=you@example.com
```

The script uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
It refuses to run unless both `--confirm` and `--retain-email` are provided.

> **Demo credentials for all seeded accounts:** `ChurchCoreDemo!2026`

## What It Does

- Keeps the retained auth user and promotes/keeps that profile as `admin`.
- Deletes other auth users.
- Clears LMS/domain data.
- Creates polished demo users, teachers, students, program tracks, blueprints, terms, sections, cohorts, content courses, blocks, enrollments, graded submissions, certificates, announcements, calendar events, and notifications.

## v0.22.0 Demo Features

The following Sprint 2 features are available in the demo environment:

| Feature | How to see it |
|---|---|
| **Guardian email bridge** | Log in as a guardian-linked account; trigger a course completion to fire a notification queue entry |
| **Bulk CSV import** | Admin → Users → Import Users; upload a CSV with `email,display_name,role` columns |
| **Self-serve billing** | Admin → Billing; free-plan demo shows "Upgrade Plan"; paid-plan demo (with `stripe_customer_id` set) shows "Manage Subscription" |
| **PWA / Offline** | Open any course page; add to home screen on iOS/Android; go offline; amber banner appears; course content remains readable |
| **Graded discussions** | Open a course with a discussion block as a teacher; click "Grade" next to a student reply; student view shows the grade badge |

## Demo Programs

- First Year Bible Studies Diploma: 8 hybrid courses, 4 August-December and 4 in the next January-December academic year, each modeled as a 5-week section.
- Associate of Biblical Studies Year Two: second-year associate degree pathway with advanced Bible, theology, ministry, preaching, care, mission, ethics, and capstone courses.
- New Members Discipleship: four Monday hybrid discipleship path beginning in September.
- Wednesday Remote Bible Study: 10-member remote self-paced Gospel of John group with a one-year Wednesday rhythm.
- Forge Ministry Formation: residency-style ministry formation program.
- Christian Leadership Development: leadership pathway for emerging ministry leaders.

The reset also seeds:

- 276 graded submissions so `/performance`, course analytics, and submission views have real grade data.
- 10 certificates so `/certificates` is visibly populated for completed demo learners.
- A current-month institutional calendar event plus the Monday discipleship and Wednesday remote-study recurring events.

Generated accounts use:

```text
ChurchCoreDemo!2026
```

Do not run this against production unless you intentionally want a destructive reset.
