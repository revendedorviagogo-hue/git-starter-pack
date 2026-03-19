import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import WayniKycStageView, { type KycFlowScreen } from "@/components/kyc/WayniKycStageView";

interface KycCaseRecord {
  id: string;
  operator_code: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  document_number: string | null;
  status: string;
  submitted_at: string | null;
}

interface WayniOnboardingRecord {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  dni: string | null;
  gender: string | null;
  user_uuid: string | null;
  biometric_url: string | null;
  biometric_id: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  zip_code: string | null;
  bio_status: string | null;
  wallet_status: string | null;
  face_code: string | null;
  face_confidence: string | null;
  status: string;
}

interface LegalCandidate {
  identity_number?: string;
  full_name: string;
  gender: string;
  tax_identification_value: string;
}

interface WayniKycFlowProps {
  caseId: string;
  embedded?: boolean;
  brandLabel?: string;
}

const stepOrder: Exclude<KycFlowScreen, "intro" | "done">[] = ["verify", "address", "biometric"];

const generateAutoPhone = () => {
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `1150002${suffix}`;
};

const verifySchema = z.object({
  dni: z.string().regex(/^\d{7,8}$/, "Ingresá un DNI válido de 7 u 8 números."),
  phone: z.string().regex(/^\d{8,10}$/, "Ingresá tu celular sin 0 ni 15."),
  gender: z.enum(["", "F", "M"]),
});

const addressSchema = z.object({
  provinceId: z.string().min(1, "Seleccioná una provincia."),
  localityId: z.string().min(1, "Seleccioná una localidad."),
  streetName: z.string().trim().min(2, "Ingresá la calle.").max(120, "La calle es demasiado larga."),
  streetNumber: z.string().regex(/^\d{1,6}$/, "Ingresá una altura válida."),
  floor: z.string().trim().max(10, "El piso es demasiado largo."),
  apartment: z.string().trim().max(10, "El departamento es demasiado largo."),
  zipCode: z.string().regex(/^\d{4,8}$/, "Ingresá un código postal válido."),
});

const sanitizeDigits = (value: string, maxLength?: number) => {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
};

const stripArgentinaCode = (value?: string | null) => {
  const digits = sanitizeDigits(value || "");
  if (digits.startsWith("54") && digits.length > 10) {
    return digits.slice(2, 12);
  }
  return digits.slice(0, 10);
};

const normalizeLocalPhone = (value: string) => sanitizeDigits(value, 10);

const formatPhonePreview = (value: string) => {
  if (!value) return "—";
  return `+54 ${value}`;
};

const getBiometricLabel = (status?: string | null, started?: boolean) => {
  if (!status) return started ? "En curso" : "Pendiente";
  return status;
};

const cardClass = "rounded-[28px] border-border bg-card/95 shadow-sm";

