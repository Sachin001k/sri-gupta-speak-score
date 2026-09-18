# Dialecta - Speak. Score. Improve.

Master the art of debate and public speaking with AI-powered feedback. Practice daily, track your progress, and become a confident speaker.

## Getting Started

Follow these steps to set up and run the project locally:

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd speak-score-elevate-mycopy

# Step 3: Install the necessary dependencies
npm install

# Step 4: Start the development server
npm run dev
```

## Technologies

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint

## Analytics (GA4)

Google Analytics 4 is installed site-wide and tracks pageviews for every React Router route change (SPA-safe).

- Default Measurement ID: `G-7TYF234V14`
- Optional override: set `VITE_GA_MEASUREMENT_ID` (e.g. in `.env.local`)
- Note: analytics events only send in production builds (`npm run build` / `npm run preview`)

## Project Structure

- `/src` - Source code
  - `/components` - React components
  - `/pages` - Page components
  - `/services` - API and service integrations
  - `/contexts` - React context providers
  - `/lib` - Utility libraries
- `/supabase` - Supabase configuration and migrations

## Status: Done vs. To-Do

_Based on a review of the current codebase (Sep 2026). This is a living section — update it as work lands or priorities change._

### ✅ Done

- **Auth**: Supabase email/password login, forgot-password flow. Signup page exists (`src/pages/Signup.tsx`) but is not wired into a route — accounts are currently created by an admin.
- **Debate practice flow**: pick a topic/theme, choose stance/duration/feedback length/criteria, record via `MediaRecorder`, live transcription (Web Speech API) with AssemblyAI REST fallback.
- **AI scoring**: Gemini-based analysis (logic/rhetoric/empathy/delivery), with multi-key rotation, truncated-response repair, and a mock-score fallback if the AI call fails.
- **Results view**: scorecard, tabbed breakdown (transcript, missing points, enhanced argument, analysis, counterarguments, defense strategies), share button.
- **Progress & gamification**: points, levels, streaks, achievement badges, per-criterion "speaker profile," and a "Past Debates Vault" to reopen old sessions.
- **Profile page**: view/edit display name.
- **Admin panel**: role-gated (`profiles.role = 'admin'`) topic CRUD + featured/theme management.
- **Newsletter**: subscribe widget (topics + email, saved to Supabase), admin composer with AI-drafted content (pulls real RSS via `fetch-news-context` edge function) and bulk send via Gmail SMTP (`send-newsletter` edge function).
- **Analytics**: GA4 wired for SPA route changes (prod only).
- **Database**: full RLS-protected schema for profiles, sessions, progress, badges, topics, newsletter subscriptions, plus storage policies for recorded audio.

### 🚧 To-Do / Known Gaps

- **Rotate/secure the hardcoded AssemblyAI API key** in `src/services/assemblyAITranscription.ts` — move to an env var, don't ship real keys in source.
- **Clean up dead/duplicate code**:
  - `src/lib/supabase.ts` — unused mock client (the real one is `src/integrations/supabase/client.ts`).
  - `src/components/ProgressTracker.tsx` — superseded by logic now inlined in `Progress.tsx`.
  - `src/components/NewsletterSection.tsx` — older marketing section with a simulated (fake) subscribe call; superseded by `NewsletterSubscribeBlock.tsx`.
  - `src/pages/Home.tsx` — legacy duplicate of `Index.tsx`, only reachable at `/old`.
  - `src/services/simpleTranscription.ts`, `whisperTranscription.ts`, `speechToText.ts` — alternate transcription paths not currently used by `VoiceRecorder`.
  - `supabase/functions/transcribe-audio` — Hugging Face Whisper edge function not called from the frontend.
- **No automated tests** — no unit/integration/e2e test setup exists yet.
- **Admin topic RLS is fully open** (`topics` and `newsletter_subscriptions` policies allow anyone to read/write) — should be tightened to admin-only writes now that a `role` column exists.
- **No pagination** on the admin subscriber table or the "Past Debates Vault" — will need it once data volume grows.
- **Manual Gemini API key modal** (`ApiKeyModal.tsx`) is mostly redundant now that env-based key rotation exists — decide whether to keep or remove.

### 📋 From user/pilot feedback (Sep 2026 review)

**✅ Already addressed:**
- Homepage tagline/positioning — "Your go-to preparation for intellectual interviews and dialogue portfolios" + supporting paragraph is live.
- Homepage "How It Works" 5-step flowchart (Choose a topic → Record → AI analyse → Generate feedback → Track progress) + 3-card testimonials section.
- Extended speech timing options — 60s / 90s / 2 min / 3 min all exist in `MotionCard.tsx`.
- For/Against/Neutral stance picker is offered on every topic card, not just "stance"-type topics.
- AI prompt already instructs Gemini to avoid unsourced statistics/facts and stick to logical reasoning (the Schoolhouse FOR/AGAINST/NEUTRAL coaching prompt is fully implemented in `aiService.ts`).
- **"Duolingo for Public Speaking" copy removed** — hero pill on `Index.tsx` + `Home.tsx` now reads "Public speaking practice, gamified."
- **Sign up flow wired up** — `Signup.tsx` is routed at `/signup`, and Login now links to it ("Don't have an account? Sign up") instead of "contact support."
- **Streak indicator added to the home page** (`Index.tsx` only, not the legacy `/old` page) — 🔥 badge below the topic grid, reading the existing `user_progress.current_streak`.
- **5-minute AI feedback tier shortened** — found and fixed the real cause: `buildAnalysisPrompt()` had *later* instructions ("counter_arguments MUST have exactly 3 items," "enhanced_argument MUST be 200+ words") that unconditionally overrode the tier-based brevity guidance earlier in the same prompt. All of those are now tier-aware (5-min tier returns `""`/`[]` for sections its UI never shows), plus a client-side character cap on synopsis/points in `applyPersonalizationFilters()` as a backstop. Along the way, also fixed several spots that told the model to fabricate "specific statistics, dates, and sources" for counterarguments — which contradicted the "no unsourced facts" rule elsewhere in the same prompt.

**🚧 Still to do:**
- **Fully deduplicate the Gemini system prompt** in `aiService.ts` — `buildAnalysisPrompt()` (~950 lines) still concatenates two large, overlapping "logic coach" philosophy sections back-to-back. The contradictions that caused bugs are fixed, but the prose itself is still redundant and costs extra tokens; merging it into one clean prompt is a follow-up task best done with real test transcripts to compare output before/after.
- **Add the streak indicator to `Home.tsx` too**, or (better) finish removing `Home.tsx` per the dead-code cleanup item above, so there's only one homepage to keep in sync.
