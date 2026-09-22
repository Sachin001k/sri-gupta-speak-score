import { useEffect, useMemo, useState } from "react";
import { Mic, Target, Trophy, Zap, Heart, Sparkles, Loader2, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MotionCard, type SpeechStartOptions } from "@/components/MotionCard";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { NewsletterSubscribeBlock } from "@/components/NewsletterSubscribeBlock";
import { motions as allMotionsData, type Motion } from "@/data/motions";
import { aiService } from "@/services/aiService";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_CRITERIA,
  type AssessmentCriterion,
  type FeedbackLengthMinutes,
} from "@/types/feedback";
import { saveDebateSession } from "@/services/debateSessionService";
import { buildSpeakerProfileContext } from "@/services/speakerProfile";
import { generateMockScore } from "@/utils/mockScoring";
import { toast } from "@/hooks/use-toast";
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

type AppState = "home" | "recording" | "results";

interface SessionData {
  motion: Motion;
  duration: number;
  stance?: string;
  audioBlob?: Blob;
  feedbackLengthMinutes: FeedbackLengthMinutes;
  selectedCriteria: AssessmentCriterion[];
}

type TopicMotion = Motion & { isFeatured?: boolean };

const pickRandom = (list: TopicMotion[], count: number, excludeIds: string[] = []) => {
  const pool = list.filter((m) => !excludeIds.includes(m.id));
  const picks: TopicMotion[] = [];
  const used = new Set<string>();
  while (picks.length < count && pool.length > 0 && used.size < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const candidate = pool[idx];
    if (!used.has(candidate.id)) {
      used.add(candidate.id);
      picks.push(candidate);
    }
  }
  return picks;
};

const pickDailyMotion = (list: TopicMotion[]) => {
  const featured = list.filter((m) => m.isFeatured);
  if (featured.length > 0) return featured[0];
  if (list.length === 0) return allMotionsData[0] as TopicMotion;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let hash = 0;
  for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
};

