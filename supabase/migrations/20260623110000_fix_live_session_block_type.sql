-- Migration 20260623110000: Fix live_session block type is_active mismatch
-- src/types/blocks.ts has live_session as is_active: true but the original
-- seed in 20240601000002 set it to false. Align the DB with the TypeScript truth.

UPDATE public.block_types SET is_active = true WHERE id = 'live_session';
