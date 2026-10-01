-- ChurchCore LMS — Migration: H5P Interactive Content Block Type
-- Adds 'h5p' to block_types registry for interactive activities (H5P embed & packages).

INSERT INTO public.block_types (id, label, icon, category, color, description, is_active)
VALUES (
  'h5p',
  'H5P Interactive',
  '✨',
  'activity',
  'fuchsia',
  'Interactive video, branching scenario, quiz, or embedded H5P',
  true
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  is_active = true;
