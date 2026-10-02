-- ChurchCore LMS — Comprehensive Block Types Registry Sync
-- Ensures all 16 supported course block types exist and are active in public.block_types.

INSERT INTO public.block_types (id, label, icon, category, is_active)
VALUES
  ('module_header', 'Module',          '📁', 'structure', true),
  ('page',          'Page',            '📄', 'content',   true),
  ('video_stream',  'Video',           '🎬', 'content',   true),
  ('resource_file', 'File',            '📎', 'content',   true),
  ('external_url',  'External URL',    '🔗', 'content',   true),
  ('scorm',         'SCORM Package',   '📦', 'content',   false),
  ('live_session',  'Live Session',    '🎙️', 'content',   true),
  ('teacher_plug',  'Teacher Card',    '👤', 'content',   true),
  ('assignment',    'Assignment',      '📝', 'activity',  true),
  ('quiz',          'Quiz',            '🧠', 'activity',  true),
  ('discussion',    'Discussion',      '💬', 'activity',  true),
  ('survey',        'Survey',          '📊', 'activity',  true),
  ('checklist',     'Checklist',       '✅', 'activity',  true),
  ('flashcard_set', 'Flashcard Set',   '🗂️', 'activity',  true),
  ('attendance',    'Attendance',      '🗓️', 'activity',  true),
  ('h5p',           'H5P Interactive', '✨', 'activity',  true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;
