# Implementation summary

COUNCIL-2026-022 approved database enforcement of the existing group limit. A
new invoker trigger creates a group row version before counting memberships,
serializing additions and limit edits while preserving tenant RLS. A second
trigger rejects lowered limits below current membership count. Existing overfull
groups keep their members; role edits and removals remain possible. Staff actions
map only the capacity SQLSTATE to a fixed safe message. No schema data deletion,
Auth model change, new dependency, Academy edit or cloud migration was made.

Added 13 transactional SQL assertions and a real two-isolation race script to
E2E CI. Corrected an arbitrary test fixture and invalid empty workflow `needs`.
Version 0.26.5, changelog, README, testing and MVP status are updated.
