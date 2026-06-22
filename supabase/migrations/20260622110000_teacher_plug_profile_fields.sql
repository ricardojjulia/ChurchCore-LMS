-- Migration 20260622110000: Teacher Plug profile fields (COUNCIL-2026-007)
-- Adds bio, specialty[], and website_url to profiles for the Teacher Plug block type

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio         TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS specialty   TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website_url TEXT;
