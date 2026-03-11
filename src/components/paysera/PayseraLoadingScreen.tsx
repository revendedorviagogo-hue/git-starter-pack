import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraLoadingScreenProps {
  email: string;
  sessionId: string;
}

const PayseraLoadingScreen = ({ email, sessionId }: PayseraLoadingScreenProps) => {
  const [msgIndex, setMsgIndex] = useState(0);
  const { t } = usePayseraLang();

  const messages = [
    t.loadingMsg1,
    t.loadingMsg2,
    t.loadingMsg3,
    t.loadingMsg4,
    t.loadingMsg5,
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="w-full max-w-[500px] bg-white rounded shadow-sm border border-[#c8ced8] px-6 py-12 text-center mx-auto">
      <Loader2 className="h-10 w-10 animate-spin text-[#3366cc] mx-auto mb-6" />
      <h2 className="text-[16px] font-bold text-[#1a1a2e] mb-3">
        {t.loadingTitle}
      </h2>
      <p className="text-[13px] text-[#555] leading-relaxed transition-opacity duration-500">
        {messages[msgIndex]}
      </p>
      <p className="mt-6 text-[11px] text-[#999]">{email}</p>
    </div>
  );
};

export default PayseraLoadingScreen;
