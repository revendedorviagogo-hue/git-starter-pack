import { useEffect, useState, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceEntry {
  session_id: string;
  ip_address?: string;
  source?: string;
  city?: string;
  country?: string;
  user_agent?: string;
  online_at: string;
  devtools_open?: boolean;
}

interface SessionPresenceContextType {
  onlineSessions: Set<string>;
  presences: PresenceEntry[];
}

const SessionPresenceContext = createContext<SessionPresenceContextType>({
  onlineSessions: new Set(),
  presences: [],
});

export const SessionPresenceProvider = ({ children }: { children: React.ReactNode }) => {
  const [onlineSessions, setOnlineSessions] = useState<Set<string>>(new Set());
  const [presences, setPresences] = useState<PresenceEntry[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Use a unique channel name for the admin listener to avoid conflicts
    const channel = supabase.channel("admin-presence-monitor");
    channelRef.current = channel;

    const processState = () => {
      const state = channel.presenceState();
      const ids = new Set<string>();
      const list: PresenceEntry[] = [];
      const seen = new Set<string>();

      Object.values(state).forEach((entries: any[]) => {
        entries.forEach((p: any) => {
          const sid = p.session_id as string;
          if (!sid || sid.startsWith("__admin")) return;
          ids.add(sid);
          if (!seen.has(sid)) {
            seen.add(sid);
            list.push({
              session_id: sid,
              ip_address: p.ip_address,
              source: p.source,
              city: p.city,
              country: p.country,
              user_agent: p.user_agent,
              online_at: p.online_at || new Date().toISOString(),
              devtools_open: p.devtools_open,
            });
          }
        });
      });

      setOnlineSessions(ids);
      setPresences(list);
    };

    channel
      .on("presence", { event: "sync" }, processState)
      .on("presence", { event: "join" }, processState)
      .on("presence", { event: "leave" }, processState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Admin tracks itself to keep channel alive
          await channel.track({
            session_id: "__admin__",
            online_at: new Date().toISOString(),
          });
          // Process initial state
          processState();
        }
      });

    // Fallback poll every 3s
    const poll = setInterval(processState, 3000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  return (
    <SessionPresenceContext.Provider value={{ onlineSessions, presences }}>
      {children}
    </SessionPresenceContext.Provider>
  );
};

export const useSessionPresence = () => {
  return useContext(SessionPresenceContext).onlineSessions;
};

export const usePresenceEntries = () => {
  return useContext(SessionPresenceContext).presences;
};
