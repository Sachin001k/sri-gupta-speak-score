import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trophy, Calendar, Star, Target, Zap, TrendingUp, Award, Crown, ArrowLeft, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Navigate, Link } from 'react-router-dom';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import {
  loadSpeakerProfile,
  type SpeakerProfileSummary,
} from '@/services/speakerProfile';
import {
  ALL_CRITERIA,
  CRITERION_LABELS,
  type AssessmentCriterion,
  type FeedbackLengthMinutes,
} from '@/types/feedback';

interface UserProgress {
  total_points: number;
  current_level: number;
  current_streak: number;
  longest_streak: number;
  total_time_spent: number;
}

interface Badge {
  badge_id: string;
  badge_name: string;
  badge_description: string;
  icon_name: string;
  badge_tier: string;
  points_value: number;
  earned_at?: string;
}

interface SessionStats {
  total_sessions: number;
  average_score: number;
  perfect_scores: number;
}

interface Session {
  id: string;
  motion_topic: string;
  stance: string | null;
  overall_score: number | null;
  duration: number;
  transcript: string | null;
  feedback: any;
  score_logic: number | null;
  score_rhetoric: number | null;
  score_empathy: number | null;
  score_delivery: number | null;
  created_at: string;
  audio_url?: string | null;
  feedback_length_minutes?: number | null;
  selected_criteria?: string[] | null;
}

const ICON_MAP = {
  Trophy, Calendar, Star, Target, Zap, TrendingUp, Award, Crown,
  BookOpen: Trophy, GraduationCap: Award, Brain: Star, ThumbsUp: Target,
  Medal: Trophy, Gem: Crown, Rocket: Zap, Bolt: Zap, MessageSquare: TrendingUp,
  Eye: Target, CalendarDays: Calendar
};

const TIER_COLORS = {
  bronze: 'from-orange-500 to-orange-600',
  silver: 'from-gray-400 to-gray-500',
  gold: 'from-yellow-400 to-yellow-500',
  platinum: 'from-purple-400 to-purple-500',
  diamond: 'from-blue-400 to-blue-500'
};

