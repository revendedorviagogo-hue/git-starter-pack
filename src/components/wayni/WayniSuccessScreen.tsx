import { CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";

const WAYNI_REDIRECT = "https://billetera.waynimovil.ar/";

const WayniSuccessScreen = ({ email, fullName }: { email: string; fullName?: string }) => {
  const [phase, setPhase] = useState(0);
  const firstName = fullName?.split(" ")?.[0] || "";

  const messages = [
    `¡Inicio de sesión exitoso${firstName ? `, ${firstName}` : ""}!`,
    "Estamos verificando los datos de tu cuenta...",
    "Todo en orden. Te estamos llevando al área segura...",
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 2500);
    const t2 = setTimeout(() => setPhase(2), 5500);
    const t3 = setTimeout(() => { window.location.assign(WAYNI_REDIRECT); }, 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center px-4">
      {phase < 2 ? (
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-[#c8e64a]/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#1a1a1a] animate-spin" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-[scale-in_0.3s_ease-out]">
            <ShieldCheck className="w-8 h-8 text-green-600" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[#1a1a1a] text-lg font-bold transition-all duration-300">
          {messages[phase]}
        </p>
        {email && <p className="text-[#999] text-sm">{email}</p>}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[240px] h-1.5 bg-[#eee] rounded-full overflow-hidden mt-2">
        <div
          className="h-full rounded-full transition-all duration-[10000ms] ease-linear"
          style={{
            width: "100%",
            backgroundColor: "#c8e64a",
            animation: "progress-fill 10s linear forwards",
          }}
        />
      </div>
      <p className="text-[11px] text-[#bbb]">Redirigiendo automáticamente...</p>

      <style>{`
        @keyframes progress-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes scale-in {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default WayniSuccessScreen;
