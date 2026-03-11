import { useState, useEffect } from "react";
import { ShieldCheck, QrCode, ArrowLeft, Copy, Check } from "lucide-react";
import cocosLogo from "@/assets/cocos-logo.png";

interface CocosV2MfaEnrollScreenProps {
  email: string;
  qrCode: string; // SVG or URI for QR
  secret: string; // TOTP secret for manual entry
  onVerifyEnroll: (code: string) => Promise<void>;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

const CocosV2MfaEnrollScreen = ({ email, qrCode, secret, onVerifyEnroll, onBack, loading, error }: CocosV2MfaEnrollScreenProps) => {
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    await onVerifyEnroll(code);
  };

  return (
    <div className={`w-full max-w-[440px] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="rounded-2xl bg-white overflow-hidden shadow-[0_8px_32px_-8px_rgba(26,63,143,0.15)] border border-[#e8edf5]">
        <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />

        <div className="px-8 pt-6 pb-8">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#8895aa] hover:text-[#5a6a85] transition-colors mb-5">
            <ArrowLeft size={14} /> Volver
          </button>

          <div className="flex flex-col items-center mb-5">
            <div className="relative mb-4">
              <div className="absolute -inset-2 rounded-full bg-blue-50 border border-blue-100" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1a3f8f] to-[#3b6fe0] shadow-lg shadow-[#1a3f8f]/25">
                <QrCode size={28} className="text-white" />
              </div>
            </div>

            <h3 className="text-[18px] font-bold text-[#1a2233] mb-1">Configurar autenticador</h3>
            <p className="text-[13px] text-[#8895aa] text-center max-w-[300px]">
              Escaneá el código QR con Google Authenticator u otra app TOTP.
            </p>
          </div>

          {/* QR Code */}
          {qrCode && (
            <div className="flex justify-center mb-4">
              <div className="rounded-xl border border-[#e8edf5] bg-white p-4" dangerouslySetInnerHTML={{ __html: qrCode }} />
            </div>
          )}

          {/* Manual secret */}
          <div className="mb-5">
            <p className="text-[11px] text-[#8895aa] text-center mb-2">O ingresá esta clave manualmente:</p>
            <div className="flex items-center justify-center gap-2">
              <code className="rounded-lg bg-[#f0f5ff] border border-[#d0e0ff] px-3 py-2 text-[12px] font-mono text-[#1a3f8f] tracking-wider select-all">
                {secret}
              </code>
              <button onClick={handleCopy} className="rounded-lg border border-[#d8dfe8] p-2 hover:bg-[#f5f7fa] transition-colors">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-[#8895aa]" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
          )}

          {/* Verify code */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#5a6a85] text-center">Código de verificación</label>
              <div className="flex justify-center">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-[200px] text-center rounded-xl border border-[#d8dfe8] bg-[#f8fafc] px-4 py-3.5 text-[22px] font-bold text-[#1a2233] tracking-[0.3em] outline-none transition-all placeholder:text-[#d8dfe8] focus:border-[#3b6fe0] focus:ring-2 focus:ring-[#3b6fe0]/15"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-xl bg-gradient-to-r from-[#1a3f8f] to-[#2563eb] py-3.5 text-[14px] font-bold text-white transition-all hover:from-[#15357a] hover:to-[#1d55d4] active:scale-[0.98] disabled:opacity-50 shadow-md shadow-[#1a3f8f]/20"
            >
              {loading ? "Activando..." : "Activar autenticador"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-2">
            <ShieldCheck size={13} className="text-[#3b6fe0]" />
            <span className="text-[11px] text-[#8895aa]">{email}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CocosV2MfaEnrollScreen;
