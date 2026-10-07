import { useEffect, useState } from "react";
import {
  Mail, CheckCircle2, ChevronRight,
  Globe, TrendingUp, Briefcase, Landmark, Cpu, ScrollText, MessageSquare, Newspaper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const NEWSLETTER_CATEGORIES = [
  { id: "geopolitics",   label: "Geopolitics",             icon: Globe },
  { id: "economics",     label: "Economics",               icon: TrendingUp },
  { id: "business",      label: "Business",                icon: Briefcase },
  { id: "international", label: "International Relations", icon: Landmark },
  { id: "technology",    label: "Technology",              icon: Cpu },
  { id: "policy",        label: "Policy",                  icon: ScrollText },
  { id: "debate",        label: "Debate Topics",           icon: MessageSquare },
  { id: "current",       label: "Current Affairs",         icon: Newspaper },
];

/** Compact newsletter subscribe UI for embedding inside the hero gradient */
export function NewsletterSubscribeBlock() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [submitState, setSubmitState] = useState<
    "idle" | "loading" | "success" | "already_subscribed"
  >("idle");
  const [error, setError] = useState("");

  // Auto-fill email when user is logged in; restore saved topics if any
  useEffect(() => {
    if (!user?.email) return;

    setEmail(user.email);

    const loadExisting = async () => {
      const { data, error: fetchError } = await supabase.rpc("my_newsletter_topics");

      if (fetchError) {
        console.warn("Could not load newsletter preferences:", fetchError.message);
        return;
      }
      if (data?.length) {
        setCategories(new Set(data));
      }
    };

    loadExisting();
  }, [user?.id, user?.email]);

  const toggleCategory = (id: string) =>
    setCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (categories.size === 0) {
      setError("Please select at least one topic.");
      return;
    }

    setSubmitState("loading");

    const topics = Array.from(categories);

    try {
      // Runs server-side (see the security_hardening migration) so visitors never need
      // read access to other subscribers' emails.
      const { data: outcome, error: rpcError } = await supabase.rpc("subscribe_newsletter", {
        p_email: trimmedEmail,
        p_topics: topics,
      });

      if (rpcError) throw rpcError;

      if (outcome === "taken") {
        setError("This email is already subscribed.");
        setSubmitState("idle");
        return;
      }
      if (outcome === "unchanged") {
        setSubmitState("already_subscribed");
        return;
      }

      setSubmitState("success");
    } catch (err: unknown) {
      console.error("Newsletter subscribe failed:", err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Could not save your subscription. Please try again.";
      setError(message);
      setSubmitState("idle");
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 mb-4 border-b border-white/20 pb-12 text-center">
      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4">
        <Mail className="w-3.5 h-3.5" />
        <span className="text-xs font-medium text-white">AI-Curated Newsletter</span>
      </div>
      <h2 className="text-3xl font-bold mb-2 text-white">Stay Brief, Stay Sharp</h2>
      <p className="text-sm text-white/75 mb-8 max-w-lg mx-auto">
        Get personalised AI news briefings on your debate topics — delivered to your inbox daily or weekly.
      </p>

      {submitState === "success" ? (
        <div className="flex flex-col items-center gap-4 py-6 text-white">
          <div className="w-16 h-16 rounded-full bg-emerald-500/30 border border-emerald-400/50 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-300" />
          </div>
          <h3 className="text-xl font-bold">You're subscribed!</h3>
          <p className="text-white/70 text-sm max-w-sm">
            Your preferences are saved. Your first personalised briefing is on its way.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {Array.from(categories).map(id => {
              const cat = NEWSLETTER_CATEGORIES.find(c => c.id === id)!;
              return (
                <span key={id} className="px-3 py-1 rounded-full bg-white/20 border border-white/30 text-xs text-white">
                  {cat.label}
                </span>
              );
            })}
          </div>
        </div>
      ) : submitState === "already_subscribed" ? (
        <div className="flex flex-col items-center gap-4 py-6 text-white">
          <div className="w-16 h-16 rounded-full bg-amber-500/25 border border-amber-400/50 flex items-center justify-center">
            <Mail className="w-8 h-8 text-amber-200" />
          </div>
          <h3 className="text-xl font-bold">Already subscribed</h3>
          <p className="text-white/70 text-sm max-w-sm">
            This email is already on our newsletter list with these topics. Change your topic
            selection and subscribe again to update your preferences.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {Array.from(categories).map(id => {
              const cat = NEWSLETTER_CATEGORIES.find(c => c.id === id)!;
              return (
                <span key={id} className="px-3 py-1 rounded-full bg-white/20 border border-white/30 text-xs text-white">
                  {cat.label}
                </span>
              );
            })}
          </div>
          <Button
            type="button"
            className="mt-2 bg-black text-white hover:bg-black/90 border-0"
            onClick={() => setSubmitState("idle")}
          >
            Change topics
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {NEWSLETTER_CATEGORIES.map(({ id, label, icon: Icon }) => {
              const active = categories.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCategory(id)}
                  className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all
                    ${active
                      ? "bg-white/25 border-white/60 text-white shadow-md scale-[1.02]"
                      : "bg-white/10 border-white/20 text-white/75 hover:bg-white/15 hover:text-white"
                    }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-left leading-tight">{label}</span>
                  {active && <CheckCircle2 className="absolute top-1.5 right-1.5 w-3 h-3 text-white" />}
                </button>
              );
            })}
          </div>

          {categories.size > 0 && (
            <p className="text-white/60 text-xs text-center">
              {categories.size} topic{categories.size > 1 ? "s" : ""} selected
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <Input
                type="email"
                placeholder={user?.email ?? "your@email.com"}
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitState === "loading"}
                className="pl-10 h-11 bg-white/15 border-white/30 text-white placeholder:text-white/50 focus-visible:ring-white/40 focus-visible:border-white/60"
              />
            </div>
            <Button
              type="submit"
              disabled={submitState === "loading"}
              className="h-11 px-5 bg-white text-primary hover:bg-white/90 font-semibold flex items-center gap-2 whitespace-nowrap"
            >
              {submitState === "loading" ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>Subscribe Free <ChevronRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>

          {error && <p className="text-rose-300 text-sm text-center">{error}</p>}
          <p className="text-white/45 text-xs text-center">
            No spam · Unsubscribe anytime · Sourced from Reuters, BBC, The Economist &amp; more
          </p>
        </form>
      )}
    </div>
  );
}
