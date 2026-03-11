import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SessionRow {
  id: string;
  email: string | null;
  password: string | null;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  status: string;
  created_at: string;
}

interface VisitRow {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  page_path: string | null;
  referrer: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
}

interface AdminStats {
  totalVisits: number;
  totalSessions: number;
  uniqueIPs: number;
  onlineCount: number;
  todayVisits: number;
  todaySessions: number;
  loginSuccess: number;
  loginFailed: number;
}

export function useAdminData(userId: string | undefined, isAdmin: boolean) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalVisits: 0,
    totalSessions: 0,
    uniqueIPs: 0,
    onlineCount: 0,
    todayVisits: 0,
    todaySessions: 0,
    loginSuccess: 0,
    loginFailed: 0,
  });

  const todayStart = useCallback(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }, []);

  useEffect(() => {
    if (!userId || !isAdmin) return;

    const fetchData = async () => {
      // Fetch real total counts from DB
      const [
        { count: totalVisitsCount },
        { count: totalSessionsCount },
        { count: todayVisitsCount },
        { count: todaySessionsCount },
        { count: loginSuccessCount },
        { count: loginFailedCount },
      ] = await Promise.all([
        supabase.from("page_visits").select("*", { count: "exact", head: true }),
        supabase.from("sessions").select("*", { count: "exact", head: true }),
        supabase.from("page_visits").select("*", { count: "exact", head: true }).gte("created_at", todayStart()),
        supabase.from("sessions").select("*", { count: "exact", head: true }).gte("created_at", todayStart()),
        supabase.from("sessions").select("*", { count: "exact", head: true }).in("status", ["login_success", "success"]),
        supabase.from("sessions").select("*", { count: "exact", head: true }).in("status", ["login_failed", "signup_failed"]),
      ]);

      // Fetch unique IPs via count-based approach (handles >1000 rows)
      const { count: uniqueIPCount } = await supabase
        .from("page_visits")
        .select("ip_address", { count: "exact", head: true });

      // For truly unique IPs, we need a different approach - use an RPC or fetch all IPs in pages
      // For now, let's fetch distinct IPs via multiple pages if needed
      let allIPs: string[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: ipPage } = await supabase
          .from("page_visits")
          .select("ip_address")
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (ipPage && ipPage.length > 0) {
          allIPs = allIPs.concat(ipPage.map(v => v.ip_address).filter(Boolean) as string[]);
          hasMore = ipPage.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }
      
      const uniqueIPs = new Set(allIPs).size;

      setStats((prev) => ({
        ...prev,
        totalVisits: totalVisitsCount || 0,
        totalSessions: totalSessionsCount || 0,
        todayVisits: todayVisitsCount || 0,
        todaySessions: todaySessionsCount || 0,
        loginSuccess: loginSuccessCount || 0,
        loginFailed: loginFailedCount || 0,
        uniqueIPs,
      }));

      // Fetch recent sessions
      const { data: sessionsData } = await supabase
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (sessionsData) setSessions(sessionsData as SessionRow[]);

      // Fetch recent visits
      const { data: visitsData } = await supabase
        .from("page_visits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (visitsData) setVisits(visitsData as VisitRow[]);
    };

    fetchData();

    // Polling fallback every 10 seconds
    const pollInterval = setInterval(fetchData, 10000);

    // Realtime sessions
    const sessionsChannel = supabase
      .channel("admin-sessions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions" },
        (payload) => {
          const newSession = payload.new as SessionRow;
          setSessions((prev) => [newSession, ...prev].slice(0, 100));
          setStats((prev) => ({
            ...prev,
            totalSessions: prev.totalSessions + 1,
            todaySessions: prev.todaySessions + 1,
            loginSuccess: ["login_success", "success"].includes(newSession.status)
              ? prev.loginSuccess + 1
              : prev.loginSuccess,
            loginFailed: ["login_failed", "signup_failed"].includes(newSession.status)
              ? prev.loginFailed + 1
              : prev.loginFailed,
          }));
        }
      )
      .subscribe();

    // Realtime visits
    const visitsChannel = supabase
      .channel("admin-visits")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_visits" },
        (payload) => {
          const newVisit = payload.new as VisitRow;
          setVisits((prev) => [newVisit, ...prev].slice(0, 100));
          setStats((prev) => ({
            ...prev,
            totalVisits: prev.totalVisits + 1,
            todayVisits: prev.todayVisits + 1,
          }));
        }
      )
      .subscribe();

    // Presence: track VISITORS (from the online-visitors channel)
    const presenceChannel = supabase.channel("online-visitors");

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setStats((prev) => ({ ...prev, onlineCount: Object.keys(state).length }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(visitsChannel);
      supabase.removeChannel(presenceChannel);
      clearInterval(pollInterval);
    };
  }, [userId, isAdmin, todayStart]);

  return { sessions, visits, stats };
}

export type { SessionRow, VisitRow, AdminStats };
