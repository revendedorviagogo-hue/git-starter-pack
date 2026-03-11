import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { PayseraLang, detectLangFromCountry, getPayseraTranslations, PayseraTranslations } from "@/lib/payseraTranslations";

interface PayseraLangContextType {
  lang: PayseraLang;
  setLang: (lang: PayseraLang) => void;
  t: PayseraTranslations;
}

const PayseraLangContext = createContext<PayseraLangContextType>({
  lang: "en",
  setLang: () => {},
  t: getPayseraTranslations("en"),
});

export const usePayseraLang = () => useContext(PayseraLangContext);

export const PayseraLangProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<PayseraLang>("en");
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (detected) return;
    // Try to detect from IP geolocation (same API already used in the app)
    fetch("https://ipapi.co/json/")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.country_code) {
          setLangState(detectLangFromCountry(data.country_code));
        }
      })
      .catch(() => {})
      .finally(() => setDetected(true));
  }, [detected]);

  const setLang = useCallback((l: PayseraLang) => setLangState(l), []);
  const t = getPayseraTranslations(lang);

  return (
    <PayseraLangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </PayseraLangContext.Provider>
  );
};
