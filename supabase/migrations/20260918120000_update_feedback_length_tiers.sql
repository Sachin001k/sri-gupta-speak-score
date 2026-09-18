-- Feedback length tiers changed from 5/10/15 minutes to 2/5/7 minutes.
-- Only the column DEFAULT is updated here (used when a row is inserted without
-- an explicit value) — the app always sends an explicit value today, and this
-- migration deliberately does NOT rewrite historical rows still holding the
-- old 5/10/15 values, since those reflect what was actually shown to the user
-- at the time and remapping them retroactively would be a lossy guess.
ALTER TABLE public.debate_sessions
  ALTER COLUMN feedback_length_minutes SET DEFAULT 5;
