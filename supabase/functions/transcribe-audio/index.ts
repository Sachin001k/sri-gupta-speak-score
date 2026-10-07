import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

// Speeches are at most 2 minutes; a compressed recording of that length is ~1-2MB.
// Cap uploads so a misbehaving client can't run up the AssemblyAI bill.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Debates are in English, but the default model (Universal-3.5 Pro) code-switches and can
// write Indian-accented English in Devanagari ("लेट्स सी व्हाट वी कैन डू"). The prompt steers
// it to English; if Devanagari still comes back, retry once with the English-only model.
const ENGLISH_PROMPT =
  "This is a student's English debate speech, often spoken with an Indian accent. " +
  "Transcribe everything in English using the Latin alphabet. Never use Devanagari or any " +
  "other script, and never translate or transliterate. Keep filler words such as um and uh.";
const DEVANAGARI = /[\u0900-\u097F]/;

type TranscriptResult = { text: string; durationSeconds: number | null; model: string | null };

// The anon key also passes the gateway's JWT check, so confirm there's a real signed-in user.
async function isSignedIn(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization");
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!authorization || !apikey || !supabaseUrl) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey },
  });
  if (!response.ok) return false;
  const user = await response.json();
  return typeof user?.id === "string";
}

async function assemblyError(response: Response, step: string): Promise<Error> {
  let detail = `${response.status}`;
  try {
    const body = await response.json();
    if (body?.error) detail += ` - ${body.error}`;
  } catch {
    // Non-JSON error body; status code is enough.
  }
  return new Error(`AssemblyAI ${step} failed: ${detail}`);
}

// Requests a transcript and polls until it's done. Returns null on timeout.
async function transcribe(
  apiKey: string,
  audioUrl: string,
  options: Record<string, unknown>,
): Promise<TranscriptResult | null> {
  // Filler words ("um", "uh") are kept so fluency can be scored.
  const createResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      punctuate: true,
      format_text: true,
      disfluencies: true,
      ...options,
    }),
  });
  if (!createResponse.ok) throw await assemblyError(createResponse, "transcript request");
  const { id: transcriptId } = await createResponse.json();

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
      headers: { authorization: apiKey },
    });
    if (!pollResponse.ok) throw await assemblyError(pollResponse, "status check");
    const result = await pollResponse.json();

    if (result.status === "completed") {
      return {
        text: (result.text ?? "").trim(),
        durationSeconds: result.audio_duration ?? null,
        model: result.speech_model_used ?? result.speech_model ?? null,
      };
    }
    if (result.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${result.error ?? "unknown error"}`);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!apiKey) {
    console.error("ASSEMBLYAI_API_KEY secret is not set");
    return json({ error: "Transcription is not configured on the server." }, 500);
  }

  if (!(await isSignedIn(req))) {
    return json({ error: "Please log in to transcribe your speech." }, 401);
  }

  try {
    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.byteLength === 0) {
      return json({ error: "No audio received." }, 400);
    }
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return json({ error: "Audio file is too large." }, 413);
    }

    // 1. Upload the raw audio
    const uploadResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/octet-stream" },
      body: audio,
    });
    if (!uploadResponse.ok) throw await assemblyError(uploadResponse, "upload");
    const { upload_url: audioUrl } = await uploadResponse.json();

    let result = await transcribe(apiKey, audioUrl, {
      speech_models: ["universal-3-5-pro", "universal-2"],
      language_code: "en",
      prompt: ENGLISH_PROMPT,
    });
    if (result && DEVANAGARI.test(result.text)) {
      console.warn(`Devanagari output from ${result.model}; retrying with universal-2`);
      result = await transcribe(apiKey, audioUrl, {
        speech_models: ["universal-2"],
        language_code: "en",
      });
    }

    if (!result) {
      return json({ error: "Transcription timed out. Please try again." }, 504);
    }
    if (!result.text) {
      return json({ error: "No speech was detected in the recording." }, 422);
    }
    console.log(`Transcribed ${result.durationSeconds}s of audio with ${result.model}`);
    return json({ text: result.text, durationSeconds: result.durationSeconds });
  } catch (error) {
    console.error("Transcription error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Transcription failed." },
      502,
    );
  }
});
