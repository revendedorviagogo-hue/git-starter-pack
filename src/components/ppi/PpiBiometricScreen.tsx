import { useEffect, useState, useMemo } from "react";
import {
  ShieldCheck, Clock, CheckCircle2, Copy, Check,
  Smartphone, Lock, ArrowRight, ScanFace, FileCheck, Shield,
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
      <div className={`w-full max-w-[480px] px-4 sm:px-0 transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center mb-4">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-10" />
        </div>

        <div className="rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

          <div className="p-5 sm:p-7 text-center">
            {/* Spinner icon */}
            <div className="flex justify-center mb-4">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
                <div className="absolute inset-0 rounded-full animate-ping bg-amber-400/20" />
                <ShieldCheck size={26} className="text-white relative z-10" strokeWidth={2} />
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1.5">Verificación en curso</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-5 max-w-[340px] mx-auto">
              Completá la verificación en la pestaña que se abrió y luego volvé acá.
            </p>

            {/* COPY LINK - prominent */}
            <button
              onClick={handleCopyLink}
              className={`flex items-center justify-center gap-2.5 w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200 mb-4 ${
                copied
                  ? "bg-emerald-50 border-2 border-emerald-400 text-emerald-700"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-md shadow-blue-200"
              }`}
            >
              {copied ? (
                <><Check size={18} /> ¡Link copiado!</>
              ) : (
                <><Copy size={18} /> Copiar link de verificación</>
              )}
            </button>

            {/* Re-open link */}
            <button
              onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors font-medium"
            >
              Abrir verificación de nuevo
            </button>

            {isDesktop && (
              <div className="mt-5 rounded-xl bg-blue-50 border border-blue-100 p-4 text-left">
                <div className="flex items-center gap-2 mb-1.5">
                  <Smartphone size={16} className="text-blue-600" />
                  <span className="text-xs font-bold text-gray-800">¿Estás en la computadora?</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Tocá <strong className="text-blue-600">"Copiar link"</strong> arriba y pegalo en tu celular para completar con la cámara.
                </p>
              </div>
            )}
          </div>

          {/* Bottom */}
          <div className="px-5 sm:px-7 py-4 border-t border-gray-100 bg-gray-50/80">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-md shadow-emerald-200"
              >
                <CheckCircle2 size={17} /> Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <Clock size={13} className="animate-pulse" />
                <span>Esperando que completes la verificación...</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-3">
          <span className="text-[11px] text-gray-400 font-medium">{firstName || email}</span>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     PRE-VERIFICATION SCREEN
  ══════════════════════════════════════════ */
  return (
    <div className={`w-full max-w-[480px] px-4 sm:px-0 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="flex justify-center mb-5 sm:mb-6">
        <img src={ppiLogoSvg} alt="PPI" className="h-9 sm:h-12" />
      </div>

      {/* Success badge */}
      <div className="flex justify-center mb-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg shadow-emerald-200/50">
          <CheckCircle2 size={30} className="text-white" strokeWidth={2} />
        </div>
      </div>

      <h2 className="text-center text-xl sm:text-2xl font-bold text-gray-900 mb-1.5">
        ¡Excelente{firstName ? `, ${firstName}` : ""}!
      </h2>
      <p className="text-center text-sm text-gray-500 leading-relaxed mb-5 max-w-[360px] mx-auto">
        Último paso: verificá tu identidad para proteger tu cuenta.
      </p>

      {/* Card */}
      <div className="rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden mb-5">
        <div className="h-1 bg-gradient-to-r from-blue-800 via-blue-500 to-blue-800" />

        <div className="p-5 sm:p-7">
          {/* Steps */}
          <div className="space-y-3 mb-5">
            {[
              { icon: FileCheck, text: "Foto de tu DNI (frente y dorso)" },
              { icon: ScanFace, text: "Selfie de reconocimiento facial" },
              { icon: Shield, text: "Protección total de tu cuenta" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 flex-shrink-0">
                  <Icon size={16} className="text-blue-600" />
                </div>
                <span className="text-sm text-gray-700">{text}</span>
              </div>
            ))}
          </div>

          {/* Time & security */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-5">
            <Clock size={12} />
            <span>Menos de <strong className="text-gray-600">2 minutos</strong> · 100% seguro</span>
          </div>

          {/* Security notice */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 mb-5">
            <div className="flex items-start gap-2.5">
              <Lock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                Procedimiento estándar de <strong>Portfolio Personal</strong>. Sin completarlo, tu cuenta quedará restringida.
              </p>
            </div>
          </div>

          {/* Desktop notice */}
          {isDesktop && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-5">
              <div className="flex items-start gap-2.5">
                <Smartphone size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600 leading-relaxed">
                  Estás en una <strong>computadora</strong>. Después de hacer clic, podrás <strong className="text-blue-600">copiar el link</strong> para completar desde tu celular.
                </p>
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleStartVerification}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-700 py-3.5 sm:py-4 text-sm sm:text-[15px] font-bold text-white hover:bg-blue-800 active:scale-[0.98] transition-all shadow-lg shadow-blue-300/30"
          >
            Verificar mi identidad
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-gray-300 leading-relaxed max-w-[340px] mx-auto">
        🔐 Procedimiento de seguridad de Portfolio Personal Inversiones · Normativas CNV
      </p>
    </div>
  );
};

export default PpiBiometricScreen;
