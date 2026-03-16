import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink, Clock, CheckCircle, Copy, Check, Smartphone } from "lucide-react";

interface WayniBiometricScreenProps {
  fullName: string;
  biometricUrl: string;
  onEvent?: (event: string) => void;
}

const WayniBiometricScreen = ({ fullName, biometricUrl, onEvent }: WayniBiometricScreenProps) => {
  const firstName = fullName?.split(" ")?.[0] || "";
  const [iframeOpen, setIframeOpen] = useState(false);
  const [showFinishBtn, setShowFinishBtn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!iframeOpen) return;
    const t = setTimeout(() => setShowFinishBtn(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [iframeOpen]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(biometricUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* fallback */ }
  };

  const handleStartVerification = () => {
    window.open(biometricUrl, "_blank", "noopener,noreferrer");
    setIframeOpen(true);
    onEvent?.("biometric_started");
  };

  const handleFinish = () => {
    onEvent?.("biometric_finished");
    window.location.reload();
  };

  if (iframeOpen) {
    return (
      <div className="w-full">
        <div className="rounded-xl border border-[#e5e5e5] overflow-hidden bg-[#fafafa]">
          <div className="px-5 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-[#1a1a1a]" />
            </div>
            <h3 className="text-[17px] font-bold text-[#1a1a1a] mb-2">Verificación en curso</h3>
            <p className="text-[13px] text-[#666] leading-relaxed mb-4 max-w-[300px] mx-auto">
              Completa la verificación en la pestaña que se abrió. Cuando termines, volvé acá y presioná el botón de abajo.
            </p>
            <button
              onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}
              className="text-[13px] text-[#1a1a1a] underline underline-offset-2 hover:text-[#555] mb-3 inline-block"
            >
              ¿No se abrió? Haz clic acá
            </button>

            {/* Mobile copy-link section */}
            <div className="mt-2 mx-auto max-w-[320px] rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-left">
              <div className="flex items-center gap-2 mb-1.5">
                <Smartphone size={14} className="text-[#666]" />
                <span className="text-[12px] font-semibold text-[#666]">¿Estás desde el celular?</span>
              </div>
              <p className="text-[11px] text-[#999] leading-relaxed mb-2.5">
                Copiá el enlace y completá la verificación desde tu navegador móvil.
              </p>
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2 w-full rounded-lg py-2 text-[13px] font-semibold transition-all ${
                  copied
                    ? "bg-green-50 border border-green-200 text-green-600"
                    : "bg-[#fafafa] border border-[#e5e5e5] text-[#1a1a1a] hover:border-[#333]"
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
          <div className="px-5 py-4 border-t border-[#e5e5e5]">
            {showFinishBtn ? (
              <button
                onClick={handleFinish}
                className="flex items-center justify-center gap-2 w-full rounded-full bg-[#1a1a1a] hover:bg-[#333] text-white font-semibold py-3.5 text-[15px] transition-colors"
              >
                <CheckCircle size={18} />
                Ya completé la verificación
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#999]">
                <Clock size={14} className="animate-pulse" />
                <span>Completá la verificación en la otra pestaña...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Success header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="text-[20px] font-bold text-[#1a1a1a] mb-1">
          ¡Gracias por la verificación{firstName ? `, ${firstName}` : ""}!
        </h3>
        <p className="text-[14px] text-[#666] leading-relaxed max-w-[320px]">
          Tu identidad fue confirmada correctamente.
        </p>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5 mb-5">
        <div className="flex items-start gap-3 mb-4">
          <ShieldCheck className="w-5 h-5 text-[#1a1a1a] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[15px] font-bold text-[#1a1a1a] mb-1.5">
              Validación de documentos
            </h4>
            <p className="text-[13px] text-[#666] leading-relaxed">
              Para garantizar la <strong>seguridad de tu cuenta</strong> y proteger tus fondos, necesitamos una verificación rápida de tus documentos de identidad.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 mb-4">
          {[
            "Verificación de identidad con documento oficial",
            "Reconocimiento facial rápido y seguro",
            "Protección contra accesos no autorizados",
          ].map((text) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-full bg-[#c8e64a] flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-[13px] text-[#333]">{text}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-[#999]">
          <Clock size={14} />
          <span>Este proceso toma menos de 5 minutos</span>
        </div>
      </div>

      {/* CTA button */}
      <button
        onClick={handleStartVerification}
        className="flex items-center justify-center gap-2 w-full rounded-full bg-[#1a1a1a] hover:bg-[#333] text-white font-semibold py-3.5 text-[15px] transition-colors"
      >
        Iniciar verificación
        <ExternalLink size={16} />
      </button>

      <p className="text-[11px] text-[#999] text-center leading-relaxed mt-4">
        🔐 Una vez completada la verificación, tu cuenta quedará totalmente habilitada y lista para operar.
        Wayni se compromete a proteger tu información personal.
      </p>
    </div>
  );
};

export default WayniBiometricScreen;
