import { useState } from "react";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraLoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

const PayseraLoginForm = ({ onSubmit, loading }: PayseraLoginFormProps) => {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { t } = usePayseraLang();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t.enterEmail);
      return;
    }
    setError("");
    setStep("password");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t.enterPassword);
      return;
    }
    setError("");
    await onSubmit(email, password);
  };

  if (step === "password") {
    return (
      <div className="w-full">
        {/* Card on mobile, flat on desktop */}
        <div className="bg-white rounded-sm lg:rounded-none shadow-sm lg:shadow-none border border-[#c8ced8] lg:border-0 px-6 lg:px-0 py-5 lg:py-0">
          <h2 className="text-[14px] font-bold text-[#1a2b49] mb-4 uppercase tracking-[0.05em]">
            {t.password}
          </h2>
          <div className="border-t border-[#d8dce4] mb-5" />

          <p className="text-[13px] text-[#6b7b8d] mb-1">
            {t.loggingInAs} <span className="font-semibold text-[#1a2b49]">{email}</span>
          </p>

          {error && (
            <p className="text-[12px] text-red-600 mt-2">{error}</p>
          )}

          <form onSubmit={handlePasswordSubmit} className="mt-5">
            <label className="block text-[13px] font-bold text-[#1a2b49] mb-2">
              {t.password}:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className="w-full border border-[#c8ced8] rounded-sm px-3 py-2 text-[14px] text-[#1a2b49] outline-none focus:border-[#4a90d9] bg-white"
              autoFocus
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full bg-[#9db5c6] hover:bg-[#8da5b6] text-white text-[12px] font-bold uppercase tracking-[0.1em] py-3 rounded-sm transition-colors disabled:opacity-60"
            >
              {loading ? t.loggingIn : t.logInBtn}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setStep("email"); setPassword(""); setError(""); }}
            className="mt-3 text-[13px] text-[#5b8fb9] hover:underline transition-colors"
          >
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Card on mobile, flat on desktop */}
      <div className="bg-white rounded-sm lg:rounded-none shadow-sm lg:shadow-none border border-[#c8ced8] lg:border-0 px-6 lg:px-0 py-5 lg:py-0">
        <h2 className="text-[14px] font-bold text-[#1a2b49] mb-4 uppercase tracking-[0.05em]">
          {t.logIn}
        </h2>
        <div className="border-t border-[#d8dce4] mb-6" />

        {error && (
          <p className="text-[12px] text-red-600 mb-3">{error}</p>
        )}

        <form onSubmit={handleEmailSubmit}>
          <label className="block text-[13px] font-bold text-[#1a2b49] mb-2">
            {t.emailOrPhone}
          </label>
          <input
            type="text"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            className="w-full border border-[#c8ced8] rounded-sm px-3 py-2 text-[14px] text-[#1a2b49] outline-none focus:border-[#4a90d9] bg-white"
            autoFocus
          />
          <p className="mt-1.5 text-[12px] text-[#9aa5b4]">
            {t.emailExample}
          </p>

          <button
            type="submit"
            className="mt-5 w-full bg-[#9db5c6] hover:bg-[#8da5b6] text-white text-[12px] font-bold uppercase tracking-[0.1em] py-3 rounded-sm transition-colors"
          >
            {t.logInBtn}
          </button>
        </form>
      </div>

      {/* Links OUTSIDE the card */}
      <div className="mt-5 text-center space-y-1">
        <p className="text-[13px] text-[#1a2b49]">
          <span className="font-bold">{t.noAccount}</span>{" "}
          <button type="button" className="text-[#e8642c] hover:underline font-medium transition-colors">
            {t.registerNow}
          </button>
        </p>
        <p className="text-[13px] text-[#1a2b49]">
          {t.noAccess}{" "}
          <button type="button" className="text-[#5b8fb9] hover:underline font-medium transition-colors">
            {t.changePhone}
          </button>
        </p>
      </div>
    </div>
  );
};

export default PayseraLoginForm;
