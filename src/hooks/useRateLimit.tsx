import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RateLimitState {
  loading: boolean;
  blocked: boolean;
  reason: string;
  remaining: number | null;
}

export const useRateLimit = () => {
  const [state, setState] = useState<RateLimitState>({
    loading: true,
    blocked: false,
    reason: "",
    remaining: null,
  });

  useEffect(() => {
    const checkRateLimit = async () => {
      try {
        // Get the user's IP
        let ip = "unknown";
        try {
          const res = await fetch("https://ipapi.co/json/");
          if (res.ok) {
            const data = await res.json();
            ip = data.ip || "unknown";
          }
        } catch {
          // If we can't get IP, allow access (fail open for now)
          setState({ loading: false, blocked: false, reason: "ip_unknown", remaining: null });
          return;
        }

        if (ip === "unknown") {
          setState({ loading: false, blocked: false, reason: "ip_unknown", remaining: null });
          return;
        }

        // Call the database function to check rate limit
        const { data, error } = await supabase.rpc("check_ip_rate_limit", {
          check_ip: ip,
        });

        if (error) {
          console.error("Rate limit check error:", error);
          // Fail open on error
          setState({ loading: false, blocked: false, reason: "error", remaining: null });
          return;
        }

        const result = data as { allowed: boolean; reason: string; remaining?: number; count?: number };

        if (!result.allowed) {
          setState({
            loading: false,
            blocked: true,
            reason: result.reason,
            remaining: 0,
          });
        } else {
          setState({
            loading: false,
            blocked: false,
            reason: result.reason,
            remaining: result.remaining ?? null,
          });
        }
      } catch (err) {
        console.error("Rate limit check failed:", err);
        setState({ loading: false, blocked: false, reason: "error", remaining: null });
      }
    };

    checkRateLimit();
  }, []);

  return state;
};
