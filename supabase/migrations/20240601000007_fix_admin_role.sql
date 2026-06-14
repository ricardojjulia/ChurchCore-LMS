-- Promote the project owner to admin, matching on both email and auth_id
-- (auth_id path handles the case where profiles.email was null at migration time)

UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE email = 'ricardojjulia@gmail.com'
   OR auth_id IN (
     SELECT id FROM auth.users WHERE email = 'ricardojjulia@gmail.com'
   );
