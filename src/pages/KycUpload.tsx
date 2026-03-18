import { useParams } from "react-router-dom";
import WayniKycFlow from "@/components/kyc/WayniKycFlow";

const KycUpload = () => {
  const { caseId = "" } = useParams<{ caseId: string }>();

  return <WayniKycFlow caseId={caseId} brandLabel="IOL" />;
};

export default KycUpload;
