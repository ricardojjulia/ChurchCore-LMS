-- Promote the project owner to admin.
-- Safe to run multiple times (ON CONFLICT is not needed — just UPDATE by email).

UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE email = 'ricardojjulia@gmail.com';
