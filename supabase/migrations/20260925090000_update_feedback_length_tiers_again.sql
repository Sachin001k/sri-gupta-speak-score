-- Feedback length tiers changed again, from 2/5/7 minutes to 2/3/5 minutes.
-- Only the column DEFAULT is updated (used when a row is inserted without an
-- explicit value) — the app always sends an explicit value, and this migration
-- does not rewrite historical rows still holding 2/5/7 (or the earlier 5/10/15).
ALTER TABLE public.debate_sessions
  ALTER COLUMN feedback_length_minutes SET DEFAULT 3;
