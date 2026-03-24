import { useEffect, useState } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, Copy, Check,
  Smartphone, Lock, ArrowRight, ScanFace, FileCheck, Shield,
  Monitor, ExternalLink, Loader2,
} from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";

interface PpiBiometricScreenProps {
  email: string;
  fullName: string;
  biometricUrl: string;
  onEvent?: (event: string) => void;
}

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => {
      const ua = navigator.userAgent;
      const mobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      setIsDesktop(!mobile && window.innerWidth >= 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isDesktop;
};

const PpiBiometricScreen = ({ email, fullName, biometricUrl, onEvent }: PpiBiometricScreenProps) => {
  const [visible, setVisible] = useState(false);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [showFinishBtn, setShowFinishBtn] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDesktop = useIsDesktop();
  const firstName = fullName?.split(" ")?.[0] || "";

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!verificationStarted) return;
    const t = setTimeout(() => setShowFinishBtn(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [verificationStarted]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(biometricUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* fallback */ }
  };

  const handleStartVerification = () => {
    window.open(biometricUrl, "_blank", "noopener,noreferrer");
    setVerificationStarted(true);
    onEvent?.("biometric_started");
  };

  const handleFinish = () => {
    onEvent?.("biometric_finished");
    window.location.reload();
  };

  /* ══════════════════════════════════════════
     VERIFICATION IN PROGRESS
  ══════════════════════════════════════════ */
  if (verificationStarted) {
    return (
      <div className={`w-full max-w-[460px] px-4 sm:px-0 transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center mb-6">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-10" />
        </div>

        <div className="rounded-2xl bg-white border border-[#e2e8f0] overflow-hidden" style={{ boxShadow: "0 4px 24px rgba(30,90,150,0.08)" }}>
          <div className="px-6 sm:px-8 py-8 text-center">
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full border-2 border-[#1e5a96]/10 animate-ping" style={{ animationDuration: "2.5s" }} />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#1e5a96]">
                  <Loader2 size={24} className="text-white animate-spin" style={{ animationDuration: "2s" }} />
                </div>
              </div>
            </div>

            <h3 className="text-[17px] font-semibold text-[#1a2332] mb-2 tracking-tight">Verificación en proceso</h3>
            <p className="text-[13px] text-[#64748b] leading-relaxed mb-6 max-w-[320px] mx-auto">
              Completá el proceso en la pestaña que se abrió. Una vez finalizado, regresá a esta pantalla.
            </p>

            <div className="space-y-3 mb-6">
              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 w-full rounded-lg py-3 text-[13px] font-medium transition-all duration-200 ${
                  copied
                    ? "bg-[#f0fdf4] border border-[#86efac] text-[#16a34a]"
                    : "bg-[#f8fafc] border border-[#e2e8f0] text-[#334155] hover:border-[#1e5a96] hover:text-[#1e5a96]"
                }`}
              >
                {copied ? <><Check size={15} /> Link copiado</> : <><Copy size={15} /> Copiar link de verificación</>}
              </button>

              {/* Re-open */}
              <button
                onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
                className="flex items-center justify-center gap-2 w-full rounded-lg py-3 text-[13px] font-medium bg-[#f8fafc] border border-[#e2e8f0] text-[#334155] hover:border-[#1e5a96] hover:text-[#1e5a96] transition-all"
              >
                <ExternalLink size={15} /> Abrir verificación de nuevo
              </button>
            </div>

            {isDesktop && (
              <div className="rounded-lg bg-[#eff6ff] border border-[#bfdbfe] p-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#bfdbfe] flex-shrink-0">
                    <Smartphone size={14} className="text-[#1e5a96]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#1e3a5f] mb-0.5">¿Preferís verificar desde tu celular?</p>
                    <p className="text-[11px] text-[#64748b] leading-relaxed">
                      Copiá el link y abrilo en tu teléfono para completar la verificación con la cámara.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 border-t border-[#f1f5f9] bg-[#fafbfc]">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#1e5a96] py-3.5 text-[13px] font-semibold text-white hover:bg-[#174a7f] active:scale-[0.99] transition-all"
              >
                <CheckCircle2 size={16} /> Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[12px] text-[#94a3b8]">
                <Clock size={13} className="animate-pulse" />
                <span>Esperando que completes el proceso...</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-[#94a3b8] mt-4">{firstName || email}</p>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     PRE-VERIFICATION SCREEN
  ══════════════════════════════════════════ */
  return (
    <div className={`w-full max-w-[460px] px-4 sm:px-0 transition-all duration-600 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
      <div className="flex justify-center mb-6 sm:mb-8">
        <img src={ppiLogoSvg} alt="PPI" className="h-9 sm:h-11" />
      </div>

      {/* Success indicator */}
      <div className="flex justify-center mb-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0fdf4] border border-[#bbf7d0]">
          <CheckCircle2 size={28} className="text-[#16a34a]" strokeWidth={1.8} />
        </div>
      </div>

      <h2 className="text-center text-[18px] sm:text-[20px] font-semibold text-[#1a2332] mb-1.5 tracking-tight">
        Identidad confirmada{firstName ? `, ${firstName}` : ""}
      </h2>
      <p className="text-center text-[13px] text-[#64748b] leading-relaxed mb-6 max-w-[340px] mx-auto">
        Solo falta un paso más para habilitar completamente tu cuenta.
      </p>

      {/* Main card */}
      <div className="rounded-2xl bg-white border border-[#e2e8f0] overflow-hidden mb-5" style={{ boxShadow: "0 4px 24px rgba(30,90,150,0.08)" }}>
        <div className="px-5 sm:px-7 py-5 sm:py-6">
          <h4 className="text-[14px] font-semibold text-[#1a2332] mb-4">Verificación documental</h4>

          <div className="space-y-3 mb-5">
            {[
              { icon: FileCheck, label: "Foto de tu DNI", desc: "Frente y dorso del documento" },
              { icon: ScanFace, label: "Reconocimiento facial", desc: "Selfie rápida para verificar identidad" },
              { icon: Shield, label: "Protección de cuenta", desc: "Cumplimiento normativo CNV" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex-shrink-0">
                  <Icon size={16} className="text-[#1e5a96]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1a2332]">{label}</p>
                  <p className="text-[11px] text-[#94a3b8]">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#94a3b8] mb-5 pb-5 border-b border-[#f1f5f9]">
            <Clock size={12} />
            <span>Menos de 2 minutos · Proceso 100% seguro</span>
          </div>

          {/* Notice */}
          <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-4 py-3 mb-5">
            <div className="flex items-start gap-2.5">
              <Lock size={13} className="text-[#d97706] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#78350f] leading-relaxed">
                Procedimiento obligatorio de <strong>Portfolio Personal</strong>. Sin completarlo, la cuenta quedará temporalmente restringida.
              </p>
            </div>
          </div>

          {/* Desktop: two options */}
          {isDesktop ? (
            <div className="space-y-3">
              {/* Primary: copy for phone */}
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 w-full rounded-lg py-3.5 text-[13px] font-semibold transition-all duration-200 ${
                  copied
                    ? "bg-[#f0fdf4] border border-[#86efac] text-[#16a34a]"
                    : "bg-[#1e5a96] text-white hover:bg-[#174a7f] active:scale-[0.99]"
                }`}
              >
                {copied ? (
                  <><Check size={16} /> ¡Link copiado!</>
                ) : (
                  <><Smartphone size={16} /> Verificar desde mi celular</>
                )}
              </button>

              {/* Secondary: open in browser */}
              <button
                onClick={handleStartVerification}
                className="flex items-center justify-center gap-2 w-full rounded-lg py-3.5 text-[13px] font-medium bg-white border border-[#e2e8f0] text-[#334155] hover:border-[#1e5a96] hover:text-[#1e5a96] transition-all"
              >
                <Monitor size={16} /> Verificar desde esta computadora
                <ArrowRight size={14} />
              </button>

              {copied && (
                <p className="text-center text-[11px] text-[#64748b]">
                  Pegá el link en el navegador de tu celular para completar la verificación.
                </p>
              )}
            </div>
          ) : (
            /* Mobile: single CTA */
            <button
              onClick={handleStartVerification}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#1e5a96] py-3.5 text-[13px] font-semibold text-white hover:bg-[#174a7f] active:scale-[0.99] transition-all"
            >
              Verificar mi identidad
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-[#cbd5e1] leading-relaxed max-w-[340px] mx-auto">
        🔐 Portfolio Personal Inversiones S.A. · ALyC Integral CNV N° 686
      </p>
    </div>
  );
};

export default PpiBiometricScreen;
