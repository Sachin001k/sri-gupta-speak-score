import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Forwards generateContent requests to Gemini so the API keys stay server-side.
// Keys live in the GEMINI_API_KEYS secret (comma-separated); only logged-in users are served.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
const MAX_BODY_BYTES = 512 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed. Use POST." } }, 405);
  }

  const keys = (Deno.env.get("GEMINI_API_KEYS") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    console.error("GEMINI_API_KEYS secret is not set");
    return json({ error: { message: "AI scoring is not configured on the server." } }, 500);
  }

  if (!(await isSignedIn(req))) {
    return json({ error: { message: "Please log in to get AI feedback." } }, 401);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: { message: "Request is too large." } }, 413);
  }

  let body: { contents?: unknown; generationConfig?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: { message: "Invalid JSON body." } }, 400);
  }
  if (!Array.isArray(body.contents)) {
    return json({ error: { message: "Missing contents." } }, 400);
  }
  // Only forward the fields the app uses, so the proxy can't be used for anything else.
  const payload = JSON.stringify({ contents: body.contents, generationConfig: body.generationConfig });

  // Start at a random key to spread load; move to the next key on 400 (bad/expired key) or 429.
  const start = Math.floor(Math.random() * keys.length);
  let last: Response | null = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: payload,
    });
    if ((response.status === 400 || response.status === 429) && i < keys.length - 1) {
      console.warn(`Gemini returned ${response.status}; trying the next key`);
      await response.body?.cancel();
      continue;
    }
    last = response;
    break;
  }

  return new Response(last!.body, {
    status: last!.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
