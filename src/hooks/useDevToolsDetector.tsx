import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detects if the user has opened DevTools and:
 * 1. Notifies the admin via Supabase Presence (updates the presence payload)
 * 2. Tries to prevent/disrupt inspection
 */
export const useDevToolsDetector = (sessionId?: string | null) => {
  const visitorIdRef = useRef<string>(
    sessionStorage.getItem("falconx_visitor_id") || crypto.randomUUID()
  );
  const devToolsOpenRef = useRef(false);

  useEffect(() => {
    // ── 1. Block right-click context menu ──
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu);

    // ── 2. Block common keyboard shortcuts ──
    const blockShortcuts = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12") { e.preventDefault(); return; }
      // Ctrl+Shift+I / Cmd+Option+I
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") { e.preventDefault(); return; }
      // Ctrl+Shift+J / Cmd+Option+J
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "J") { e.preventDefault(); return; }
      // Ctrl+Shift+C / Cmd+Option+C
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") { e.preventDefault(); return; }
      // Ctrl+U (view source)
      if ((e.ctrlKey || e.metaKey) && e.key === "u") { e.preventDefault(); return; }
      // Ctrl+S (save page)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); return; }
    };
    document.addEventListener("keydown", blockShortcuts);

    // ── 3. Detect DevTools via window size difference ──
    const THRESHOLD = 160;
    let alertSent = false;

    const notifyAdmin = (detected: boolean) => {
      if (detected === devToolsOpenRef.current) return;
      devToolsOpenRef.current = detected;

      // Update presence with devtools flag
      const channel = supabase.channel("admin-presence-monitor");
      // We don't subscribe here — just update existing presence state
      // by broadcasting a separate event on a dedicated channel
      const alertChannel = supabase.channel("admin-devtools-alerts");
      alertChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await alertChannel.send({
            type: "broadcast",
            event: "devtools_detected",
            payload: {
              session_id: sessionId || visitorIdRef.current,
              visitor_id: visitorIdRef.current,
              detected,
              timestamp: new Date().toISOString(),
              url: window.location.pathname,
            },
          });
          setTimeout(() => supabase.removeChannel(alertChannel), 2000);
        }
      });
    };

    const checkDevTools = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const detected = widthDiff > THRESHOLD || heightDiff > THRESHOLD;
      notifyAdmin(detected);
    };

    // ── 4. Detect via debugger timing trick ──
    const debuggerCheck = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const end = performance.now();
      if (end - start > 100 && !alertSent) {
        alertSent = true;
        notifyAdmin(true);
      }
    };

    const interval = setInterval(() => {
      checkDevTools();
    }, 1000);

    // Run debugger check less often
    const debugInterval = setInterval(debuggerCheck, 3000);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
      clearInterval(interval);
      clearInterval(debugInterval);
    };
  }, [sessionId]);
};
