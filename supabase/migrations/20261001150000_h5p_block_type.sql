-- ChurchCore LMS — Migration: H5P Interactive Content Block Type
-- Adds 'h5p' to block_types registry for interactive activities (H5P embed & packages).

INSERT INTO public.block_types (id, label, icon, category, is_active)
VALUES (
  'h5p',
  'H5P Interactive',
  '✨',
  'activity',
  true
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  is_active = true;

