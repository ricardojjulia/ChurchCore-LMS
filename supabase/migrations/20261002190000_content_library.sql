-- COUNCIL-2026-043: Starter Content Library and Course Templates

-- 1. library_templates
CREATE TABLE IF NOT EXISTS public.library_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('discipleship', 'leadership', 'volunteers', 'ministry', 'theology', 'safety')),
  audience TEXT NOT NULL DEFAULT 'all',
  language TEXT NOT NULL DEFAULT 'en',
  license TEXT NOT NULL DEFAULT 'cc-by-nc-4.0',
  attribution TEXT NOT NULL DEFAULT 'ChurchCore Curriculum Council',
  cover_image_url TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_starter_pack BOOLEAN NOT NULL DEFAULT false,
  starter_pack_courses JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_templates_cat_lang ON public.library_templates(category, language, is_published);

-- 2. library_adoptions
CREATE TABLE IF NOT EXISTS public.library_adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.library_templates(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('copy', 'linked')) DEFAULT 'copy',
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  path_id UUID REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  adopted_by UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_template UNIQUE(org_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_library_adoptions_org ON public.library_adoptions(org_id);

-- 3. RLS Policies
ALTER TABLE public.library_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_adoptions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view published library templates
CREATE POLICY "Authenticated users can view published library templates"
  ON public.library_templates
  FOR SELECT
  USING (
    is_published = true
    OR public.is_platform_admin()
  );

-- Only platform admins can manage templates
CREATE POLICY "Platform admins manage library templates"
  ON public.library_templates
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Org admins and managers can view and create adoptions
CREATE POLICY "Org admins manage adoptions"
  ON public.library_adoptions
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  );

-- 4. Initial Seed Templates
INSERT INTO public.library_templates (slug, title, description, category, audience, language, license, attribution, is_starter_pack, snapshot)
VALUES
(
  'foundations-of-faith',
  'Foundations of Faith & Christian Living',
  'Essential core doctrine, biblical foundations, prayer, and daily Christian walk for new believers and membership classes.',
  'discipleship',
  'new_members',
  'en',
  'cc-by-nc-4.0',
  'ChurchCore Theological Heritage Group',
  false,
  '{
    "modules": [
      {
        "title": "Module 1: The Word of God & Prayer",
        "blocks": [
          { "title": "Understanding the Bible", "type": "page", "content": { "body": "<p>The Scriptures are inspired by God and profitable for teaching, reproof, correction, and training in righteousness.</p>" } },
          { "title": "Daily Prayer & Fellowship", "type": "page", "content": { "body": "<p>Discover how to build a vibrant, meaningful daily prayer life in communion with God.</p>" } },
          { "title": "Foundations Quiz", "type": "quiz", "content": { "questions": [ { "id": "q1", "text": "What is the primary purpose of scripture?", "type": "multiple_choice", "options": ["Equipping believers for every good work", "Historical trivia only", "Speculation", "None"], "correct_index": 0, "points": 10 } ] } }
        ]
      },
      {
        "title": "Module 2: Walking in the Spirit",
        "blocks": [
          { "title": "The Fruit of the Spirit", "type": "page", "content": { "body": "<p>Exploring love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control.</p>" } },
          { "title": "Personal Reflection", "type": "discussion", "content": { "prompt": "Which fruit of the Spirit is God currently cultivating most in your season of life?" } }
        ]
      }
    ]
  }'::jsonb
),
(
  'volunteer-ministry-essentials',
  'Volunteer Ministry & Hospitality Essentials',
  'Best practices for church volunteers, greeting teams, hospitality, and servant leadership.',
  'volunteers',
  'volunteers',
  'en',
  'cc-by-nc-4.0',
  'ChurchCore Ministry Network',
  false,
  '{
    "modules": [
      {
        "title": "Module 1: The Heart of a Servant",
        "blocks": [
          { "title": "Serving with Excellence", "type": "page", "content": { "body": "<p>Serving God is a high calling. We serve with joy, humility, and intentionality.</p>" } },
          { "title": "Creating Welcoming Environments", "type": "page", "content": { "body": "<p>How every interaction from the parking lot to the sanctuary reflects Christ to guests.</p>" } }
        ]
      }
    ]
  }'::jsonb
),
(
  'child-safety-safeguarding',
  'Child Safety & Ministry Safeguarding',
  'Comprehensive safety protocol, two-adult rules, background policies, and emergency preparedness for children and youth workers.',
  'safety',
  'volunteers',
  'en',
  'cc-by-nc-4.0',
  'ChurchCore Safety Council',
  false,
  '{
    "modules": [
      {
        "title": "Module 1: Safeguarding Standards",
        "blocks": [
          { "title": "The Two-Adult Rule", "type": "page", "content": { "body": "<p>Never leave a child isolated with a single adult. Always maintain visibility and accountability.</p>" } },
          { "title": "Check-in & Check-out Procedures", "type": "page", "content": { "body": "<p>Matching security tags and authorized pickup verification standards.</p>" } },
          { "title": "Safety Certification Assessment", "type": "quiz", "content": { "questions": [ { "id": "sq1", "text": "What is the two-adult rule?", "type": "multiple_choice", "options": ["At least two background-checked adults must be present in every classroom", "Children may be left with one person if busy", "Volunteers can work solo", "None"], "correct_index": 0, "points": 10 } ] } }
        ]
      }
    ]
  }'::jsonb
),
(
  'discipleship-starter-pack',
  'New Member & Volunteer Starter Pack (Bundle)',
  'Complete launch bundle adopting Foundations of Faith, Volunteer Ministry, and Child Safety together into a sequential Learning Path.',
  'discipleship',
  'leaders',
  'en',
  'cc-by-nc-4.0',
  'ChurchCore Curriculum Council',
  true,
  '{
    "bundle_slugs": ["foundations-of-faith", "volunteer-ministry-essentials", "child-safety-safeguarding"],
    "path_title": "ChurchCore Launch & Discipleship Track",
    "path_description": "Integrated 3-part comprehensive foundation covering personal discipleship, volunteer leadership, and ministry safeguarding."
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
