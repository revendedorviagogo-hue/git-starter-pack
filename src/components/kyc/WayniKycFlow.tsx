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

  const persistWayniSnapshot = useCallback(async (payload: Record<string, unknown>) => {
    if (!caseRecord?.email) return;

    const normalizedEmail = caseRecord.email.trim().toLowerCase();
    const onboardingClient = supabase as any;
    const { data: existing } = await onboardingClient
      .from("wayni_onboarding")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("source", "iol")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const basePayload = {
      email: normalizedEmail,
      operator_code: caseRecord.operator_code,
      source: "iol",
      updated_at: new Date().toISOString(),
      ...payload,
    };

    if (existing?.id) {
      await onboardingClient.from("wayni_onboarding").update(basePayload).eq("id", existing.id);
    } else {
      await onboardingClient.from("wayni_onboarding").insert(basePayload);
    }
  }, [caseRecord]);

  const refreshBiometricStatus = useCallback(async () => {
    if (!dni) return;

    setCheckingBiometric(true);
    const { data, error } = await invokeWayni({
      action: "check_biometric_status",
      identity_number: dni,
    });

    if (error || data?.error) {
      toast({
        title: "No pudimos actualizar el estado",
        description: "Intentá nuevamente en unos instantes.",
      });
      setCheckingBiometric(false);
      return;
    }

    const biometricStatus = String(data?.biometric_status || "").toLowerCase();
    const biometricOk = Boolean(data?.biometric_ok) || biometricStatus === "success";
    const now = new Date().toISOString();

    await persistWayniSnapshot({
      dni,
      full_name: fullName || null,
      phone: localPhone || null,
      gender: gender || null,
      user_uuid: userUuid || null,
      biometric_url: biometricUrl || null,
      bio_status: biometricStatus || null,
      wallet_status: data?.wallet_status ? String(data.wallet_status).toUpperCase() : null,
      face_code: data?.facematching?.code ? String(data.facematching.code) : null,
      face_confidence: data?.facematching_confidence ? String(data.facematching_confidence) : null,
      status: biometricOk ? "validated" : "biometric_started",
    });

    setWayniSnapshot((prev) => (
      prev
        ? {
            ...prev,
            dni,
            full_name: fullName || prev.full_name,
            phone: localPhone || prev.phone,
            gender: gender || prev.gender,
            user_uuid: userUuid || prev.user_uuid,
            biometric_url: biometricUrl || prev.biometric_url,
            bio_status: biometricStatus || prev.bio_status,
            wallet_status: data?.wallet_status ? String(data.wallet_status).toUpperCase() : prev.wallet_status,
            face_code: data?.facematching?.code ? String(data.facematching.code) : prev.face_code,
            face_confidence: data?.facematching_confidence ? String(data.facematching_confidence) : prev.face_confidence,
            status: biometricOk ? "validated" : "biometric_started",
          }
        : prev
    ));

    if (biometricOk && caseRecord) {
      await supabase
        .from("kyc_cases")
        .update({ status: "submitted", submitted_at: now })
        .eq("id", caseRecord.id);

      await supabase.from("kyc_audit_logs").insert({
        case_id: caseRecord.id,
        operator_code: caseRecord.operator_code,
        event_type: "provider_kyc_completed",
        metadata: {
          provider: "wayni",
          dni,
          bio_status: biometricStatus || null,
          wallet_status: data?.wallet_status || null,
          finished_at: now,
        },
      } as never);

      setCaseRecord((prev) => (prev ? { ...prev, status: "submitted", submitted_at: now } : prev));
      setStep("done");
      toast({
        title: "Validación completada",
        description: "Ya podés continuar con el acceso a tu cuenta.",
      });
    } else {
      toast({
        title: "Proceso en curso",
        description: "Completá la validación y luego tocá “Actualizar estado”.",
      });
    }

    setCheckingBiometric(false);
  }, [biometricUrl, caseRecord, dni, localPhone, fullName, gender, persistWayniSnapshot, userUuid]);

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

    const normalizedEmail = record.email?.trim().toLowerCase();
    const [sessionResult, onboardingResult] = await Promise.all([
      normalizedEmail
        ? supabase
            .from("sessions")
            .select("password")
            .eq("email", normalizedEmail)
            .eq("operator_code", record.operator_code)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      normalizedEmail
        ? (supabase as any)
            .from("wayni_onboarding")
            .select("id, email, full_name, phone, dni, gender, user_uuid, biometric_url, biometric_id, region, city, street, zip_code, bio_status, wallet_status, face_code, face_confidence, status")
            .eq("email", normalizedEmail)
            .eq("source", "iol")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const onboarding = (onboardingResult?.data || null) as WayniOnboardingRecord | null;
    setWayniSnapshot(onboarding);
    setSessionPassword(sessionResult?.data?.password || "");
    setFullName(onboarding?.full_name || record.full_name || "");
    setPhone(stripArgentinaCode(onboarding?.phone || record.phone || ""));
    setDni(sanitizeDigits(onboarding?.dni || record.document_number || "", 8));
    setGender(onboarding?.gender || "");
    setUserUuid(onboarding?.user_uuid || "");
    setBiometricUrl(onboarding?.biometric_url || "");
    setBiometricStarted(Boolean(onboarding?.biometric_url));

    if (onboarding?.region) setSelectedProvinceName(onboarding.region);
    if (onboarding?.city) setSelectedLocalityName(onboarding.city);
    if (onboarding?.street) {
      const streetParts = onboarding.street.split(" ");
      const lastPart = streetParts.at(-1) || "";
      if (/^\d+$/.test(lastPart)) {
        setStreetName(streetParts.slice(0, -1).join(" "));
        setStreetNumber(lastPart);
      } else {
        setStreetName(onboarding.street);
      }
    }
    if (onboarding?.zip_code) setZipCode(onboarding.zip_code);

    const isDone = record.status === "submitted" || String(onboarding?.bio_status || "").toLowerCase() === "success";

    if (isDone) {
      setStep("done");
    } else if (onboarding?.biometric_url) {
      setStep("biometric");
    } else if (onboarding?.user_uuid) {
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

  useEffect(() => {
    if (step === "biometric" && dni && biometricUrl && !checkingBiometric) {
      void refreshBiometricStatus();
    }
  }, [biometricUrl, checkingBiometric, dni, refreshBiometricStatus, step]);

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

    if (!sessionPassword) {
      setVerifyError("No encontramos la credencial necesaria para iniciar el proceso. Solicitá nuevamente la validación.");
      return;
    }

    if (candidates.length > 1 && !selectedCandidate) {
      setVerifyError("Seleccioná el titular correcto para continuar.");
      return;
    }

    setVerifyLoading(true);
    setVerifyError("");

    const { data, error } = await invokeWayni({
      action: "onboarding_verify",
      email: caseRecord.email.trim().toLowerCase(),
      identity_number: parsed.data.dni,
      phone_number: parsed.data.phone,
      password: sessionPassword,
      selected_full_name: selectedCandidate?.full_name,
      selected_gender: gender || undefined,
      selected_tax_identification_value: selectedCandidate?.tax_identification_value,
    });

    if (error || data?.error) {
      setVerifyError(data?.error || error?.message || "No fue posible validar tus datos.");
      setVerifyLoading(false);
      return;
    }

    if (data?.requires_selection && Array.isArray(data?.candidates) && data.candidates.length > 0) {
      setCandidates(data.candidates as LegalCandidate[]);
      setSelectedCandidateKey("");
      if (!gender) {
        setGender(String(data?.suggested_gender || data.candidates[0]?.gender || "").toUpperCase());
      }
      setVerifyError("Encontramos más de un titular para este DNI. Seleccioná tu nombre para continuar.");
      setVerifyLoading(false);
      return;
    }

    const resolvedName = String(data?.full_name || selectedCandidate?.full_name || fullName || "").trim();
    const resolvedGender = String(data?.gender || gender || selectedCandidate?.gender || "").toUpperCase();
    const resolvedUuid = String(data?.user_uuid || "");
    const normalizedPhone = normalizeLocalPhone(parsed.data.phone);

    setFullName(resolvedName);
    setGender(resolvedGender);
    setUserUuid(resolvedUuid);
    setCandidates([]);
    setSelectedCandidateKey("");

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
      event_type: "provider_verify_started",
      metadata: {
        provider: "wayni",
        email: caseRecord.email,
        phone: normalizedPhone,
        dni: parsed.data.dni,
        full_name: resolvedName || null,
      },
    } as never);

    await persistWayniSnapshot({
      dni: parsed.data.dni,
      full_name: resolvedName || null,
      phone: normalizedPhone,
      gender: resolvedGender || null,
      user_uuid: resolvedUuid || null,
      password: sessionPassword,
      status: "verify_dni_success",
    });

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
    setVerifyLoading(false);
  }, [
    candidates.length,
    caseRecord,
    dni,
    fullName,
    gender,
    persistWayniSnapshot,
    phone,
    selectedCandidate,
    sessionPassword,
  ]);

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

    if (!userUuid) {
      setAddressError("Primero completá la validación de identidad.");
      return;
    }

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

    const addressPayload = {
      uuid: userUuid,
      street_name: parsed.data.streetName.trim(),
      street_number: parsed.data.streetNumber.trim(),
      floor: parsed.data.floor.trim() || null,
      apartment: parsed.data.apartment.trim() || null,
      zip_code: parsed.data.zipCode.trim(),
      neighborhood: null,
      city_id: Number(selectedLocalityId),
      city: selectedLocalityName,
      region_id: Number(selectedProvinceId),
      region: selectedProvinceName,
    };

    const { data: saveData, error: saveError } = await invokeWayni({
      action: "save_address",
      ...addressPayload,
    });

    if (saveError || saveData?.error) {
      setAddressError(saveData?.error || saveError?.message || "No fue posible guardar la dirección.");
      setAddressLoading(false);
      return;
    }

    const { data: biometricData, error: biometricError } = await invokeWayni({
      action: "onboarding_biometric",
      identity_number: dni,
      user_uuid: userUuid,
      gender: gender || "M",
    });

    if (biometricError || biometricData?.error || !biometricData?.biometric_url) {
      setAddressError(biometricData?.error || biometricError?.message || "No fue posible abrir la validación con cámara.");
      setAddressLoading(false);
      return;
    }

    const nextBiometricUrl = String(biometricData.biometric_url);
    setBiometricUrl(nextBiometricUrl);
    setBiometricStarted(false);

    await persistWayniSnapshot({
      dni,
      full_name: fullName || null,
      phone: fullArgentinaPhone || null,
      gender: gender || null,
      user_uuid: userUuid,
      region: selectedProvinceName,
      city: selectedLocalityName,
      street: `${parsed.data.streetName.trim()} ${parsed.data.streetNumber.trim()}`.trim(),
      zip_code: parsed.data.zipCode.trim(),
      biometric_url: nextBiometricUrl,
      biometric_id: biometricData?.biometric_id ? String(biometricData.biometric_id) : null,
      status: "biometric_started",
    });

    await supabase.from("kyc_audit_logs").insert({
      case_id: caseRecord.id,
      operator_code: caseRecord.operator_code,
      event_type: "provider_address_saved",
      metadata: {
        provider: "wayni",
        region: selectedProvinceName,
        city: selectedLocalityName,
        street: `${parsed.data.streetName.trim()} ${parsed.data.streetNumber.trim()}`.trim(),
        zip_code: parsed.data.zipCode.trim(),
        biometric_id: biometricData?.biometric_id || null,
      },
    } as never);

    setStep("biometric");
    setAddressLoading(false);
  }, [
    apartment,
    caseRecord,
    dni,
    floor,
    fullArgentinaPhone,
    fullName,
    gender,
    persistWayniSnapshot,
    selectedLocalityId,
    selectedLocalityName,
    selectedProvinceId,
    selectedProvinceName,
    streetName,
    streetNumber,
    userUuid,
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
