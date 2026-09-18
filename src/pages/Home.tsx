import { useState } from "react";
import { Mic, Target, Trophy, Zap, Sparkles, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewsletterSubscribeBlock } from "@/components/NewsletterSubscribeBlock";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MotionCard, type SpeechStartOptions } from "@/components/MotionCard";
import { getDailyMotion, getRandomMotions, motions as allMotionsData, type Motion } from "@/data/motions";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { ALL_CRITERIA } from "@/types/feedback";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Home = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // topic state
  const [selectedTheme, setSelectedTheme] = useState("All Themes");
  const [motions, setMotions] = useState(() => {
    const daily = getDailyMotion({ stanceOnly: true });
    const random = getRandomMotions(2, { stanceOnly: true });
    return [daily, ...random];
  });
  const allThemes = Array.from(new Set(allMotionsData.map(m => m.category))).sort();
  const themeOptions = ["All Themes", ...allThemes];
  const filteredMotions = selectedTheme === "All Themes"
    ? motions : allMotionsData.filter(m => m.category === selectedTheme);
  const dailyMotion = motions[0];

  const handleStartSpeech = (
    motion: Motion,
    duration: number,
    stance: string | undefined,
    options: SpeechStartOptions,
  ) =>
    navigate("/recording", {
      state: {
        motion,
        duration,
        stance,
        feedbackLengthMinutes: options.feedbackLengthMinutes,
        selectedCriteria: options.selectedCriteria?.length
          ? options.selectedCriteria
          : ALL_CRITERIA,
      },
    });

  return (
    <div className="min-h-screen bg-speech-bg">

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 bg-black/20" />

        {/* Nav */}
        <div className="absolute top-6 right-6 z-10">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-white/80 text-sm">Welcome, {user.email}</span>
              <Link to="/progress">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Progress
                </Button>
              </Link>
              <Link to="/profile">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2">
                  <User className="w-4 h-4" /> Profile
                </Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign Out</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to sign out? You'll need to sign in again to access your progress.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={signOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 flex items-center gap-2">
                <User className="w-4 h-4" /> Sign In
              </Button>
            </Link>
          )}
        </div>

        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">

          {/* Tagline pill */}
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Public speaking practice, gamified</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">Dialecta</h1>
          <p className="text-xl md:text-2xl mb-4 opacity-90">
            Your go-to preparation for intellectual interviews and dialogue portfolios
          </p>
          <p className="text-lg mb-8 opacity-80 max-w-2xl mx-auto">
            Master the art of debate and public speaking with AI-powered feedback — perfect for Schoolhouse
            dialogues and intellectual interviews. Practice daily, track your progress, and become a
            confident, quick-thinking speaker.
          </p>

          <NewsletterSubscribeBlock />

          {/* How It Works */}
          <div className="max-w-4xl mx-auto mb-12 mt-12">
            <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[
                { n: "1", Icon: Target,   label: "Choose a topic" },
                { n: "2", Icon: Mic,      label: "Record your argument" },
                { n: "3", Icon: Sparkles, label: "Let AI analyse your Point of view" },
                { n: "4", Icon: Zap,      label: "Generate detailed feedback" },
                { n: "5", Icon: Trophy,   label: "Track your progress and improve your skills" },
              ].map(({ n, Icon, label }) => (
                <div key={n} className="flex flex-col items-center p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/20 transition-all">
                  <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-3">{n}</div>
                  <Icon className="w-8 h-8 mb-2 text-white" />
                  <span className="text-sm font-medium text-center">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Testimonials */}
          <div className="max-w-4xl mx-auto mt-16 mb-12">
            <h2 className="text-2xl font-bold mb-8 text-center">What Students Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { quote: "Dialecta helped me prepare for my Schoolhouse interview. The AI feedback on logical structure was incredibly detailed and actionable.", by: "Student preparing for intellectual interviews" },
                { quote: "The practice sessions improved my ability to think on my feet and articulate complex ideas clearly. Perfect for dialogue portfolios!", by: "Student building dialogue portfolio" },
                { quote: "I love how the feedback focuses on logical reasoning rather than just facts. It's made me a much stronger debater.", by: "Competitive debater" },
              ].map(({ quote, by }) => (
                <div key={by} className="p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
                  <div className="flex items-center gap-1 mb-3">
                    {[...Array(5)].map((_, i) => <span key={i} className="text-yellow-400">★</span>)}
                  </div>
                  <p className="text-sm mb-3 italic">"{quote}"</p>
                  <p className="text-xs opacity-80">— {by}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      {/* ── end hero ── */}

      {/* ── Main content ───────────────────────────────────── */}
      <div className="max-w-6xl mx-auto p-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">Choose Your Challenge</h2>
          <p className="text-lg text-muted-foreground">
            Pick a topic and start speaking. Get scored on Logic, Rhetoric, Empathy, and Delivery.
          </p>
        </div>

        {/* Theme Filter */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <label className="text-lg font-medium text-foreground">Filter by Theme:</label>
            <Select value={selectedTheme} onValueChange={setSelectedTheme}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {themeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedTheme !== "All Themes" && (
              <span className="text-sm text-muted-foreground">
                ({filteredMotions.length} topic{filteredMotions.length !== 1 ? "s" : ""} found)
              </span>
            )}
          </div>
        </div>

        {/* Daily Motion */}
        {(selectedTheme === "All Themes" || dailyMotion.category === selectedTheme) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 bg-gradient-primary rounded-full animate-pulse" />
              <h3 className="text-xl font-semibold text-foreground">Today's Featured Topic</h3>
            </div>
            <MotionCard motion={dailyMotion} onStartSpeech={handleStartSpeech} isLoggedIn={!!user} />
          </div>
        )}

        {/* More Topics */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-foreground mb-4">
            {selectedTheme === "All Themes" ? "More Topics" : `${selectedTheme} Topics`}
          </h3>
          <div className="grid gap-6 md:grid-cols-2">
            {(selectedTheme === "All Themes"
              ? motions.slice(1)
              : filteredMotions.filter(m => m.id !== dailyMotion.id)
            ).map(motion => (
              <MotionCard key={motion.id} motion={motion} onStartSpeech={handleStartSpeech} isLoggedIn={!!user} />
            ))}
          </div>
        </div>

        {/* Refresh */}
        <div className="text-center">
          <Button
            onClick={() => {
              setMotions([getDailyMotion({ stanceOnly: true }), ...getRandomMotions(2, { stanceOnly: true })]);
              setSelectedTheme("All Themes");
            }}
            variant="outline" className="font-medium"
          >
            🎲 Get New Topics
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-3 mt-16">
          {[
            { icon: Mic,    color: "bg-primary/10",       iconColor: "text-primary",       title: "Quick Practice",  desc: "60s, 90s, 2–3 minute speeches with instant feedback. Perfect for daily practice." },
            { icon: Target, color: "bg-success/10",       iconColor: "text-success",       title: "AI Scoring",      desc: "Get detailed feedback on logic, rhetoric, empathy, and delivery." },
            { icon: Trophy, color: "bg-speech-accent/10", iconColor: "text-speech-accent", title: "Track Progress",  desc: "Watch your scores improve over time and earn achievement badges." },
          ].map(({ icon: Icon, color, iconColor, title, desc }) => (
            <Card key={title} className="bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-card">
              <CardContent className="pt-6 text-center">
                <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Home;
