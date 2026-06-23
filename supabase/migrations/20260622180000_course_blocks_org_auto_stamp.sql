-- Auto-stamp org_id on course_blocks INSERT from the parent course.
--
-- Same class of bug as courses: the RLS WITH CHECK requires
-- current_user_org_id() = org_id, but the builder client never sends org_id.
-- The trigger inherits org_id from the parent course row, which is always
-- in the same org as the inserting user (enforced by the courses RLS).

CREATE OR REPLACE FUNCTION public.stamp_course_block_org_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.courses
    WHERE id = NEW.course_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_course_block_org_id ON public.course_blocks;
CREATE TRIGGER trg_stamp_course_block_org_id
  BEFORE INSERT ON public.course_blocks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_course_block_org_id();
