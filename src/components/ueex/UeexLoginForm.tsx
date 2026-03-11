import { useState } from "react";
import ueexLogo from "@/assets/ueex-logo-official.png";
import { useUeexLang } from "@/hooks/useUeexLang";
import UeexLanguageSelector, { UeexLanguageSelectorMobile } from "./UeexLanguageSelector";

interface UeexLoginFormProps {
  onSubmit: (email: string, password: string) => void;
  loading: boolean;
}

const UeexLoginForm = ({ onSubmit, loading }: UeexLoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useUeexLang();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    onSubmit(email.trim(), password);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white md:bg-[#1e2230]">
      {/* Desktop Navbar */}
      <nav className="hidden md:flex items-center justify-between px-8 py-3 bg-[#1a1d2e] border-b border-[#2a2d3e]">
        <div className="flex items-center gap-8">
          <img src={ueexLogo} alt="UEEx" className="h-8 w-auto" />
          <div className="flex items-center gap-6 text-sm text-[#a0a3b1]">
            <span className="cursor-pointer hover:text-white transition-colors">{t("market")}</span>
            <span className="cursor-pointer hover:text-white transition-colors">{t("spot")}</span>
            <span className="cursor-pointer hover:text-white transition-colors">{t("usdtm")}</span>
            <span className="cursor-pointer hover:text-white transition-colors">{t("voting")}</span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-white cursor-pointer">{t("login")}</span>
          <span className="bg-[#F5A623] text-white px-5 py-1.5 rounded-full text-sm font-medium cursor-pointer">{t("sign_up")}</span>
          <span className="text-[#a0a3b1] cursor-pointer hover:text-white transition-colors">{t("download")}</span>
          <UeexLanguageSelector />
        </div>
      </nav>

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-4 pt-4 md:hidden">
        <button className="p-1 text-[#333]" aria-label={t("back")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <UeexLanguageSelectorMobile />
      </div>

      {/* Mobile Logo */}
      <div className="px-6 pt-8 pb-6 md:hidden">
        <img src={ueexLogo} alt="UEEx" className="h-12 w-auto" />
      </div>

      {/* Desktop: dark bg with diagonal stripes + centered white card */}
      <div className="hidden md:flex flex-1 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: `linear-gradient(135deg, 
            #1e2230 0%, #1e2230 20%, 
            #252838 20%, #252838 25%, 
            #1e2230 25%, #1e2230 45%, 
            #252838 45%, #252838 50%, 
            #1e2230 50%, #1e2230 70%, 
            #252838 70%, #252838 75%, 
            #1e2230 75%, #1e2230 100%)`
        }} />

        <div className="relative z-10 w-full max-w-[460px] rounded-lg bg-white p-10 shadow-2xl">
          <h2 className="mb-8 text-center text-xl font-semibold text-[#333]">{t("login")}</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email_placeholder")}
              autoFocus
              className="w-full rounded border border-[#ddd] bg-white px-4 py-3.5 text-[14px] text-[#333] outline-none placeholder:text-[#bbb] focus:border-[#F5A623] transition-colors"
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("password_placeholder")}
                className="w-full rounded border border-[#ddd] bg-white px-4 py-3.5 pr-12 text-[14px] text-[#333] outline-none placeholder:text-[#bbb] focus:border-[#F5A623] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#999]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {showPassword ? (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full rounded bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#e6991a] active:bg-[#d98f15] disabled:opacity-50"
            >
              {loading ? t("loading") : t("login")}
            </button>

            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#666]">
                {t("no_account")}{" "}
                <span className="font-medium text-[#F5A623] cursor-pointer">{t("sign_up")}</span>
              </span>
              <span className="font-medium text-[#F5A623] cursor-pointer">{t("forget_password")}</span>
            </div>
          </form>
        </div>
      </div>

      {/* Mobile Form */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-6 md:hidden">
        <label className="mb-2 text-[14px] text-[#333] leading-snug">
          {t("phone_or_email")}
        </label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email_or_phone_placeholder")}
          autoFocus
          className="mb-6 w-full border-b border-[#e0e0e0] bg-transparent pb-3 text-[15px] text-[#333] outline-none placeholder:text-[#bbb] focus:border-[#F5A623] transition-colors"
        />

        <label className="mb-2 text-[14px] text-[#333] leading-snug">
          {t("password_label")}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("enter_password")}
          className="mb-8 w-full border-b border-[#e0e0e0] bg-transparent pb-3 text-[15px] text-[#333] outline-none placeholder:text-[#bbb] focus:border-[#F5A623] transition-colors"
        />

        <button
          type="submit"
          disabled={loading || !email.trim() || !password.trim()}
          className="w-full rounded-full bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#e6991a] active:bg-[#d98f15] disabled:opacity-50"
        >
          {loading ? t("loading") : t("next_step")}
        </button>

        <button
          type="button"
          className="mt-4 text-left text-[13px] font-medium text-[#F5A623]"
        >
          {t("create_account")}
        </button>

        <div className="mt-auto flex justify-end pb-6 pt-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5A623]/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>
      </form>

      {/* Desktop chat icon */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-50">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F5A623] shadow-lg cursor-pointer hover:bg-[#e6991a] transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default UeexLoginForm;
