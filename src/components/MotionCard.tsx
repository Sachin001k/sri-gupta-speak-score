import { Clock, Mic, LogIn, BookOpen } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import {
  ALL_CRITERIA,
  CRITERION_LABELS,
  type AssessmentCriterion,
  type FeedbackLengthMinutes,
} from "@/types/feedback";

interface Motion {
  id: string;
  topic: string;
  category: string;
  description?: string;
  type: "opinion" | "stance";
}

export type SpeechStartOptions = {
  feedbackLengthMinutes: FeedbackLengthMinutes;
  selectedCriteria: AssessmentCriterion[];
};

interface MotionCardProps {
  motion: Motion;
  onStartSpeech: (
    motion: Motion,
    duration: number,
    stance: string | undefined,
    options: SpeechStartOptions,
  ) => void;
  isLoggedIn?: boolean;
}

export function MotionCard({ motion, onStartSpeech, isLoggedIn = false }: MotionCardProps) {
  const [selectedStance, setSelectedStance] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [feedbackLength, setFeedbackLength] = useState<FeedbackLengthMinutes>(3);
  const [selectedCriteria, setSelectedCriteria] = useState<Set<AssessmentCriterion>>(
    () => new Set(ALL_CRITERIA),
  );

  useEffect(() => {
    setSelectedStance("");
  }, [motion.id]);

  const getCategoryColor = (category: string) => {
    const colors = {
      Politics: "bg-destructive",
      Ethics: "bg-success",
      Education: "bg-primary",
      Technology: "bg-accent",
      Abstract: "bg-speech-accent",
      "Pop Culture": "bg-warning",
    };
    return colors[category as keyof typeof colors] || "bg-muted";
  };

  const toggleCriterion = (id: AssessmentCriterion) => {
    setSelectedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canStart = Boolean(selectedStance) && selectedCriteria.size > 0;

  const handleStart = () => {
    if (!isLoggedIn || !canStart) return;
    onStartSpeech(motion, selectedDuration, selectedStance, {
      feedbackLengthMinutes: feedbackLength,
      selectedCriteria: Array.from(selectedCriteria),
    });
  };

  if (!motion || !motion.id) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-speech hover:shadow-glow transition-all duration-300 hover:scale-105">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between mb-2">
          <Badge className={`${getCategoryColor(motion.category)} text-white border-0`}>
            {motion.category}
          </Badge>
          <Badge variant="outline" className="text-xs">
            For/Against/Neutral
          </Badge>
        </div>
        <CardTitle className="text-lg font-bold leading-tight text-foreground">
          {motion.topic}
        </CardTitle>
        {motion.description && (
          <p className="text-sm text-muted-foreground mt-2">{motion.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground block">Choose your stance:</label>
          <div className="grid grid-cols-3 gap-2">
            {(["for", "against", "neutral"] as const).map((stance) => (
              <Button
                key={stance}
                variant={selectedStance === stance ? "default" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedStance(stance);
                }}
                className="h-8 capitalize"
                type="button"
              >
                {stance}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Speech duration:</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { value: 30, label: "30s" },
              { value: 60, label: "60s" },
              { value: 90, label: "90s" },
              { value: 120, label: "120s" },
            ].map(({ value, label }) => (
              <Button
                key={value}
                variant={selectedDuration === value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDuration(value)}
                className="h-8"
              >
                <Clock className="w-3 h-3 mr-1" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Length of feedback
          </label>
          <p className="text-xs text-muted-foreground">
            How long do you want to spend reading feedback after your speech?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([2, 3, 5] as FeedbackLengthMinutes[]).map((mins) => (
              <Button
                key={mins}
                variant={feedbackLength === mins ? "default" : "outline"}
                size="sm"
                onClick={() => setFeedbackLength(mins)}
                className="h-8"
                type="button"
              >
                {mins} min
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Assess criteria:</label>
          <p className="text-xs text-muted-foreground">
            Pick what to focus on today. Deeper detail on fewer criteria beats shallow coverage of everything.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_CRITERIA.map((id) => {
              const active = selectedCriteria.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCriterion(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {CRITERION_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>

        {isLoggedIn ? (
          <Button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full bg-gradient-primary hover:opacity-90 transition-opacity border-0 text-white font-semibold py-3 h-12"
          >
            <Mic className="w-4 h-4 mr-2" />
            Start Speaking
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!canStart}
                className="w-full bg-gradient-primary hover:opacity-90 transition-opacity border-0 text-white font-semibold py-3 h-12"
              >
                <Mic className="w-4 h-4 mr-2" />
                Start Speaking
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Login Required</AlertDialogTitle>
                <AlertDialogDescription>
                  Please login first to start practicing. You need to be logged in to save your
                  progress and track your achievements.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Link to="/login" className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Go to Login
                  </Link>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
