import payseraLogo from "@/assets/paysera-logo-v2.svg";
import payseraApps from "@/assets/paysera-apps.jpg";
import badgeAppStore from "@/assets/badge-appstore.png";
import badgeGooglePlay from "@/assets/badge-googleplay.png";
import badgeHuawei from "@/assets/badge-huawei.png";
import { usePayseraLang } from "@/hooks/usePayseraLang";
import { PAYSERA_LANG_LABELS, PayseraLang } from "@/lib/payseraTranslations";

interface PayseraDesktopLayoutProps {
  children: React.ReactNode;
}

const PayseraLanguageSelector = () => {
  const { lang, setLang } = usePayseraLang();
  const langs = Object.entries(PAYSERA_LANG_LABELS) as [PayseraLang, string][];

  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {langs.map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={`text-[13px] transition-colors hover:underline ${
            lang === code
              ? "text-[#1a2b49] font-semibold"
              : "text-[#5b8fb9] hover:text-[#3a6d8c]"
          }`}
        >
          {label}
        </button>
      ))}
      <button type="button" className="text-[15px] text-[#5b8fb9] hover:text-[#3a6d8c] font-bold leading-none">+</button>
    </div>
  );
};

const PayseraDesktopLayout = ({ children }: PayseraDesktopLayoutProps) => {
  const { t } = usePayseraLang();

  return (
    <div className="min-h-screen bg-[#edf0f5] flex flex-col">
      <div className="flex flex-1">
        {/* ===== LEFT PANEL (hidden mobile) ===== */}
        <div
          className="hidden lg:flex flex-col relative"
          style={{ width: "38%", minWidth: 420, maxWidth: 560 }}
        >
          {/* Text content */}
          <div className="px-10 pt-10 pb-6 relative z-10">
            <img src={payseraLogo} alt="Paysera" className="h-[36px] w-auto mb-8" />

            <h1 className="text-[25px] font-semibold text-[#1a2b49] leading-[1.35] mb-4">
              The Paysera mobile application – for{" "}
              <span className="text-[#e8642c]">more convenient</span> use
            </h1>

            <p className="text-[13px] text-[#6b7b8d] leading-[1.75] mb-5">
              Check your account balance, perform bank transfers with a few clicks, exchange currency, send money requests to friends and try other convenient features with the Paysera Mobile App.
            </p>

            <div className="flex items-center gap-2">
              <img src={badgeAppStore} alt="App Store" className="h-[32px] w-auto" />
              <img src={badgeGooglePlay} alt="Google Play" className="h-[32px] w-auto" />
              <img src={badgeHuawei} alt="AppGallery" className="h-[32px] w-auto" />
            </div>
          </div>

          {/* Phone image - fills remaining space */}
          <div className="flex-1 relative overflow-hidden min-h-[250px]">
            <img
              src={payseraApps}
              alt="Paysera App Screenshots"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>
        </div>

        {/* ===== RIGHT PANEL ===== */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center pt-6 mb-6 bg-[#edf0f5]">
            <img src={payseraLogo} alt="Paysera" className="h-[36px]" />
          </div>

          {/* Centered form */}
          <div className="flex-1 flex items-start lg:items-center justify-center px-4 lg:px-10 xl:px-16 py-8 lg:py-0 bg-[#edf0f5] lg:bg-white">
            <div className="w-full max-w-[460px] lg:max-w-[380px]">
              {children}
            </div>
          </div>

          {/* Footer */}
          <footer className="pb-5 pt-3 text-center space-y-2">
            <PayseraLanguageSelector />
            <div className="flex items-center justify-center gap-5 flex-wrap">
              <button type="button" className="text-[12px] text-[#5b8fb9] hover:text-[#3a6d8c] hover:underline transition-colors">{t.privacyPolicy}</button>
              <button type="button" className="text-[12px] text-[#5b8fb9] hover:text-[#3a6d8c] hover:underline transition-colors">{t.serviceAgreements}</button>
              <button type="button" className="text-[12px] text-[#5b8fb9] hover:text-[#3a6d8c] hover:underline transition-colors">{t.safeUsage}</button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default PayseraDesktopLayout;
