-- Drop the SECURITY DEFINER get_my_profile() function.
-- Direct table queries with proper RLS policies are the correct approach.
-- Session token refresh is handled by middleware (middleware.ts) for all routes.

DROP FUNCTION IF EXISTS public.get_my_profile();