const Index = () => {
  const { user, signOut } = useAuth();
  const [currentState, setCurrentState] = useState<AppState>("home");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [scoreData, setScoreData] = useState<any>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recorderResetCounter, setRecorderResetCounter] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<string>("All Themes");
  const [allTopics, setAllTopics] = useState<TopicMotion[]>(allMotionsData);
  const [motions, setMotions] = useState<TopicMotion[]>(() => {
    const daily = pickDailyMotion(allMotionsData);
    const random = pickRandom(allMotionsData, 2, [daily.id]);
    return [daily, ...random];
  });
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    const loadStreak = async () => {
      if (!user) {
        setStreak(null);
        return;
      }
      const { data, error } = await supabase
        .from("user_progress")
        .select("current_streak")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return;
      setStreak((data as any)?.current_streak ?? 0);
    };
    loadStreak();
  }, [user]);

  useEffect(() => {
    const loadTopics = async () => {
      const { data, error } = await supabase.from("topics").select("*");
      if (error || !data || data.length === 0) return;

      const mapped: TopicMotion[] = data.map((row: any) => ({
        id: row.id,
        topic: row.topic,
        category: row.theme,
        description: row.description ?? undefined,
        type: (row.type === "opinion" ? "opinion" : "stance") as "opinion" | "stance",
        isFeatured: !!row.is_featured,
      }));

      setAllTopics(mapped);
      const daily = pickDailyMotion(mapped);
      const random = pickRandom(mapped, 2, [daily.id]);
      setMotions([daily, ...random]);
    };

    loadTopics();
  }, []);

  // Extract unique themes from ALL motions data and sort alphabetically
  const themeOptions = useMemo(() => {
    const allThemes = Array.from(new Set(allTopics.map((motion) => motion.category))).sort();
    return ["All Themes", ...allThemes];
  }, [allTopics]);

  // Filter motions based on selected theme
  const filteredMotions = selectedTheme === "All Themes" 
    ? motions 
    : allTopics.filter(motion => motion.category === selectedTheme);
  
  // Get daily motion for theme-specific filtering
  const dailyMotion = motions[0];

  const resetSessionForRetry = () => {
    setSessionData((prev) => {
      if (!prev) return prev;
      return {
        motion: prev.motion,
        duration: prev.duration,
        stance: prev.stance,
        feedbackLengthMinutes: prev.feedbackLengthMinutes,
        selectedCriteria: prev.selectedCriteria,
      };
    });
  };

  const resetRecorderComponent = () => setRecorderResetCounter((prev) => prev + 1);

  const handleStartSpeech = (
    motion: Motion,
    duration: number,
    stance: string | undefined,
    options: SpeechStartOptions,
  ) => {
    setSessionData({
      motion,
      duration,
      stance,
      feedbackLengthMinutes: options.feedbackLengthMinutes,
      selectedCriteria: options.selectedCriteria?.length
        ? options.selectedCriteria
        : ALL_CRITERIA,
    });
    setCurrentState("recording");
  };

  const handleRecordingComplete = async (audioBlob: Blob, transcript?: string) => {
    if (!sessionData) return;

    setSessionData({ ...sessionData, audioBlob });

    const finishSession = async (results: any, cleanTranscript: string) => {
      setScoreData(results);
      setCurrentState("results");

      if (user) {
        await saveDebateSession({
          userId: user.id,
          motion: sessionData.motion,
          stance: sessionData.stance,
          duration: sessionData.duration,
          transcript: cleanTranscript,
          results,
          audioBlob,
          feedbackLengthMinutes: sessionData.feedbackLengthMinutes,
          selectedCriteria: sessionData.selectedCriteria,
        });
      }
    };

    if (transcript && transcript.trim().length > 20) {
      setIsAnalyzing(true);
      try {
        const speakerProfileContext = user
          ? await buildSpeakerProfileContext(user.id)
          : undefined;
        const results = await aiService.analyzeSpeeches({
          transcript,
          topic: sessionData.motion.topic,
          stance: sessionData.stance,
          duration: sessionData.duration,
          feedbackLengthMinutes: sessionData.feedbackLengthMinutes,
          selectedCriteria: sessionData.selectedCriteria,
          speakerProfileContext,
        });
        await finishSession(results, transcript);
      } catch (error) {
        // Never discard a completed recording just because AI scoring failed —
        // fall back to a preliminary mock score (same as the /recording page
        // already does) and tell the user what happened, instead of silently
        // bouncing them back to "Start Recording" with their speech gone.
        console.error("AI analysis failed:", error);
        toast({
          title: "AI scoring unavailable",
          description:
            "We couldn't reach the AI scorer, so here's a preliminary score instead. Your recording wasn't lost.",
          variant: "destructive",
        });
        const results = generateMockScore(
          audioBlob,
          sessionData.motion.topic,
          sessionData.stance,
          transcript,
          {
            feedbackLengthMinutes: sessionData.feedbackLengthMinutes,
            selectedCriteria: sessionData.selectedCriteria,
          },
        );
        await finishSession(results, transcript);
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      console.warn("No valid transcript for AI analysis. Transcript:", transcript);
      toast({
        title: "No speech detected",
        description: "We couldn't capture a transcript of your speech. Please try recording again.",
        variant: "destructive",
      });
      setScoreData(null);
      setCurrentState("recording");
      resetSessionForRetry();
      resetRecorderComponent();
    }
  };

  const handleApiKeySet = (apiKey: string) => {
    aiService.setApiKey(apiKey);
    
    // Continue with AI analysis if we have a pending recording
    if (sessionData?.audioBlob) {
      handleRecordingComplete(sessionData.audioBlob, "Transcript would be generated here");
    }
  };

  const handleTryAgain = () => {
    setScoreData(null);
    resetSessionForRetry();
    setCurrentState("recording");
  };

  const handleNewTopic = () => {
    const daily = pickDailyMotion(allTopics);
    const random = pickRandom(allTopics, 2, [daily.id]);
    setMotions([daily, ...random]);
    setCurrentState("home");
    setSessionData(null);
    setScoreData(null);
  };

  const handleBackToHome = () => {
    setCurrentState("home");
    setSessionData(null);
    setScoreData(null);
  };

  if (currentState === "recording" && sessionData) {
    return (
      <div className="min-h-screen bg-speech-bg p-4 flex flex-col items-center">
        <div className="w-full max-w-5xl flex-1 flex flex-col items-center">
          <div className="flex-1 flex items-center justify-center w-full">
            <VoiceRecorder
              key={recorderResetCounter}
              motion={sessionData.motion}
              duration={sessionData.duration}
              stance={sessionData.stance}
              onRecordingComplete={handleRecordingComplete}
              onBack={handleBackToHome}
            />
          </div>
        </div>
      </div>
    );
  }

  if (currentState === "results" && sessionData && scoreData) {
    return (
      <div className="min-h-screen bg-speech-bg p-4 py-8">
        <ScoreDisplay
          motion={sessionData.motion}
          stance={sessionData.stance}
          score={scoreData.score}
          feedback={scoreData.feedback}
          transcript={scoreData.transcript}
          missingPoints={scoreData.missingPoints}
          enhancedArgument={scoreData.enhancedArgument}
          enhancedFeedback={scoreData.enhancedFeedback}
          selectedCriteria={sessionData.selectedCriteria}
          feedbackLengthMinutes={sessionData.feedbackLengthMinutes}
          onTryAgain={handleTryAgain}
          onNewTopic={handleNewTopic}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-speech-bg">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 bg-black/20"></div>
        
        {/* User Menu */}
        <div className="absolute top-6 right-6 z-10">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-white/80 text-sm">Welcome, {user.email}</span>
              <Link to="/progress">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2"
                >
                  <Trophy className="w-4 h-4" />
                  Progress
                </Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign Out</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to sign out? You'll need to sign in again to access your progress and continue practicing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={signOut}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Link to="/login">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Sign In
              </Button>
            </Link>
          )}
        </div>
        
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Public speaking practice, gamified</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Dialecta
          </h1>
          
          <p className="text-xl md:text-2xl mb-4 opacity-90">
            Your go-to preparation for intellectual interviews and dialogue portfolios
          </p>
          
          <p className="text-lg mb-8 opacity-80 max-w-2xl mx-auto">
            Master the art of debate and public speaking with AI-powered feedback - perfect for Schoolhouse dialogues and intellectual interviews. Practice daily, track your progress, and become a confident, quick-thinking speaker.
          </p>

          <NewsletterSubscribeBlock />
          
          {/* 5-Step Process Flowchart */}
          <div className="max-w-4xl mx-auto mb-12 mt-12">
            <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">1</div>
                <Target className="w-8 h-8 mb-2 text-white" />
                <span className="text-sm font-medium text-center">Choose a topic</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">2</div>
                <Mic className="w-8 h-8 mb-2 text-white" />
                <span className="text-sm font-medium text-center">Record your argument</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">3</div>
                <Sparkles className="w-8 h-8 mb-2 text-white" />
                <span className="text-sm font-medium text-center">Let AI analyse your Point of view</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">4</div>
                <Zap className="w-8 h-8 mb-2 text-white" />
                <span className="text-sm font-medium text-center">Generate detailed feedback</span>
              </div>
              <div className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">5</div>
                <Trophy className="w-8 h-8 mb-2 text-white" />
                <span className="text-sm font-medium text-center">Track your progress and improve your skills</span>
              </div>
            </div>
          </div>

          {/* Testimonials Section */}
          <div className="max-w-4xl mx-auto mt-16 mb-8">
            <h2 className="text-2xl font-bold mb-8 text-center">What Students Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400">★</span>
                  ))}
                </div>
                <p className="text-sm mb-3 italic">"Dialecta helped me prepare for my Schoolhouse interview. The AI feedback on logical structure was incredibly detailed and actionable."</p>
                <p className="text-xs opacity-80">- Student preparing for intellectual interviews</p>
              </div>
              <div className="p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400">★</span>
                  ))}
                </div>
                <p className="text-sm mb-3 italic">"The practice sessions improved my ability to think on my feet and articulate complex ideas clearly. Perfect for dialogue portfolios!"</p>
                <p className="text-xs opacity-80">- Student building dialogue portfolio</p>
              </div>
              <div className="p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400">★</span>
                  ))}
                </div>
                <p className="text-sm mb-3 italic">"I love how the feedback focuses on logical reasoning rather than just facts. It's made me a much stronger debater."</p>
                <p className="text-xs opacity-80">- Competitive debater</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Choose Your Challenge
          </h2>
          <p className="text-lg text-muted-foreground">
            Pick a topic and start speaking. Get scored on Logic, Rhetoric, Empathy, and Delivery.
          </p>
        </div>

        {/* Theme Filter */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <label htmlFor="theme-filter" className="text-lg font-medium text-foreground">
              Filter by Theme:
            </label>
            <Select value={selectedTheme} onValueChange={setSelectedTheme}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((theme) => (
                  <SelectItem key={theme} value={theme}>
                    {theme}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTheme !== "All Themes" && (
              <span className="text-sm text-muted-foreground">
                ({filteredMotions.length} topic{filteredMotions.length !== 1 ? 's' : ''} found)
              </span>
            )}
          </div>
        </div>

        {/* Daily Motion Highlight */}
        {(selectedTheme === "All Themes" || dailyMotion.category === selectedTheme) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 bg-gradient-primary rounded-full animate-pulse"></div>
              <h3 className="text-xl font-semibold text-foreground">Today's Featured Topic</h3>
            </div>
            <MotionCard 
              motion={dailyMotion} 
              onStartSpeech={handleStartSpeech}
              isLoggedIn={!!user}
            />
          </div>
        )}

        {/* More Topics */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-foreground mb-4">
            {selectedTheme === "All Themes" ? "More Topics" : `${selectedTheme} Topics`}
          </h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            {(selectedTheme === "All Themes" 
              ? motions.slice(1) 
              : filteredMotions.filter(motion => motion.id !== dailyMotion.id)
            ).map((motion) => (
              <MotionCard 
                key={motion.id} 
                motion={motion} 
                onStartSpeech={handleStartSpeech}
                isLoggedIn={!!user}
              />
            ))}
          </div>
        </div>

        {/* Streak */}
        {user && streak !== null && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-3 bg-speech-card border border-border rounded-full px-5 py-3 shadow-card">
              <span className="text-2xl" role="img" aria-label="fire">
                🔥
              </span>
              {streak > 0 ? (
                <span className="text-lg font-semibold text-foreground">
                  {streak} day streak — keep it going!
                </span>
              ) : (
                <span className="text-lg font-semibold text-foreground">
                  Start your streak today
                </span>
              )}
            </div>
          </div>
        )}

        {/* Refresh Topics */}
        <div className="text-center">
          <Button
            onClick={() => {
              const daily = pickDailyMotion(allTopics);
              const random = pickRandom(allTopics, 2, [daily.id]);
              setMotions([daily, ...random]);
              setSelectedTheme("All Themes");
            }}
            variant="outline"
            className="font-medium"
          >
            🎲 Get New Topics
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-3 mt-16">
          <Card className="bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Mic className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Quick Practice</h3>
              <p className="text-sm text-muted-foreground">
                60s, 90s, 2-3 minute speeches with instant feedback. Perfect for daily practice.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Target className="w-6 h-6 text-success" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI Scoring</h3>
              <p className="text-sm text-muted-foreground">
                Get detailed feedback on logic, rhetoric, empathy, and delivery.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-card">
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 bg-speech-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-6 h-6 text-speech-accent" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Track Progress</h3>
              <p className="text-sm text-muted-foreground">
                Watch your scores improve over time and earn achievement badges.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onApiKeySet={handleApiKeySet}
        onClose={() => setShowApiKeyModal(false)}
      />

      {/* Loading Overlay for AI Analysis */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="bg-speech-card border-0 shadow-xl p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <h3 className="font-semibold text-foreground mb-2">Analyzing Your Speech</h3>
                <p className="text-sm text-muted-foreground">AI is evaluating your logic, rhetoric, empathy, and delivery...</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Index;
