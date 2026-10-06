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
const POLL_TIMEOUT_MS = 120_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // 2. Request the transcript. Filler words ("um", "uh") are kept so fluency can be scored.
    const createResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_code: "en",
        punctuate: true,
        format_text: true,
        disfluencies: true,
      }),
    });
    if (!createResponse.ok) throw await assemblyError(createResponse, "transcript request");
    const { id: transcriptId } = await createResponse.json();

    // 3. Poll until done
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollResponse = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`, {
        headers: { authorization: apiKey },
      });
      if (!pollResponse.ok) throw await assemblyError(pollResponse, "status check");
      const result = await pollResponse.json();

      if (result.status === "completed") {
        const text = (result.text ?? "").trim();
        if (!text) {
          return json({ error: "No speech was detected in the recording." }, 422);
        }
        return json({ text, durationSeconds: result.audio_duration ?? null });
      }
      if (result.status === "error") {
        throw new Error(`AssemblyAI transcription failed: ${result.error ?? "unknown error"}`);
      }
    }

    return json({ error: "Transcription timed out. Please try again." }, 504);
  } catch (error) {
    console.error("Transcription error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Transcription failed." },
      502,
    );
  }
});
