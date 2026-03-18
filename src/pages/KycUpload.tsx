import { useParams } from "react-router-dom";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";

const KycUpload = () => {
  const { caseId = "" } = useParams<{ caseId: string }>();

  return (
    <div className="iol-theme min-h-screen bg-background text-foreground">
      <WayniKycFlow caseId={caseId} brandLabel="IOL" />
    </div>
  );
};

export default KycUpload;
