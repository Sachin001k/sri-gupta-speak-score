import { useLocation, useNavigate, Link } from "react-router-dom";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { getDailyMotion, getRandomMotions, type Motion } from "@/data/motions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ALL_CRITERIA, type AssessmentCriterion, type FeedbackLengthMinutes } from "@/types/feedback";

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const motion: Motion = location.state?.motion;
  const stance: string | undefined = location.state?.stance;
  const scoreData = location.state?.results;
  const feedbackLengthMinutes: FeedbackLengthMinutes =
    location.state?.feedbackLengthMinutes === 2 ||
    location.state?.feedbackLengthMinutes === 5
      ? location.state.feedbackLengthMinutes
      : scoreData?.feedbackLengthMinutes ?? 3;
  const selectedCriteria: AssessmentCriterion[] = Array.isArray(
    location.state?.selectedCriteria,
  )
    ? location.state.selectedCriteria
    : scoreData?.selectedCriteria ?? ALL_CRITERIA;

  const [motions, setMotions] = useState(() => {
    const daily = getDailyMotion({ stanceOnly: true });
    const random = getRandomMotions(2, { stanceOnly: true });
    return [daily, ...random];
  });

  if (!motion || !scoreData) {
    navigate("/");
    return null;
  }

  const handleTryAgain = () => {
    navigate("/recording", {
      state: {
        motion,
        duration: location.state?.duration || 60,
        stance,
        feedbackLengthMinutes,
        selectedCriteria,
      },
    });
  };

  const handleNewTopic = () => {
    const daily = getDailyMotion({ stanceOnly: true });
    const random = getRandomMotions(2, { stanceOnly: true });
    setMotions([daily, ...random]);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-speech-bg p-4 py-8">
      <div className="max-w-6xl mx-auto mb-6">
        <Link to="/">
          <Button variant="ghost" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </Link>
      </div>
      <ScoreDisplay
        motion={motion}
        stance={stance}
        score={scoreData.score}
        feedback={scoreData.feedback}
        transcript={scoreData.transcript}
        missingPoints={scoreData.missingPoints}
        enhancedArgument={scoreData.enhancedArgument}
        enhancedFeedback={scoreData.enhancedFeedback}
        selectedCriteria={selectedCriteria}
        feedbackLengthMinutes={feedbackLengthMinutes}
        onTryAgain={handleTryAgain}
        onNewTopic={handleNewTopic}
      />
    </div>
  );
};

export default Results;
