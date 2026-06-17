# Demo Data Reset

This repo includes a destructive demo-data reset utility:

```bash
npm run demo:reset -- --confirm --retain-email=you@example.com
```

The script uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
It refuses to run unless both `--confirm` and `--retain-email` are provided.

## What It Does

- Keeps the retained auth user and promotes/keeps that profile as `admin`.
- Deletes other auth users.
- Clears LMS/domain data.
- Creates polished demo users, teachers, students, program tracks, blueprints, terms, sections, cohorts, content courses, blocks, enrollments, announcements, calendar events, and notifications.

## Demo Programs

- First Year Bible Studies Diploma: 8 hybrid courses, 4 August-December and 4 in the next January-December academic year, each modeled as a 5-week section.
- Associate of Biblical Studies Year Two: second-year associate degree pathway with advanced Bible, theology, ministry, preaching, care, mission, ethics, and capstone courses.
- New Members Discipleship: four Monday hybrid discipleship path beginning in September.
- Wednesday Remote Bible Study: 10-member remote self-paced Gospel of John group with a one-year Wednesday rhythm.
- Forge Ministry Formation: residency-style ministry formation program.
- Christian Leadership Development: leadership pathway for emerging ministry leaders.

Generated accounts use:

```text
ChurchCoreDemo!2026
```

Do not run this against production unless you intentionally want a destructive reset.
