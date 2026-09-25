import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import type { Motion } from "@/data/motions";
import { generateMockScore } from "@/utils/mockScoring";
import { aiService } from "@/services/aiService";
import { useAuth } from "@/contexts/AuthContext";
import { saveDebateSession } from "@/services/debateSessionService";
import { buildSpeakerProfileContext } from "@/services/speakerProfile";
import {
  ALL_CRITERIA,
  type AssessmentCriterion,
  type FeedbackLengthMinutes,
} from "@/types/feedback";

const Recording = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const motion: Motion = location.state?.motion;
  const duration: number = location.state?.duration || 60;
  const stance: string | undefined = location.state?.stance;
  const feedbackLengthMinutes: FeedbackLengthMinutes =
    location.state?.feedbackLengthMinutes === 2 ||
    location.state?.feedbackLengthMinutes === 5
      ? location.state.feedbackLengthMinutes
      : 3;
  const selectedCriteria: AssessmentCriterion[] = Array.isArray(
    location.state?.selectedCriteria,
  )
    ? location.state.selectedCriteria
    : ALL_CRITERIA;

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!motion) {
    navigate("/");
    return null;
  }

  const persistAndGo = async (
    results: Awaited<ReturnType<typeof aiService.analyzeSpeeches>> | ReturnType<typeof generateMockScore>,
    cleanTranscript: string,
    audioBlob: Blob,
  ) => {
    const resultsWithTranscript = { ...results, transcript: cleanTranscript };

    if (user) {
      await saveDebateSession({
        userId: user.id,
        motion,
        stance,
        duration,
        transcript: cleanTranscript,
        results: resultsWithTranscript,
        audioBlob,
        feedbackLengthMinutes,
        selectedCriteria,
      });
    }

    navigate("/results", {
      state: {
        motion,
        stance,
        results: resultsWithTranscript,
        transcript: cleanTranscript,
        feedbackLengthMinutes,
        selectedCriteria,
      },
    });
  };

  const handleRecordingComplete = async (audioBlob: Blob, transcript?: string) => {
    const cleanTranscript =
      transcript
        ?.trim()
        .replace(/Please speak clearly\. No transcript was captured\./g, "")
        .replace(/No transcript was captured/g, "")
        .replace(/please speak clearly/gi, "")
        .trim() || "";

    if (
      cleanTranscript &&
      cleanTranscript.length > 20 &&
      !cleanTranscript.includes("Speech recorded successfully")
    ) {
      setIsAnalyzing(true);
      try {
        const speakerProfileContext = user
          ? await buildSpeakerProfileContext(user.id)
          : undefined;
        const results = await aiService.analyzeSpeeches({
          transcript: cleanTranscript,
          topic: motion.topic,
          stance,
          duration,
          feedbackLengthMinutes,
          selectedCriteria,
          speakerProfileContext,
        });
        await persistAndGo(results, cleanTranscript, audioBlob);
      } catch (error) {
        console.error("AI analysis failed:", error);
        const results = generateMockScore(
          audioBlob,
          motion.topic,
          stance,
          cleanTranscript,
          { feedbackLengthMinutes, selectedCriteria },
        );
        await persistAndGo(results, cleanTranscript, audioBlob);
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      console.warn("Transcript not captured or too short; using demo scoring if possible.");
      if (cleanTranscript.length > 0) {
        const results = generateMockScore(
          audioBlob,
          motion.topic,
          stance,
          cleanTranscript,
          { feedbackLengthMinutes, selectedCriteria },
        );
        await persistAndGo(results, cleanTranscript, audioBlob);
      }
    }
  };

  return (
    <div className="min-h-screen bg-speech-bg p-4 flex items-center justify-center">
      <VoiceRecorder
        motion={motion}
        duration={duration}
        stance={stance}
        onRecordingComplete={handleRecordingComplete}
        onBack={() => navigate("/")}
      />

      {isAnalyzing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-speech-card border-0 shadow-xl p-8 rounded-lg">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <h3 className="font-semibold text-foreground mb-2">Analyzing Your Speech</h3>
                <p className="text-sm text-muted-foreground">
                  Building personalized feedback for your selected criteria…
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recording;
