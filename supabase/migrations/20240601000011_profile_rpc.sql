-- SECURITY DEFINER function: returns the calling user's own profile row.
-- Bypasses RLS entirely so it works regardless of policy issues.
-- Returns empty set (not error) when unauthenticated.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  uid           uuid,
  auth_id       uuid,
  display_name  text,
  email         text,
  role          public.user_role,
  status        public.user_status,
  xp_points     int,
  current_level int,
  avatar_url    text,
  student_id    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    uid,
    auth_id,
    display_name,
    email,
    role,
    status,
    xp_points,
    current_level,
    avatar_url,
    student_id
  FROM public.profiles
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

-- Grant execute to the anon and authenticated roles
-- (anon call returns empty set since auth.uid() = null when not logged in)
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO anon, authenticated;
