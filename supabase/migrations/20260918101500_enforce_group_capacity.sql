-- COUNCIL-2026-022: serialize membership additions with each other and limit edits.
CREATE OR REPLACE FUNCTION public.enforce_group_member_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  capacity integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.group_id = OLD.group_id THEN
    RETURN NEW;
  END IF;

  -- A row version change also forces stale REPEATABLE READ writers to retry.
  UPDATE public.section_groups SET max_members = max_members
  WHERE id = NEW.group_id AND org_id = NEW.org_id
  RETURNING max_members INTO capacity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = '42501';
  END IF;

  -- Leave duplicate assignments to the existing unique constraint.
  IF capacity IS NOT NULL AND (
    SELECT count(*) FROM public.section_group_members
    WHERE group_id = NEW.group_id AND user_id <> NEW.user_id
  ) >= capacity THEN
    RAISE EXCEPTION 'This group has reached its maximum number of members.'
      USING ERRCODE = 'PCC01';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_group_member_capacity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS enforce_group_member_capacity ON public.section_group_members;
CREATE TRIGGER enforce_group_member_capacity
BEFORE INSERT OR UPDATE OF group_id ON public.section_group_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_group_member_capacity();

CREATE OR REPLACE FUNCTION public.enforce_group_capacity_reduction()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.max_members IS NOT NULL
    AND (OLD.max_members IS NULL OR NEW.max_members < OLD.max_members)
    AND (SELECT count(*) FROM public.section_group_members WHERE group_id = NEW.id) > NEW.max_members THEN
    RAISE EXCEPTION 'The maximum cannot be lower than the current member count.'
      USING ERRCODE = 'PCC01';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_group_capacity_reduction() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS enforce_group_capacity_reduction ON public.section_groups;
CREATE TRIGGER enforce_group_capacity_reduction
BEFORE UPDATE OF max_members ON public.section_groups
FOR EACH ROW EXECUTE FUNCTION public.enforce_group_capacity_reduction();
