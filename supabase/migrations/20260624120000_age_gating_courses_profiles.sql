-- Migration 20260624120000: Age gating on courses and profiles (COUNCIL-2026-016 Prompt B)
-- Adds age_min/age_max to courses (nullable — null means no restriction)
-- Adds date_of_birth to profiles (nullable — not all users provide it)

-- Age range on courses (both nullable — null means no restriction)
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS age_min SMALLINT CHECK (age_min >= 0),
  ADD COLUMN IF NOT EXISTS age_max SMALLINT CHECK (age_max >= 0);

-- Constraint: if both set, min must be <= max
ALTER TABLE public.courses
  ADD CONSTRAINT courses_age_range_valid
  CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max);

-- Date of birth on profiles (nullable — not all users provide it)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
