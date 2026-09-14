-- Identity preview/apply execute as service_role and call this immutable helper.
-- Keep it unavailable to client roles while restoring the internal call chain.
REVOKE ALL ON FUNCTION public.oneroster_safe_role(text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oneroster_safe_role(text) TO service_role;
