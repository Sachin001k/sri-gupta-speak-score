/**
 * Server-side transcription via the `transcribe-audio` Supabase Edge Function,
 * which calls AssemblyAI. The AssemblyAI API key lives only in Supabase secrets.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  // Don't pass a Content-Type header: supabase-js only attaches a Blob body when it sets
  // that header itself, and silently sends an empty request otherwise.
  const { data, error } = await supabase.functions.invoke("transcribe-audio", {
    body: audioBlob,
  });

  if (error) {
    let message = error.message || "Transcription failed";
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // Keep the generic message.
      }
    }
    throw new Error(message);
  }

  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) {
    throw new Error("No transcript was returned");
  }
  return text;
}
