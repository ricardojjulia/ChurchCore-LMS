-- Allow course owners and admins to delete courses.
-- ON DELETE CASCADE handles course_blocks, course_enrollments, block_submissions.

CREATE POLICY "Course owners and admins can delete courses"
ON public.courses FOR DELETE
USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
