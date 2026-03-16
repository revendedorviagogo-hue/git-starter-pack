import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink, Clock, CheckCircle } from "lucide-react";

interface WayniBiometricScreenProps {
  fullName: string;
  biometricUrl: string;
}

const WayniBiometricScreen = ({ fullName, biometricUrl }: WayniBiometricScreenProps) => {
  const firstName = fullName?.split(" ")?.[0] || "";
  const [iframeOpen, setIframeOpen] = useState(false);
  const [showFinishBtn, setShowFinishBtn] = useState(false);

  useEffect(() => {
    if (!iframeOpen) return;
    const t = setTimeout(() => setShowFinishBtn(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [iframeOpen]);

  const handleStartVerification = () => {
    window.open(biometricUrl, "_blank", "noopener,noreferrer");
    setIframeOpen(true);
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
              className="text-[13px] text-[#1a1a1a] underline underline-offset-2 hover:text-[#555] mb-2 inline-block"
            >
              ¿No se abrió? Haz clic acá
            </button>
          </div>
          <div className="px-5 py-4 border-t border-[#e5e5e5]">
            {showFinishBtn ? (
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 w-full rounded-full bg-[#1a1a1a] hover:bg-[#333] text-white font-semibold py-3.5 text-[15px] transition-colors"
              >
                <CheckCircle size={18} />
                Finalizei todo o processo
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#999]">
                <Clock size={14} className="animate-pulse" />
                <span>Complete a verificação na outra aba...</span>
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
