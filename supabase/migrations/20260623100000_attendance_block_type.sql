-- Migration 20260623100000: Attendance block type
-- Registers 'attendance' (and 'teacher_plug', which was added to BLOCK_TYPE_META
-- but never seeded into the DB table) in the block_types registry.
-- course_blocks.block_type_id has a FK → block_types(id), so both must exist here.

INSERT INTO public.block_types (id, label, icon, category, is_active) VALUES
  ('teacher_plug', 'Teacher Card', '👤', 'content',  true),
  ('attendance',   'Attendance',   '🗓️', 'activity', true)
ON CONFLICT (id) DO NOTHING;
