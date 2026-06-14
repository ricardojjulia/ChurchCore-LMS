-- Fix infinite recursion in profiles RLS.
--
-- current_user_uid() and current_user_role() both read from public.profiles.
-- When a SELECT on profiles evaluates the "admin manager read all" policy, it
-- calls current_user_role(), which queries profiles again, triggering the same
-- policies → infinite recursion (SQLSTATE 42P17).
--
-- Fix: add SET row_security = off so these helper functions bypass RLS entirely
-- when reading the profiles table. They are SECURITY DEFINER already (running as
-- the function owner with superuser privileges), so this is safe: the functions
-- only return data for auth.uid(), not arbitrary rows.

CREATE OR REPLACE FUNCTION public.current_user_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT uid FROM public.profiles
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.profiles
  WHERE auth_id = auth.uid()
  AND   status  = 'active'
  LIMIT 1;
$$;
