# Academic Program Workflows

ChurchCore LMS now supports the academic structure needed to run full ministry education programs, not just standalone courses.

## Core Terms

- **Program track**: the parent pathway, such as First Year Bible Studies Diploma, Associate of Biblical Studies Year Two, Forge Residency, or Christian Leadership Development.
- **Course blueprint**: the reusable catalog definition for a course inside a track, such as `BIB-101 Old Testament Survey`.
- **Term**: the time container, such as Fall 2026, January-December 2027, or a September discipleship block.
- **Section**: the actual scheduled offering of a blueprint during a term. Sections carry delivery format, enrollment dates, access windows, and capacity.
- **Cohort**: the group of people moving together through one or more sections.
- **Course**: the teachable content shell with blocks, quizzes, assignments, discussions, certificates, XP, and progress.

## How To Offer A Program

1. Create a program track in **Admin > Program Tracks**.
2. Create course blueprints in **Admin > Course Blueprints** and attach each blueprint to that track.
3. Create the term or series in **Admin > Terms**.
4. Create sections in **Admin > Sections**, choosing the blueprint, term, delivery format, dates, and capacity.
5. Create or edit the content course and use the **Academic Placement** section to attach it to the right blueprint.
6. Create a cohort in **Admin > Cohorts**, add learners, and connect that cohort to the required sections.

The course page now shows an **Academic Placement** panel for staff, so a course can be traced back to its blueprint, track, and scheduled sections.

## Demo Program Examples

The demo reset script creates these examples:

| Program | Structure |
|---|---|
| First Year Bible Studies Diploma | 8 hybrid courses, 4 from August-December and 4 in the next January-December cycle, each as a 5-week section |
| Associate of Biblical Studies Year Two | Second-year associate degree path with 8 advanced courses |
| New Members Discipleship | Four Monday hybrid sessions beginning in September |
| Wednesday Remote Bible Study | 10-member remote, self-paced Gospel of John group with a year of Wednesday check-ins |
| Forge Ministry Formation | Residency-style formation track for ministry apprentices |
| Christian Leadership Development | Leadership development path for emerging ministry leaders |

See [demo-data.md](./demo-data.md) for the destructive reset command and safety gates.
