-- ═══════════════════════════════════════════════════════════════════════
-- Migration 024: Internal Messaging System
-- Tables: message_threads, message_thread_participants, messages
-- RLS: all policies use current_user_uid() — no profiles recursion
-- NOTE: All three tables are created before any RLS policies so
--       cross-table references in policies resolve correctly.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Tables (all three first) ────────────────────────────────────────

CREATE TABLE public.message_threads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_type          TEXT NOT NULL DEFAULT 'direct'
                         CHECK (thread_type IN ('direct','group','course','announcement')),
  subject              TEXT,
  course_id            UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  created_by           UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,
  last_sender_uid      UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.message_thread_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member','observer')),
  can_reply    BOOLEAN NOT NULL DEFAULT TRUE,
  last_read_at TIMESTAMPTZ,
  is_muted     BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at      TIMESTAMPTZ,
  UNIQUE(thread_id, user_id)
);

CREATE TABLE public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Indexes ─────────────────────────────────────────────────────────

CREATE INDEX idx_message_threads_last_msg ON public.message_threads(last_message_at DESC NULLS LAST);
CREATE INDEX idx_direct_threads           ON public.message_threads(created_by, thread_type)
  WHERE thread_type = 'direct';
CREATE INDEX idx_mtp_user    ON public.message_thread_participants(user_id, left_at);
CREATE INDEX idx_mtp_thread  ON public.message_thread_participants(thread_id);
CREATE INDEX idx_messages_thread_time ON public.messages(thread_id, created_at DESC);
CREATE INDEX idx_messages_sender      ON public.messages(sender_id);

-- ── 3. Enable RLS ──────────────────────────────────────────────────────

ALTER TABLE public.message_threads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                    ENABLE ROW LEVEL SECURITY;

-- ── 4. message_threads policies ────────────────────────────────────────
-- (references message_thread_participants — table must exist first)

CREATE POLICY "threads: participant select"
  ON public.message_threads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.message_thread_participants mtp
      WHERE mtp.thread_id = message_threads.id
        AND mtp.user_id   = current_user_uid()
        AND mtp.left_at IS NULL
    )
  );

CREATE POLICY "threads: authenticated insert"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (
    created_by = current_user_uid()
    AND thread_type IN ('direct','group')
  );

CREATE POLICY "threads: creator update"
  ON public.message_threads FOR UPDATE TO authenticated
  USING  (created_by = current_user_uid())
  WITH CHECK (created_by = current_user_uid());

-- ── 5. message_thread_participants policies ────────────────────────────

CREATE POLICY "participants: self select"
  ON public.message_thread_participants FOR SELECT TO authenticated
  USING (user_id = current_user_uid());

CREATE POLICY "participants: shared thread select"
  ON public.message_thread_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.message_thread_participants mtp2
      WHERE mtp2.thread_id = message_thread_participants.thread_id
        AND mtp2.user_id   = current_user_uid()
        AND mtp2.left_at IS NULL
    )
  );

CREATE POLICY "participants: creator insert"
  ON public.message_thread_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.message_threads mt
      WHERE mt.id         = thread_id
        AND mt.created_by = current_user_uid()
    )
    OR user_id = current_user_uid()
  );

CREATE POLICY "participants: self update"
  ON public.message_thread_participants FOR UPDATE TO authenticated
  USING  (user_id = current_user_uid())
  WITH CHECK (user_id = current_user_uid());

-- ── 6. messages policies ───────────────────────────────────────────────

CREATE POLICY "messages: participant select"
  ON public.messages FOR SELECT TO authenticated
  USING (
    is_deleted = FALSE
    AND EXISTS (
      SELECT 1 FROM public.message_thread_participants mtp
      WHERE mtp.thread_id = messages.thread_id
        AND mtp.user_id   = current_user_uid()
        AND mtp.left_at IS NULL
    )
  );

CREATE POLICY "messages: participant insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = current_user_uid()
    AND EXISTS (
      SELECT 1 FROM public.message_thread_participants mtp
      WHERE mtp.thread_id = messages.thread_id
        AND mtp.user_id   = current_user_uid()
        AND mtp.can_reply = TRUE
        AND mtp.left_at IS NULL
    )
  );

CREATE POLICY "messages: self soft delete"
  ON public.messages FOR UPDATE TO authenticated
  USING  (sender_id = current_user_uid() AND is_deleted = FALSE)
  WITH CHECK (
    sender_id  = current_user_uid()
    AND is_deleted = TRUE
    AND body = (SELECT body FROM public.messages WHERE id = messages.id)
  );

-- ── 7. Trigger: update thread summary on new message ──────────────────

CREATE OR REPLACE FUNCTION public.update_thread_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.message_threads
  SET last_message_at      = NEW.created_at,
      last_message_preview = LEFT(NEW.body, 120),
      last_sender_uid      = NEW.sender_id
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_thread_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_on_message();

-- ── 8. Function: unread thread count ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_unread_message_threads()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.message_thread_participants mtp
  JOIN public.message_threads mt ON mt.id = mtp.thread_id
  WHERE mtp.user_id    = current_user_uid()
    AND mtp.left_at IS NULL
    AND mtp.is_muted   = FALSE
    AND mt.last_message_at IS NOT NULL
    AND mt.last_sender_uid != current_user_uid()
    AND (
      mtp.last_read_at IS NULL
      OR mtp.last_read_at < mt.last_message_at
    );
$$;