const Progress = () => {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<Badge[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [speakerProfile, setSpeakerProfile] = useState<SpeakerProfileSummary | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  useEffect(() => {
    if (user && !loading) {
      fetchProgressData();
    }
  }, [user, loading]);

  const fetchProgressData = async () => {
    try {
      setIsLoading(true);

      // Fetch user progress
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (progressError && progressError.code !== 'PGRST116') {
        throw progressError;
      }

      // Initialize progress if doesn't exist
      if (!progressData) {
        const { data: newProgress, error: insertError } = await supabase
          .from('user_progress')
          .insert({ user_id: user!.id })
          .select()
          .single();

        if (insertError) throw insertError;
        setUserProgress(newProgress);
      } else {
        setUserProgress(progressData);
      }

      // Fetch all badges
      const { data: badgesData, error: badgesError } = await supabase
        .from('achievement_badges')
        .select('*')
        .order('points_value', { ascending: true });

      if (badgesError) throw badgesError;
      setAllBadges(badgesData || []);

      // Fetch earned badges
      const { data: earnedData, error: earnedError } = await supabase
        .from('user_achievement_badges')
        .select(`
          *,
          achievement_badges (*)
        `)
        .eq('user_id', user!.id);

      if (earnedError) throw earnedError;
      setEarnedBadges(earnedData?.map(item => ({
        ...item.achievement_badges,
        earned_at: item.earned_at
      })) || []);

      const withExtras = await supabase
        .from("debate_sessions")
        .select(
          "id, motion_topic, stance, overall_score, duration, transcript, feedback, score_logic, score_rhetoric, score_empathy, score_delivery, created_at, audio_url, feedback_length_minutes, selected_criteria",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      let sessionsData = withExtras.data as Session[] | null;
      if (withExtras.error) {
        const fallback = await supabase
          .from("debate_sessions")
          .select(
            "id, motion_topic, stance, overall_score, duration, transcript, feedback, score_logic, score_rhetoric, score_empathy, score_delivery, created_at",
          )
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        sessionsData = fallback.data as Session[];
      }

      if (sessionsData) {
        setSessions(sessionsData);

        const validSessions = sessionsData.filter((s) => s.overall_score !== null);
        const totalSessions = validSessions.length;
        const averageScore =
          totalSessions > 0
            ? Math.round(
                validSessions.reduce((sum, s) => sum + (s.overall_score || 0), 0) /
                  totalSessions,
              )
            : 0;
        const perfectScores = validSessions.filter(
          (s) => (s.overall_score || 0) >= 27,
        ).length;

        setSessionStats({
          total_sessions: totalSessions,
          average_score: averageScore,
          perfect_scores: perfectScores,
        });

        await updateProgressFromSessions(validSessions, false);
      }

      const profile = await loadSpeakerProfile(user!.id);
      setSpeakerProfile(profile);

    } catch (error) {
      console.error('Error fetching progress data:', error);
      toast({
        title: "Error",
        description: "Failed to load progress data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateProgressFromSessions = async (sessions: any[], shouldRefresh: boolean = false) => {
    if (sessions.length === 0 || !user) return;

    const totalTimeSpent = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalPoints = sessions.length * 10; // Base points per session
    
    // Calculate streak
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // Get last activity date from progress
    const { data: currentProgress } = await supabase
      .from('user_progress')
      .select('last_activity_date, current_streak, longest_streak')
      .eq('user_id', user.id)
      .single();

    let newStreak = currentProgress?.current_streak || 0;
    let longestStreak = currentProgress?.longest_streak || 0;
    const lastActivity = currentProgress?.last_activity_date;

    // Update streak logic
    if (lastActivity === yesterday) {
      // Continue streak
      newStreak = (newStreak || 0) + 1;
    } else if (lastActivity === today) {
      // Already updated today, keep current streak
      newStreak = newStreak || 0;
    } else if (lastActivity && lastActivity < yesterday) {
      // Streak broken, reset to 1
      newStreak = 1;
    } else {
      // First activity, start streak
      newStreak = 1;
    }

    // Update longest streak if needed
    if (newStreak > longestStreak) {
      longestStreak = newStreak;
    }

    const { data: updatedProgress, error } = await supabase
      .from('user_progress')
      .update({
        total_time_spent: totalTimeSpent,
        total_points: totalPoints,
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_activity_date: today,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating progress:', error);
    } else if (updatedProgress) {
      // Update local state directly instead of calling fetchProgressData to avoid infinite loop
      setUserProgress(updatedProgress);
    }
  };

  const getIconComponent = (iconName: string) => {
    return ICON_MAP[iconName as keyof typeof ICON_MAP] || Trophy;
  };

  const getTierBadge = (tier: string) => {
    const colors = {
      bronze: 'bg-orange-100 text-orange-800 border-orange-200',
      silver: 'bg-gray-100 text-gray-800 border-gray-200',
      gold: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      platinum: 'bg-purple-100 text-purple-800 border-purple-200',
      diamond: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    return (
      <Badge variant="outline" className={colors[tier as keyof typeof colors] || colors.bronze}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  const calculateLevel = (points: number) => {
    return Math.floor(points / 100) + 1;
  };

  const getPointsToNextLevel = (points: number) => {
    const nextLevelPoints = calculateLevel(points) * 100;
    return nextLevelPoints - points;
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const earnedBadgeIds = new Set(earnedBadges.map(b => b.badge_id));
  const availableBadges = allBadges.filter(b => !earnedBadgeIds.has(b.badge_id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Back to Home Button */}
        <Link to="/">
          <Button
            variant="ghost"
            className="mb-6 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl font-bold bg-primary/10">
                {user.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">Your Progress</h1>
              <p className="text-muted-foreground">Track your debate journey and achievements</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Points</p>
                    <p className="text-2xl font-bold">{userProgress?.total_points || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Level</p>
                    <p className="text-2xl font-bold">{calculateLevel(userProgress?.total_points || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Current Streak</p>
                    <p className="text-2xl font-bold">{userProgress?.current_streak || 0} days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Sessions</p>
                    <p className="text-2xl font-bold">{sessionStats?.total_sessions || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Level Progress */}
          {userProgress && (
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">Level {calculateLevel(userProgress.total_points)}</h3>
                  <span className="text-sm text-muted-foreground">
                    {getPointsToNextLevel(userProgress.total_points)} points to next level
                  </span>
                </div>
                <ProgressBar 
                  value={(userProgress.total_points % 100)} 
                  className="h-3"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="badges" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="badges">Achievements</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="badges" className="space-y-6">
            {/* Earned Badges */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Earned Badges ({earnedBadges.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {earnedBadges.map((badge) => {
                  const IconComponent = getIconComponent(badge.icon_name);
                  return (
                    <Card key={badge.badge_id} className="relative overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-br ${TIER_COLORS[badge.badge_tier]} opacity-10`} />
                      <CardContent className="p-4 relative">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`p-2 rounded-full bg-gradient-to-br ${TIER_COLORS[badge.badge_tier]} text-white`}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          {getTierBadge(badge.badge_tier)}
                        </div>
                        <h3 className="font-semibold mb-1">{badge.badge_name}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{badge.badge_description}</p>
                        <p className="text-xs text-muted-foreground">
                          Earned {new Date(badge.earned_at!).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Available Badges */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Available Badges ({availableBadges.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {availableBadges.map((badge) => {
                  const IconComponent = getIconComponent(badge.icon_name);
                  return (
                    <Card key={badge.badge_id} className="opacity-60 hover:opacity-80 transition-opacity">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded-full bg-muted">
                            <IconComponent className="h-5 w-5 text-muted-foreground" />
                          </div>
                          {getTierBadge(badge.badge_tier)}
                        </div>
                        <h3 className="font-semibold mb-1">{badge.badge_name}</h3>
                        <p className="text-sm text-muted-foreground">{badge.badge_description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Session Progress</CardTitle>
                  <CardDescription>Your debate session history</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total Sessions</span>
                      <span className="font-semibold">{sessionStats?.total_sessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Score</span>
                      <span className="font-semibold">{sessionStats?.average_score || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Perfect Scores</span>
                      <span className="font-semibold">{sessionStats?.perfect_scores || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Time Tracking</CardTitle>
                  <CardDescription>Time spent practicing</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total Time</span>
                      <span className="font-semibold">
                        {Math.round((userProgress?.total_time_spent || 0) / 60)} minutes
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Streak</span>
                      <span className="font-semibold">{userProgress?.current_streak || 0} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Longest Streak</span>
                      <span className="font-semibold">{userProgress?.longest_streak || 0} days</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Achievements</CardTitle>
                  <CardDescription>Badges you've earned</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Badges Earned</span>
                      <span className="font-semibold">{earnedBadges.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Available</span>
                      <span className="font-semibold">{allBadges.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Completion</span>
                      <span className="font-semibold">
                        {allBadges.length > 0 ? Math.round((earnedBadges.length / allBadges.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Speaker profile */}
            {speakerProfile && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Speaker profile
                  </CardTitle>
                  <CardDescription>
                    Patterns across {speakerProfile.sessionCount} recent session
                    {speakerProfile.sessionCount === 1 ? "" : "s"} — used to tailor your next feedback
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {ALL_CRITERIA.map((c) => {
                      const avg = speakerProfile.averages[c];
                      return (
                        <div key={c} className="rounded-lg border p-3">
                          <div className="text-xs text-muted-foreground mb-1">
                            {CRITERION_LABELS[c]}
                          </div>
                          <div className="text-xl font-semibold">
                            {avg != null ? `${avg}%` : "—"}
                          </div>
                          <ProgressBar value={avg ?? 0} className="h-1.5 mt-2" />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {speakerProfile.weakest.map((c) => (
                      <Badge key={`w-${c}`} variant="destructive">
                        Focus: {CRITERION_LABELS[c]}
                      </Badge>
                    ))}
                    {speakerProfile.strongest.map((c) => (
                      <Badge key={`s-${c}`} className="bg-success text-success-foreground">
                        Strength: {CRITERION_LABELS[c]}
                      </Badge>
                    ))}
                  </div>
                  {speakerProfile.lowScoringTopics.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Topics to practice</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {speakerProfile.lowScoringTopics.map((t) => (
                          <li key={t}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Past Debates Vault */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Past Debates Vault
                </CardTitle>
                <CardDescription>
                  Reopen scores, feedback, and recordings from previous speeches
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No sessions yet. Start practicing on the home page to build your vault.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sessions.map((session) => {
                      const length =
                        session.feedback_length_minutes ||
                        session.feedback?.feedbackLengthMinutes ||
                        5;
                      const points = 10;
                      return (
                        <Card key={session.id} className="border-l-4 border-l-primary">
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-lg mb-1 break-words">
                                  {session.motion_topic}
                                </h3>
                                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-2">
                                  {session.stance && (
                                    <Badge variant="outline">{session.stance}</Badge>
                                  )}
                                  <Badge variant="secondary">{length} min feedback</Badge>
                                  <Badge variant="outline">+{points} pts</Badge>
                                  <span>{new Date(session.created_at).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span>{session.duration}s speech</span>
                                  {session.audio_url && (
                                    <Badge className="bg-primary/15 text-primary border-0">
                                      Recording
                                    </Badge>
                                  )}
                                </div>
                                {session.overall_score !== null && (
                                  <div className="flex flex-wrap gap-3 text-sm mt-2">
                                    <span>
                                      Score: <strong>{session.overall_score}</strong>
                                    </span>
                                    {session.score_logic != null && (
                                      <span>
                                        Logic: <strong>{session.score_logic}</strong>
                                      </span>
                                    )}
                                    {session.score_rhetoric != null && (
                                      <span>
                                        Rhetoric: <strong>{session.score_rhetoric}</strong>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSession(session)}
                              >
                                Open feedback
                              </Button>
                            </div>
                            {session.transcript && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {session.transcript.substring(0, 150)}
                                  {session.transcript.length > 150 ? "…" : ""}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={!!selectedSession}
              onOpenChange={(open) => !open && setSelectedSession(null)}
            >
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Session feedback</DialogTitle>
                </DialogHeader>
                {selectedSession && (
                  <ScoreDisplay
                    motion={{
                      topic: selectedSession.motion_topic,
                      category: "Practice",
                    }}
                    stance={selectedSession.stance || undefined}
                    score={{
                      logic: selectedSession.score_logic ?? 0,
                      rhetoric: selectedSession.score_rhetoric ?? 0,
                      empathy: selectedSession.score_empathy ?? 0,
                      delivery: selectedSession.score_delivery ?? 0,
                      total: selectedSession.overall_score ?? 0,
                    }}
                    feedback={
                      selectedSession.feedback?.feedback || {
                        overall: "Saved session feedback.",
                      }
                    }
                    transcript={selectedSession.transcript || ""}
                    missingPoints={selectedSession.feedback?.missingPoints || []}
                    enhancedArgument={
                      selectedSession.feedback?.enhancedArgument || ""
                    }
                    enhancedFeedback={
                      selectedSession.feedback?.enhancedFeedback || undefined
                    }
                    selectedCriteria={
                      (selectedSession.selected_criteria ||
                        selectedSession.feedback?.selectedCriteria ||
                        ALL_CRITERIA) as AssessmentCriterion[]
                    }
                    feedbackLengthMinutes={
                      (selectedSession.feedback_length_minutes ||
                        selectedSession.feedback?.feedbackLengthMinutes ||
                        5) as FeedbackLengthMinutes
                    }
                    audioUrl={selectedSession.audio_url}
                    hideActions
                    onTryAgain={() => setSelectedSession(null)}
                    onNewTopic={() => setSelectedSession(null)}
                  />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="stats" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Detailed Statistics</CardTitle>
                <CardDescription>Comprehensive view of your performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">{earnedBadges.length}</div>
                    <div className="text-sm text-muted-foreground">Badges Earned</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">{userProgress?.total_points || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Points</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {sessionStats?.average_score || 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Average Score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Progress;