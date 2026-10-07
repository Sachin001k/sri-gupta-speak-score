# transcribe-audio

Transcribes a recorded speech with AssemblyAI. The browser calls this function
(`src/services/transcription.ts`), so the AssemblyAI API key never reaches the browser.

- **Request:** `POST` from a signed-in user, with the raw audio as the body (any format the browser's MediaRecorder produces). Max 15MB.
- **Response:** `{ "text": "...", "durationSeconds": 87.3 }` or `{ "error": "..." }`.
- Filler words ("um", "uh") are kept (`disfluencies: true`) so the scorer can judge fluency.

## Setup

1. Add the secret `ASSEMBLYAI_API_KEY` in Supabase Dashboard → Edge Functions → Secrets
   (or `supabase secrets set ASSEMBLYAI_API_KEY=...`).
2. Deploy: `supabase functions deploy transcribe-audio`, or paste `index.ts` into
   Dashboard → Edge Functions → `transcribe-audio` and click Deploy.
