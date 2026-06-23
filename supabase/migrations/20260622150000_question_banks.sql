-- Question Banks: reusable question pools with per-attempt random draws
-- COUNCIL-2026-011

-- ── question_banks ────────────────────────────────────────────────────────────

CREATE TABLE public.question_banks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES public.profiles(uid),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_banks: teachers/admins can select own org"
  ON public.question_banks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager', 'teacher')
    )
  );

CREATE POLICY "question_banks: admins/managers can insert"
  ON public.question_banks FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

CREATE POLICY "question_banks: admins/managers can update own org"
  ON public.question_banks FOR UPDATE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

CREATE POLICY "question_banks: admins/managers can delete own org"
  ON public.question_banks FOR DELETE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- ── bank_questions ────────────────────────────────────────────────────────────

CREATE TABLE public.bank_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id          UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  question_type    TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'matching', 'fill_blank')),
  question_content JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bank_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_questions: teachers/admins can select via bank"
  ON public.bank_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.question_banks qb
      WHERE qb.id = bank_questions.bank_id
        AND (
          public.is_platform_admin()
          OR (
            public.current_user_org_id() = qb.org_id
            AND public.current_user_role() IN ('admin', 'manager', 'teacher')
          )
        )
    )
  );

CREATE POLICY "bank_questions: admins/managers can insert via bank"
  ON public.bank_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.question_banks qb
      WHERE qb.id = bank_questions.bank_id
        AND public.current_user_org_id() = qb.org_id
        AND public.current_user_role() IN ('admin', 'manager')
    )
  );

CREATE POLICY "bank_questions: admins/managers can delete via bank"
  ON public.bank_questions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.question_banks qb
      WHERE qb.id = bank_questions.bank_id
        AND public.current_user_org_id() = qb.org_id
        AND public.current_user_role() IN ('admin', 'manager')
    )
  );

-- Fast draw query
CREATE INDEX idx_bank_questions_bank ON public.bank_questions(bank_id);

-- ── draw_from_bank RPC ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.draw_from_bank(p_bank_id UUID, p_count INTEGER)
RETURNS SETOF JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bq.question_content
  FROM public.bank_questions bq
  JOIN public.question_banks qb ON qb.id = bq.bank_id
  WHERE bq.bank_id = p_bank_id
    AND qb.org_id = public.current_user_org_id()
  ORDER BY random()
  LIMIT p_count;
$$;

GRANT EXECUTE ON FUNCTION public.draw_from_bank(UUID, INTEGER) TO authenticated;
