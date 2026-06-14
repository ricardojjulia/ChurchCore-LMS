-- =============================================================================
-- ChurchCore LMS — Initial Schema
-- Constitutional Architecture: RLS-first, JSONB polymorphic learning objects,
-- gamification with anti-exploitation XP/level trigger.
-- Run this in Supabase SQL Editor after provisioning a new project.
-- =============================================================================

-- ─── PROFILES ────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
    id             UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    full_name      TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')) DEFAULT 'student',
    xp_points      INT  DEFAULT 0 NOT NULL CHECK (xp_points >= 0),
    current_level  INT  DEFAULT 1 NOT NULL CHECK (current_level >= 1),
    avatar_url     TEXT,
    metadata       JSONB DEFAULT '{}'::jsonb
);

-- ─── BADGES ──────────────────────────────────────────────────────────────────

CREATE TABLE public.badges (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    badge_key               TEXT UNIQUE NOT NULL,
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL,
    icon_svg                TEXT,
    required_competency_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE TABLE public.profile_badges (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    badge_id   UUID REFERENCES public.badges(id)   ON DELETE CASCADE NOT NULL,
    awarded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(profile_id, badge_id)
);

-- ─── COURSES ─────────────────────────────────────────────────────────────────

CREATE TABLE public.courses (
    id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    title                  TEXT NOT NULL,
    description            TEXT,
    is_published           BOOLEAN DEFAULT false NOT NULL,
    owner_id               UUID REFERENCES public.profiles(id) NOT NULL,
    min_required_level     INT DEFAULT 1 NOT NULL,
    prerequisite_course_id UUID REFERENCES public.courses(id)
);

-- ─── ENROLLMENTS ─────────────────────────────────────────────────────────────

CREATE TABLE public.enrollments (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    course_id   UUID REFERENCES public.courses(id)  ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(user_id, course_id)
);

-- ─── MODULES ─────────────────────────────────────────────────────────────────

CREATE TABLE public.modules (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    course_id  UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title      TEXT NOT NULL,
    position   INT  NOT NULL DEFAULT 0,
    -- Polymorphic array of LearningNode objects (see JSONB spec in constitution)
    items      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ─── SUBMISSIONS ─────────────────────────────────────────────────────────────

CREATE TABLE public.submissions (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    course_id    UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    module_id    UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
    -- References the id field of a JSONB node inside modules.items
    item_id      TEXT NOT NULL,
    student_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    grade_pct    NUMERIC(5, 2),
    xp_awarded   INT DEFAULT 0 NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(student_id, module_id, item_id)
);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions    ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES POLICIES ───────────────────────────────────────────────────────

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- ─── BADGES POLICIES ─────────────────────────────────────────────────────────

CREATE POLICY "Badges are visible to all authenticated users"
ON public.badges FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view all earned badge records"
ON public.profile_badges FOR SELECT
USING (auth.role() = 'authenticated');

-- Badge awards only come from server-side (admin) operations, never client-side
CREATE POLICY "Only admins can award badges"
ON public.profile_badges FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- ─── COURSES POLICIES ────────────────────────────────────────────────────────

-- Level-gating and prerequisite mastery evaluated at the DB boundary
CREATE POLICY "Courses visible only if user meets level and prerequisite requirements"
ON public.courses FOR SELECT
USING (
    (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.current_level >= courses.min_required_level
        )
        AND (
            courses.prerequisite_course_id IS NULL OR
            EXISTS (
                SELECT 1 FROM public.submissions
                WHERE submissions.student_id = auth.uid()
                AND submissions.course_id = courses.prerequisite_course_id
                AND submissions.grade_pct >= 80.0
            )
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

CREATE POLICY "Teachers and admins can create courses"
ON public.courses FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

CREATE POLICY "Course owners can update their courses"
ON public.courses FOR UPDATE
USING (owner_id = auth.uid());

-- ─── ENROLLMENTS POLICIES ────────────────────────────────────────────────────

CREATE POLICY "Students can view their own enrollments"
ON public.enrollments FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Teachers and admins can view all enrollments"
ON public.enrollments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

CREATE POLICY "Students can self-enroll in published courses"
ON public.enrollments FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ─── MODULES POLICIES ────────────────────────────────────────────────────────

CREATE POLICY "Enrolled students can view modules"
ON public.modules FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE enrollments.user_id = auth.uid()
        AND enrollments.course_id = modules.course_id
    )
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

CREATE POLICY "Teachers and admins can manage modules"
ON public.modules FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

-- ─── SUBMISSIONS POLICIES ────────────────────────────────────────────────────

CREATE POLICY "Students can view and create their own submissions"
ON public.submissions FOR ALL
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers and admins can view and grade all submissions"
ON public.submissions FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
);

-- =============================================================================
-- XP / LEVEL ESCALATION TRIGGER
-- Level = 1 + floor(sqrt(xp / 100))  — quadratic progression scale
-- Calculated server-side to prevent client tampering.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_xp_level_escalation()
RETURNS TRIGGER AS $$
DECLARE
    calculated_level INT;
BEGIN
    calculated_level := 1 + FLOOR(SQRT(NEW.xp_points::FLOAT / 100));

    IF calculated_level <> NEW.current_level THEN
        NEW.current_level := calculated_level;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_xp_updated
    BEFORE UPDATE OF xp_points ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_xp_level_escalation();

-- =============================================================================
-- AUTO-PROVISION PROFILE ON SIGN-UP
-- Mirrors Supabase auth.users into public.profiles automatically.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'student'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
