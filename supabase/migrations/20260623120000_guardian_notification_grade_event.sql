-- Migration 20260623120000: Add assignment_graded event type to guardian_notification_queue
-- gradeSubmission now queues guardian emails for grade events, matching the existing
-- course_completed and badge_awarded pipeline.

ALTER TABLE public.guardian_notification_queue
  DROP CONSTRAINT IF EXISTS guardian_notification_queue_event_type_check;

ALTER TABLE public.guardian_notification_queue
  ADD CONSTRAINT guardian_notification_queue_event_type_check
  CHECK (event_type IN ('course_completed', 'badge_awarded', 'assignment_graded'));
