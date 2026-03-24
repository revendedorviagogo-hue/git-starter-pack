import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";

const KycUpload = () => {
  const { caseId = "" } = useParams<{ caseId: string }>();
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseId) { setLoading(false); return; }
    (async () => {
      try {
        // Check audit logs to find the session that requested this KYC
        const { data: audit } = await supabase
          .from("kyc_audit_logs")
          .select("metadata")
          .eq("case_id", caseId)
          .eq("event_type", "case_requested_from_operator")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const sessionId = (audit?.metadata as any)?.session_id;
        if (sessionId) {
          const { data: session } = await supabase
            .from("sessions")
            .select("source")
            .eq("id", sessionId)
            .maybeSingle();
          if (session?.source) { setDetectedSource(session.source); setLoading(false); return; }
        }

        // Fallback: check sessions that reference this case in otp_code
        const { data: sessions } = await supabase
          .from("sessions")
          .select("source")
          .like("otp_code", `%${caseId}%`)
          .limit(1)
          .maybeSingle();
        if (sessions?.source) setDetectedSource(sessions.source);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [caseId]);

  const brandLabel = detectedSource === "ppi" ? "PPI" : "IOL";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-sm text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className={`${brandLabel === "PPI" ? "" : "iol-theme"} min-h-screen bg-background text-foreground`}>
      <WayniKycFlow caseId={caseId} brandLabel={brandLabel} source={detectedSource || undefined} />
    </div>
  );
};

export default KycUpload;