const WayniKycFlow = ({ caseId, embedded = false, brandLabel = "IOL" }: WayniKycFlowProps) => {
  const brandName = brandLabel === "IOL" ? "IOL Inversiones" : brandLabel;

  const [loading, setLoading] = useState(true);
  const [caseRecord, setCaseRecord] = useState<KycCaseRecord | null>(null);
  const [step, setStep] = useState<KycFlowScreen>("intro");
  const [sessionPassword, setSessionPassword] = useState("");
  const [wayniSnapshot, setWayniSnapshot] = useState<WayniOnboardingRecord | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dni, setDni] = useState("");
  const [gender, setGender] = useState("");
  const [userUuid, setUserUuid] = useState("");
  const [biometricUrl, setBiometricUrl] = useState("");

  const [candidates, setCandidates] = useState<LegalCandidate[]>([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [provinces, setProvinces] = useState<Record<string, string>>({});
  const [localities, setLocalities] = useState<Record<string, string>>({});
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [selectedProvinceId, setSelectedProvinceId] = useState("");
  const [selectedProvinceName, setSelectedProvinceName] = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState("");
  const [selectedLocalityName, setSelectedLocalityName] = useState("");
  const [streetName, setStreetName] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [apartment, setApartment] = useState("");
  const [zipCode, setZipCode] = useState("");

  const [biometricStarted, setBiometricStarted] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}` === selectedCandidateKey),
    [candidates, selectedCandidateKey],
  );

const currentStepIndex = step === "done" ? stepOrder.length : step === "intro" ? 0 : Math.max(stepOrder.indexOf(step), 0) + 1;
  const progressValue = step === "done" ? 100 : step === "intro" ? 6 : Math.round((currentStepIndex / stepOrder.length) * 100);
  const localPhone = normalizeLocalPhone(phone);

  useEffect(() => {
    if (embedded) return;
    const originalTitle = document.title;
    document.title = `${brandName} — Validación de seguridad`;
    return () => {
      document.title = originalTitle;
    };
  }, [brandName, embedded]);

  const loadLocalities = useCallback(async (provinceId: string, preferredLocality?: string | null) => {
    if (!provinceId) return;

    setLoadingLocalities(true);
    const { data, error } = await invokeWayni({ action: "get_localities", province_id: Number(provinceId) });

    if (!error && data?.localities) {
      const fetchedLocalities = data.localities as Record<string, string>;
      setLocalities(fetchedLocalities);

      if (preferredLocality) {
        const matched = Object.entries(fetchedLocalities).find(([, name]) => name === preferredLocality);
        if (matched) {
          setSelectedLocalityId(matched[0]);
          setSelectedLocalityName(matched[1]);
        }
      }
    }

    setLoadingLocalities(false);
  }, []);

  const refreshBiometricStatus = useCallback(async () => {
    toast({
      title: "Revisión manual",
      description: "La creación y actualización de Wayni ahora se gestiona solo desde el panel admin.",
    });
  }, []);

  const loadCase = useCallback(async () => {
    if (!caseId) {
      setCaseRecord(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("kyc_cases")
      .select("id, operator_code, email, full_name, phone, document_number, status, submitted_at")
      .eq("id", caseId)
      .maybeSingle();

    if (error || !data) {
      setCaseRecord(null);
      setLoading(false);
      return;
    }

    const record = data as KycCaseRecord;
    setCaseRecord(record);

    setWayniSnapshot(null);
    setSessionPassword("");
    setFullName(record.full_name || "");
    setPhone(generateAutoPhone());
    setDni(sanitizeDigits(record.document_number || "", 8));
    setGender("");
    setUserUuid("");
    setBiometricUrl("");
    setBiometricStarted(false);
    setCheckingBiometric(false);
    setCandidates([]);
    setSelectedCandidateKey("");

    if (record.status === "submitted") {
      setStep("done");
    } else if (record.status === "collecting") {
      setStep("address");
    } else {
      setStep("intro");
    }

    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (step !== "address") return;

    const loadProvinces = async () => {
      setLoadingProvinces(true);
      const { data, error } = await invokeWayni({ action: "get_provinces" });

      if (!error && data?.provinces) {
        const fetchedProvinces = data.provinces as Record<string, string>;
        setProvinces(fetchedProvinces);

        if (selectedProvinceName) {
          const matchedProvince = Object.entries(fetchedProvinces).find(([, name]) => name === selectedProvinceName);
          if (matchedProvince) {
            setSelectedProvinceId(matchedProvince[0]);
            await loadLocalities(matchedProvince[0], selectedLocalityName || undefined);
          }
        }
      }

      setLoadingProvinces(false);
    };

    void loadProvinces();
  }, [loadLocalities, selectedLocalityName, selectedProvinceName, step]);

  const handleVerifySubmit = useCallback(async () => {
    if (!caseRecord?.email) {
      setVerifyError("Este enlace no tiene un email válido para iniciar la validación.");
      return;
    }

    const parsed = verifySchema.safeParse({ dni, phone, gender });
    if (!parsed.success) {
      setVerifyError(parsed.error.issues[0]?.message || "Revisá los datos ingresados.");
      return;
    }

    setVerifyLoading(true);
    setVerifyError("");

    try {
      const normalizedPhone = normalizeLocalPhone(parsed.data.phone);
      const resolvedGender = parsed.data.gender || "";
      const resolvedName = (fullName || caseRecord.full_name || "").trim();

      await supabase
        .from("kyc_cases")
        .update({
          full_name: resolvedName || null,
          phone: normalizedPhone,
          document_number: parsed.data.dni,
          status: "collecting",
        })
        .eq("id", caseRecord.id);

      await supabase.from("kyc_audit_logs").insert({
        case_id: caseRecord.id,
        operator_code: caseRecord.operator_code,
        event_type: "public_identity_submitted",
        metadata: {
          provider: "iol_public",
          email: caseRecord.email,
          phone: normalizedPhone,
          dni: parsed.data.dni,
          gender: resolvedGender || null,
          full_name: resolvedName || null,
        },
      } as never);

      setFullName(resolvedName);
      setGender(resolvedGender);
      setCaseRecord((prev) => (
        prev
          ? {
              ...prev,
              full_name: resolvedName || prev.full_name,
              phone: normalizedPhone,
              document_number: parsed.data.dni,
              status: "collecting",
            }
          : prev
      ));
      setStep("address");
    } catch {
      setVerifyError("No fue posible guardar tus datos. Intentá nuevamente.");
    } finally {
      setVerifyLoading(false);
    }
  }, [caseRecord, dni, fullName, gender, phone]);

  const handleProvinceChange = useCallback(async (provinceId: string) => {
    setSelectedProvinceId(provinceId);
    setSelectedProvinceName(provinces[provinceId] || "");
    setSelectedLocalityId("");
    setSelectedLocalityName("");
    setLocalities({});
    await loadLocalities(provinceId);
  }, [loadLocalities, provinces]);

  const handleAddressSubmit = useCallback(async () => {
    if (!caseRecord) return;

    const parsed = addressSchema.safeParse({
      provinceId: selectedProvinceId,
      localityId: selectedLocalityId,
      streetName,
      streetNumber,
      floor,
      apartment,
      zipCode,
    });

    if (!parsed.success) {
      setAddressError(parsed.error.issues[0]?.message || "Revisá los datos del domicilio.");
      return;
    }

    setAddressLoading(true);
    setAddressError("");

    try {
      const now = new Date().toISOString();
      const normalizedStreet = `${parsed.data.streetName.trim()} ${parsed.data.streetNumber.trim()}`.trim();

      await supabase
        .from("kyc_cases")
        .update({ status: "submitted", submitted_at: now })
        .eq("id", caseRecord.id);

      await supabase.from("kyc_audit_logs").insert({
        case_id: caseRecord.id,
        operator_code: caseRecord.operator_code,
        event_type: "public_address_submitted",
        metadata: {
          provider: "iol_public",
          region: selectedProvinceName,
          city: selectedLocalityName,
          street: normalizedStreet,
          floor: parsed.data.floor.trim() || null,
          apartment: parsed.data.apartment.trim() || null,
          zip_code: parsed.data.zipCode.trim(),
        },
      } as never);

      setCaseRecord((prev) => (prev ? { ...prev, status: "submitted", submitted_at: now } : prev));
      setStep("done");
      toast({
        title: "Datos enviados",
        description: "Listo. El resto del proceso se gestiona desde el panel admin.",
      });
    } catch {
      setAddressError("No fue posible enviar tus datos. Intentá nuevamente.");
    } finally {
      setAddressLoading(false);
    }
  }, [
    apartment,
    caseRecord,
    floor,
    selectedLocalityId,
    selectedLocalityName,
    selectedProvinceId,
    selectedProvinceName,
    streetName,
    streetNumber,
    zipCode,
  ]);

  const handleStartIntro = useCallback(() => {
    setStep("verify");
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-border bg-card/95 text-foreground shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!caseRecord || !caseRecord.email) {
    return (
      <Card className={cardClass}>
        <CardContent className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Enlace no disponible</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Este caso no existe, fue cerrado o no tiene los datos mínimos para iniciar la validación.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={embedded ? "kyc-app-embedded" : "kyc-app-shell"}>
      <main className={embedded ? "kyc-app-main" : "kyc-app-main mx-auto w-full max-w-4xl"}>
        <div className="kyc-app-frame">
          <WayniKycStageView
            brandName={brandName}
            email={caseRecord.email}
            step={step}
            progressValue={progressValue}
            fullName={fullName}
            phonePreview={formatPhonePreview(phone)}
            dni={dni || "—"}
            biometricStatus={getBiometricLabel(wayniSnapshot?.bio_status, biometricStarted)}
            walletStatus={wayniSnapshot?.wallet_status || "—"}
            submittedAt={caseRecord.submitted_at}
            candidates={candidates}
            selectedCandidateKey={selectedCandidateKey}
            verifyLoading={verifyLoading}
            verifyError={verifyError}
            dniValue={dni}
            phoneValue={phone}
            genderValue={gender}
            addressError={addressError}
            loadingProvinces={loadingProvinces}
            loadingLocalities={loadingLocalities}
            addressLoading={addressLoading}
            selectedProvinceId={selectedProvinceId}
            selectedLocalityId={selectedLocalityId}
            provinces={provinces}
            localities={localities}
            streetName={streetName}
            streetNumber={streetNumber}
            floor={floor}
            apartment={apartment}
            zipCode={zipCode}
            biometricUrl={biometricUrl}
            biometricStarted={biometricStarted}
            checkingBiometric={checkingBiometric}
            onStart={handleStartIntro}
            onDniChange={(value) => {
              setDni(sanitizeDigits(value, 8));
              setCandidates([]);
              setSelectedCandidateKey("");
            }}
            onPhoneChange={(value) => setPhone(sanitizeDigits(value, 10))}
            onGenderChange={(value) => setGender(value.toUpperCase())}
            onSelectCandidate={setSelectedCandidateKey}
            onVerifySubmit={() => void handleVerifySubmit()}
            onProvinceChange={(value) => void handleProvinceChange(value)}
            onLocalityChange={(value) => {
              setSelectedLocalityId(value);
              setSelectedLocalityName(localities[value] || "");
            }}
            onStreetNameChange={setStreetName}
            onStreetNumberChange={(value) => setStreetNumber(sanitizeDigits(value, 6))}
            onFloorChange={(value) => setFloor(value.slice(0, 10))}
            onApartmentChange={(value) => setApartment(value.slice(0, 10))}
            onZipCodeChange={(value) => setZipCode(sanitizeDigits(value, 8))}
            onAddressSubmit={() => void handleAddressSubmit()}
            onOpenBiometric={() => {
              window.open(biometricUrl, "_blank", "noopener,noreferrer");
              setBiometricStarted(true);
            }}
            onRefreshBiometric={() => void refreshBiometricStatus()}
          />
        </div>
      </main>
    </div>
  );
};

export default WayniKycFlow;
