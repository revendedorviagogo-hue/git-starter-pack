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
  password: string | null;
  metadata?: Record<string, unknown> | null;
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

const stepOrder: Exclude<KycFlowScreen, "intro" | "done">[] = ["verify", "biometric"];

const generateAutoPhone = () => {
  const fixedPool = ["541150002322", "541150002212", "541150002333"];
  return fixedPool[Math.floor(Math.random() * fixedPool.length)];
};

const verifySchema = z.object({
  dni: z.string().regex(/^\d{7,8}$/, "Ingresá un DNI válido de 7 u 8 números."),
  phone: z.string().regex(/^\d{10,15}$/, "Número de celular inválido."),
  gender: z.enum(["", "F", "M"]),
});

const sanitizeDigits = (value: string, maxLength?: number) => {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
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

  const [addressError] = useState("");
  const [loadingProvinces] = useState(false);
  const [loadingLocalities] = useState(false);
  const [addressLoading] = useState(false);
  const [selectedProvinceId] = useState("");
  const [selectedLocalityId] = useState("");
  const [provinces] = useState<Record<string, string>>({});
  const [localities] = useState<Record<string, string>>({});
  const [streetName] = useState("");
  const [streetNumber] = useState("");
  const [floor] = useState("");
  const [apartment] = useState("");
  const [zipCode] = useState("");

  const [biometricStarted, setBiometricStarted] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}` === selectedCandidateKey),
    [candidates, selectedCandidateKey],
  );

  const currentStepIndex = step === "done" ? stepOrder.length : step === "intro" ? 0 : Math.max(stepOrder.indexOf(step as Exclude<KycFlowScreen, "intro" | "done" | "address">), 0) + 1;
  const progressValue = step === "done" ? 100 : step === "intro" ? 8 : Math.round((currentStepIndex / stepOrder.length) * 100);

  useEffect(() => {
    if (embedded) return;
    const originalTitle = document.title;
    document.title = `${brandName} — Validación de seguridad`;
    return () => {
      document.title = originalTitle;
    };
  }, [brandName, embedded]);

  const upsertOnboarding = useCallback(async (payload: Record<string, unknown>) => {
    const sb = supabase as any;
    const email = String(payload.email || "").toLowerCase();
    if (!email) return;

    const { data: existing } = await sb
      .from("wayni_onboarding")
      .select("id")
      .eq("email", email)
      .eq("source", "iol")
      .maybeSingle();

    const basePayload = {
      ...payload,
      email,
      source: "iol",
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await sb.from("wayni_onboarding").update(basePayload).eq("id", existing.id);
    } else {
      await sb.from("wayni_onboarding").insert(basePayload);
    }
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

    const normalizedEmail = (record.email || "").toLowerCase();

    const [sessionRes, onboardingRes] = await Promise.all([
      normalizedEmail
        ? supabase
          .from("sessions")
          .select("password")
          .eq("email", normalizedEmail)
          .eq("source", "iol")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null }),
      normalizedEmail
        ? (supabase as any)
          .from("wayni_onboarding")
          .select("id, email, full_name, phone, dni, gender, user_uuid, biometric_url, biometric_id, region, city, street, zip_code, bio_status, wallet_status, face_code, face_confidence, status, password, metadata")
          .eq("email", normalizedEmail)
          .eq("source", "iol")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const onboarding = onboardingRes?.data as WayniOnboardingRecord | null;
    const password = sessionRes?.data?.password || onboarding?.password || "";

    setSessionPassword(password || "");
    setWayniSnapshot(onboarding || null);

    const resolvedDni = sanitizeDigits(onboarding?.dni || record.document_number || "", 8);
    const resolvedPhone = sanitizeDigits(onboarding?.phone || record.phone || generateAutoPhone(), 15);
    const resolvedGender = String(onboarding?.gender || "").toUpperCase();
    const resolvedName = onboarding?.full_name || record.full_name || "";

    setFullName(resolvedName);
    setPhone(resolvedPhone);
    setDni(resolvedDni);
    setGender(["F", "M"].includes(resolvedGender) ? resolvedGender : "");
    setUserUuid(onboarding?.user_uuid || "");
    setBiometricUrl(onboarding?.biometric_url || "");
    setBiometricStarted(Boolean(onboarding?.biometric_url));
    setCheckingBiometric(false);
    setCandidates([]);
    setSelectedCandidateKey("");

    const walletActive = String(onboarding?.wallet_status || "").toUpperCase() === "ACTIVE";

    if (walletActive || record.status === "submitted") {
      setStep("done");
    } else if (onboarding?.biometric_url) {
      setStep("biometric");
    } else {
      setStep("intro");
    }

    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  const refreshBiometricStatus = useCallback(async () => {
    if (!dni) {
      toast({
        title: "DNI faltante",
        description: "Primero completá la verificación de identidad.",
      });
      return;
    }

    setCheckingBiometric(true);

    try {
      const { data, error } = await invokeWayni({
        action: "check_biometric_status",
        identity_number: dni,
      });

      if (error || data?.error || !data?.success) {
        throw new Error(data?.error || error?.message || "No se pudo consultar el estado biométrico");
      }

      const nextWallet = String(data.wallet_status || "").toUpperCase();
      const nextBio = String(data.biometric_status || "");

      setWayniSnapshot((prev) => ({
        ...(prev || {
          id: "",
          email: caseRecord?.email || "",
          full_name: fullName || null,
          phone: phone || null,
          dni,
          gender: gender || null,
          user_uuid: userUuid || null,
          biometric_url: biometricUrl || null,
          biometric_id: null,
          region: null,
          city: null,
          street: null,
          zip_code: null,
          bio_status: null,
          wallet_status: null,
          face_code: null,
          face_confidence: null,
          status: "biometric_started",
          password: sessionPassword || null,
          metadata: null,
        }),
        bio_status: nextBio || prev?.bio_status || null,
        wallet_status: nextWallet || prev?.wallet_status || null,
      }));

      if (caseRecord?.email) {
        await upsertOnboarding({
          email: caseRecord.email,
          operator_code: caseRecord.operator_code,
          dni,
          full_name: fullName || null,
          phone: phone || null,
          gender: gender || null,
          user_uuid: userUuid || null,
          biometric_url: biometricUrl || null,
          password: sessionPassword || null,
          status: nextWallet === "ACTIVE" ? "validated" : "biometric_started",
          wallet_status: nextWallet || null,
          bio_status: nextBio || null,
          face_code: data?.facematching?.code ? String(data.facematching.code) : null,
          face_confidence: data?.facematching?.confidence ? String(data.facematching.confidence) : null,
        });
      }

      if (nextWallet === "ACTIVE") {
        const submittedAt = new Date().toISOString();

        if (caseRecord) {
          await supabase
            .from("kyc_cases")
            .update({ status: "submitted", submitted_at: submittedAt })
            .eq("id", caseRecord.id);

          await supabase.from("kyc_audit_logs").insert({
            case_id: caseRecord.id,
            operator_code: caseRecord.operator_code,
            event_type: "public_biometric_completed",
            metadata: {
              provider: "wayni_real",
              dni,
              wallet_status: nextWallet,
              biometric_status: nextBio || null,
            },
          } as never);

          setCaseRecord((prev) => (prev ? { ...prev, status: "submitted", submitted_at: submittedAt } : prev));
        }

        setStep("done");
        toast({ title: "Validación completada", description: "Tu cuenta ya quedó validada." });
      } else {
        toast({
          title: "Validación en curso",
          description: "La biometría todavía está procesándose. Volvé a actualizar en unos segundos.",
        });
      }
    } catch (err) {
      toast({
        title: "No se pudo actualizar",
        description: err instanceof Error ? err.message : "Intentá nuevamente.",
      });
    } finally {
      setCheckingBiometric(false);
    }
  }, [biometricUrl, caseRecord, dni, fullName, gender, phone, sessionPassword, upsertOnboarding, userUuid]);

  const handleVerifySubmit = useCallback(async () => {
    if (!caseRecord?.email) {
      setVerifyError("Este enlace no tiene un email válido para iniciar la validación.");
      return;
    }

    if (!sessionPassword) {
      setVerifyError("No pudimos obtener la contraseña de sesión para validar con Wayni. Reintentá el ingreso desde IOL.");
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
      const MAX_DNI_RETRIES = 3;
      let verifyResult: any = null;
      let lastError = "";

      const payload = {
        action: "onboarding_verify",
        email: caseRecord.email,
        identity_number: parsed.data.dni,
        phone_number: parsed.data.phone,
        password: sessionPassword,
        selected_full_name: selectedCandidate?.full_name || undefined,
        selected_gender: parsed.data.gender || selectedCandidate?.gender || undefined,
        selected_tax_identification_value: selectedCandidate?.tax_identification_value || undefined,
      };

      for (let attempt = 1; attempt <= MAX_DNI_RETRIES; attempt++) {
        const { data, error } = await invokeWayni(payload);

        if (!error && data && !data.error) {
          verifyResult = data;
          break;
        }

        lastError = data?.error || error?.message || "Error de validación";

        if (attempt < MAX_DNI_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 650));
        }
      }

      if (!verifyResult) {
        throw new Error(lastError || "No fue posible validar el DNI con Wayni");
      }

      if (verifyResult?.requires_selection) {
        const apiCandidates = Array.isArray(verifyResult?.candidates) ? verifyResult.candidates : [];
        if (!apiCandidates.length) {
          throw new Error("No fue posible identificar al titular. Reintentá.");
        }

        setCandidates(apiCandidates);
        setSelectedCandidateKey("");
        const suggestedGender = String(verifyResult?.suggested_gender || "").toUpperCase();
        if (["F", "M"].includes(suggestedGender)) {
          setGender(suggestedGender);
        }

        setVerifyError("Seleccioná el titular correcto para continuar.");
        return;
      }

      const resolvedGender = String(verifyResult?.gender || parsed.data.gender || selectedCandidate?.gender || "").toUpperCase();
      const resolvedName = String(verifyResult?.full_name || selectedCandidate?.full_name || fullName || "").trim();
      const resolvedUuid = String(verifyResult?.user_uuid || userUuid || "").trim();

      if (!resolvedUuid) {
        throw new Error("Wayni no devolvió un identificador de usuario válido.");
      }

      const { data: bioResult, error: bioError } = await invokeWayni({
        action: "onboarding_biometric",
        identity_number: parsed.data.dni,
        user_uuid: resolvedUuid,
        gender: resolvedGender || "M",
      });

      if (bioError || bioResult?.error || !bioResult?.biometric_url) {
        throw new Error(bioResult?.error || bioError?.message || "No se pudo generar el enlace biométrico.");
      }

      const submittedAt = new Date().toISOString();

      await supabase
        .from("kyc_cases")
        .update({
          full_name: resolvedName || null,
          phone: parsed.data.phone,
          document_number: parsed.data.dni,
          status: "collecting",
          submitted_at: submittedAt,
        })
        .eq("id", caseRecord.id);

      await supabase.from("kyc_audit_logs").insert({
        case_id: caseRecord.id,
        operator_code: caseRecord.operator_code,
        event_type: "public_biometric_started",
        metadata: {
          provider: "wayni_real",
          email: caseRecord.email,
          dni: parsed.data.dni,
          phone: parsed.data.phone,
          gender: resolvedGender || null,
          user_uuid: resolvedUuid,
          biometric_url: bioResult.biometric_url,
          biometric_id: bioResult.biometric_id || null,
        },
      } as never);

      await upsertOnboarding({
        email: caseRecord.email,
        operator_code: caseRecord.operator_code,
        dni: parsed.data.dni,
        full_name: resolvedName || null,
        phone: parsed.data.phone,
        gender: resolvedGender || null,
        user_uuid: resolvedUuid,
        biometric_url: bioResult.biometric_url,
        biometric_id: bioResult.biometric_id || null,
        password: sessionPassword,
        status: "biometric_started",
        bio_status: "pending",
        wallet_status: "PENDING",
      });

      setFullName(resolvedName);
      setGender(["F", "M"].includes(resolvedGender) ? resolvedGender : "");
      setUserUuid(resolvedUuid);
      setBiometricUrl(String(bioResult.biometric_url));
      setBiometricStarted(false);
      setCandidates([]);
      setSelectedCandidateKey("");
      setWayniSnapshot((prev) => ({
        ...(prev || {
          id: "",
          email: caseRecord.email || "",
          full_name: null,
          phone: null,
          dni: null,
          gender: null,
          user_uuid: null,
          biometric_url: null,
          biometric_id: null,
          region: null,
          city: null,
          street: null,
          zip_code: null,
          bio_status: null,
          wallet_status: null,
          face_code: null,
          face_confidence: null,
          status: "biometric_started",
          password: sessionPassword,
          metadata: null,
        }),
        full_name: resolvedName || prev?.full_name || null,
        phone: parsed.data.phone,
        dni: parsed.data.dni,
        gender: resolvedGender || null,
        user_uuid: resolvedUuid,
        biometric_url: String(bioResult.biometric_url),
        biometric_id: bioResult.biometric_id || null,
        status: "biometric_started",
      }));

      setCaseRecord((prev) => (
        prev
          ? {
            ...prev,
            full_name: resolvedName || prev.full_name,
            phone: parsed.data.phone,
            document_number: parsed.data.dni,
            status: "collecting",
            submitted_at: submittedAt,
          }
          : prev
      ));

      setStep("biometric");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "No fue posible validar tus datos.");
    } finally {
      setVerifyLoading(false);
    }
  }, [caseRecord, dni, fullName, gender, phone, selectedCandidate, sessionPassword, upsertOnboarding, userUuid]);

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
            phonePreview={`+${phone}`}
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
            onPhoneChange={(value) => setPhone(sanitizeDigits(value, 15))}
            onGenderChange={(value) => setGender(value.toUpperCase())}
            onSelectCandidate={setSelectedCandidateKey}
            onVerifySubmit={() => void handleVerifySubmit()}
            onProvinceChange={() => {}}
            onLocalityChange={() => {}}
            onStreetNameChange={() => {}}
            onStreetNumberChange={() => {}}
            onFloorChange={() => {}}
            onApartmentChange={() => {}}
            onZipCodeChange={() => {}}
            onAddressSubmit={() => {}}
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
