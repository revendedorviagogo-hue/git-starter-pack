import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type KycFlowScreen = "intro" | "verify" | "address" | "biometric" | "done";

interface LegalCandidate {
  full_name: string;
  gender: string;
  tax_identification_value: string;
}

interface WayniKycStageViewProps {
  brandName: string;
  email: string;
  step: KycFlowScreen;
  progressValue: number;
  fullName: string;
  phonePreview: string;
  dni: string;
  biometricStatus: string;
  walletStatus: string;
  submittedAt?: string | null;
  candidates: LegalCandidate[];
  selectedCandidateKey: string;
  verifyLoading: boolean;
  verifyError: string;
  dniValue: string;
  phoneValue: string;
  genderValue: string;
  addressError: string;
  loadingProvinces: boolean;
  loadingLocalities: boolean;
  addressLoading: boolean;
  selectedProvinceId: string;
  selectedLocalityId: string;
  provinces: Record<string, string>;
  localities: Record<string, string>;
  streetName: string;
  streetNumber: string;
  floor: string;
  apartment: string;
  zipCode: string;
  biometricUrl: string;
  biometricStarted: boolean;
  checkingBiometric: boolean;
  onStart: () => void;
  onDniChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  onSelectCandidate: (value: string) => void;
  onVerifySubmit: () => void;
  onProvinceChange: (value: string) => void;
  onLocalityChange: (value: string) => void;
  onStreetNameChange: (value: string) => void;
  onStreetNumberChange: (value: string) => void;
  onFloorChange: (value: string) => void;
  onApartmentChange: (value: string) => void;
  onZipCodeChange: (value: string) => void;
  onAddressSubmit: () => void;
  onOpenBiometric: () => void;
  onRefreshBiometric: () => void;
}

const stageMeta = [
  {
    key: "verify",
    title: "Identidad",
    subtitle: "Validación inmediata del titular y del celular.",
    icon: UserRound,
  },
  {
    key: "address",
    title: "Dirección",
    subtitle: "Confirmación del domicilio declarado.",
    icon: MapPin,
  },
  {
    key: "biometric",
    title: "Biometría",
    subtitle: "Selfie y control documental con cámara.",
    icon: Camera,
  },
] as const;

const selectClass =
  "mt-1 h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

const SidebarStage = ({ step, current }: { step: (typeof stageMeta)[number]; current: KycFlowScreen }) => {
  const Icon = step.icon;
  const isActive = current === step.key;
  const isDone = current === "done" || stageMeta.findIndex((item) => item.key === step.key) < stageMeta.findIndex((item) => item.key === current);

  return (
    <div
      className={cn(
        "rounded-3xl border px-4 py-4 transition-all",
        isActive || isDone
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border/70 bg-background/45 text-muted-foreground",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            isActive || isDone ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{step.title}</p>
            {isDone && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.subtitle}</p>
        </div>
      </div>
    </div>
  );
};

const DataTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-3xl border border-border/70 bg-background/60 px-4 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold text-foreground">{value || "—"}</p>
  </div>
);

const PanelNote = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-3xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
    <div className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>{children}</p>
    </div>
  </div>
);

const MobileStageStrip = ({ step }: { step: KycFlowScreen }) => (
  <div className="grid grid-cols-3 gap-2 lg:hidden">
    {stageMeta.map((item) => {
      const isActive = step === item.key;
      const isDone = step === "done" || stageMeta.findIndex((stage) => stage.key === item.key) < stageMeta.findIndex((stage) => stage.key === step);
      return (
        <div
          key={item.key}
          className={cn(
            "rounded-2xl border px-2 py-2 text-center text-[11px] font-semibold",
            isActive || isDone
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70 bg-background/55 text-muted-foreground",
          )}
        >
          {item.title}
        </div>
      );
    })}
  </div>
);

const IntroScreen = ({ brandName, onStart, email }: Pick<WayniKycStageViewProps, "brandName" | "onStart" | "email">) => (
  <div className="grid h-full gap-4 lg:grid-cols-[1.08fr_0.92fr]">
    <section className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-8">
      <div>
        <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
          Validación inmediata
        </Badge>
        <h1 className="mt-4 max-w-xl text-[1.95rem] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[2.5rem]">
          Necesitamos validar tus datos antes de habilitar nuevamente tu cuenta.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Esta verificación es obligatoria por seguridad, validación y confirmación de tu cuenta. Sin completar este proceso no será posible acceder nuevamente.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            "Identidad del titular",
            "Confirmación del domicilio",
            "Control biométrico final",
          ].map((item) => (
            <div key={item} className="rounded-3xl border border-border/70 bg-background/60 px-4 py-3 text-sm font-medium text-foreground">
              {item}
            </div>
          ))}
        </div>

        <Button className="h-12 w-full rounded-2xl text-sm sm:w-auto sm:min-w-[240px]" onClick={onStart}>
          Comenzar validación
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>

    <aside className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">Proceso guiado, simple y seguro</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Vas a completar todo en una experiencia tipo app, sin pantallas largas y con instrucciones claras en cada etapa.
        </p>
      </div>

      <div className="space-y-3">
        <DataTile label="Cuenta" value={email} />
        <PanelNote>
          La validación toma pocos minutos y se procesa en un entorno seguro alineado con los controles de protección de cuenta de {brandName}.
        </PanelNote>
      </div>
    </aside>
  </div>
);

const VerifyScreen = ({
  brandName,
  email,
  fullName,
  verifyError,
  dniValue,
  phoneValue,
  genderValue,
  verifyLoading,
  candidates,
  selectedCandidateKey,
  onDniChange,
  onPhoneChange,
  onGenderChange,
  onSelectCandidate,
  onVerifySubmit,
}: Pick<
  WayniKycStageViewProps,
  | "brandName"
  | "email"
  | "fullName"
  | "verifyError"
  | "dniValue"
  | "phoneValue"
  | "genderValue"
  | "verifyLoading"
  | "candidates"
  | "selectedCandidateKey"
  | "onDniChange"
  | "onPhoneChange"
  | "onGenderChange"
  | "onSelectCandidate"
  | "onVerifySubmit"
>) => (
  <div className="grid h-full gap-4 lg:grid-cols-[1.02fr_0.98fr]">
    <section className="kyc-app-panel rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[22px] bg-primary text-primary-foreground">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Etapa 1</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Identidad</h2>
          <p className="mt-1 text-sm text-muted-foreground">Confirmá tus datos para iniciar la validación obligatoria de {brandName}.</p>
        </div>
      </div>

      {verifyError && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {verifyError}
        </div>
      )}

      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={dniValue}
              onChange={(event) => onDniChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Ej: 38045521"
              disabled={verifyLoading}
            />
          </div>
          <div>
            <Label htmlFor="phone">Celular</Label>
            <div className="mt-1 flex h-10 items-center gap-2 rounded-2xl border border-input bg-background px-3">
              <span className="text-sm font-semibold text-foreground">+54</span>
              <input
                id="phone"
                type="text"
                inputMode="tel"
                maxLength={10}
                value={phoneValue}
                onChange={(event) => onPhoneChange(event.target.value)}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="11 6605 1847"
                disabled={verifyLoading}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="gender">Sexo biológico</Label>
            <select
              id="gender"
              value={genderValue}
              onChange={(event) => onGenderChange(event.target.value)}
              className={selectClass}
              disabled={verifyLoading}
            >
              <option value="">Seleccionar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </div>
          <Button className="h-10 rounded-2xl px-5" onClick={onVerifySubmit} disabled={verifyLoading}>
            {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Continuar
          </Button>
        </div>

        {candidates.length > 1 && (
          <div className="rounded-[28px] border border-border/70 bg-background/60 p-3">
            <p className="mb-2 text-sm font-semibold text-foreground">Seleccioná el titular correcto</p>
            <div className="grid gap-2">
              {candidates.map((candidate) => {
                const key = `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}`;
                const isSelected = selectedCandidateKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectCandidate(key)}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-left transition",
                      isSelected
                        ? "border-primary/30 bg-primary/10"
                        : "border-border/70 bg-background hover:border-primary/30",
                    )}
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
    </section>

    <aside className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Confirmación inicial</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Verificamos que el titular, el documento y el número de contacto coincidan antes de habilitar la siguiente etapa.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {fullName && <DataTile label="Titular" value={fullName} />}
          <DataTile label="Email" value={email} />
        </div>
        <PanelNote>
          Sin esta validación no podremos continuar con la dirección y la confirmación biométrica final de tu cuenta.
        </PanelNote>
      </div>
    </aside>
  </div>
);

const AddressScreen = ({
  fullName,
  dni,
  phonePreview,
  addressError,
  loadingProvinces,
  loadingLocalities,
  addressLoading,
  selectedProvinceId,
  selectedLocalityId,
  provinces,
  localities,
  streetName,
  streetNumber,
  floor,
  apartment,
  zipCode,
  onProvinceChange,
  onLocalityChange,
  onStreetNameChange,
  onStreetNumberChange,
  onFloorChange,
  onApartmentChange,
  onZipCodeChange,
  onAddressSubmit,
}: Pick<
  WayniKycStageViewProps,
  | "fullName"
  | "dni"
  | "phonePreview"
  | "addressError"
  | "loadingProvinces"
  | "loadingLocalities"
  | "addressLoading"
  | "selectedProvinceId"
  | "selectedLocalityId"
  | "provinces"
  | "localities"
  | "streetName"
  | "streetNumber"
  | "floor"
  | "apartment"
  | "zipCode"
  | "onProvinceChange"
  | "onLocalityChange"
  | "onStreetNameChange"
  | "onStreetNumberChange"
  | "onFloorChange"
  | "onApartmentChange"
  | "onZipCodeChange"
  | "onAddressSubmit"
>) => (
  <div className="grid h-full gap-4 lg:grid-cols-[1.08fr_0.92fr]">
    <section className="kyc-app-panel rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-[22px] bg-primary text-primary-foreground">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Etapa 2</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Dirección</h2>
          <p className="mt-1 text-sm text-muted-foreground">Completá tu domicilio de residencia para seguir con la validación.</p>
        </div>
      </div>

      {addressError && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {addressError}
        </div>
      )}

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="province">Provincia</Label>
            <select
              id="province"
              value={selectedProvinceId}
              onChange={(event) => onProvinceChange(event.target.value)}
              className={selectClass}
              disabled={loadingProvinces || addressLoading}
            >
              <option value="">{loadingProvinces ? "Cargando..." : "Seleccionar"}</option>
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
              onChange={(event) => onLocalityChange(event.target.value)}
              className={selectClass}
              disabled={!selectedProvinceId || loadingLocalities || addressLoading}
            >
              <option value="">{loadingLocalities ? "Cargando..." : "Seleccionar"}</option>
              {Object.entries(localities)
                .sort(([, a], [, b]) => a.localeCompare(b))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
          <div>
            <Label htmlFor="street">Calle</Label>
            <Input
              id="street"
              type="text"
              value={streetName}
              onChange={(event) => onStreetNameChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Av. Corrientes"
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
              onChange={(event) => onStreetNumberChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
              placeholder="1234"
              disabled={addressLoading}
            />
          </div>
        </div>

        <div className="grid gap-3 grid-cols-3">
          <div>
            <Label htmlFor="floor">Piso</Label>
            <Input
              id="floor"
              type="text"
              value={floor}
              onChange={(event) => onFloorChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
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
              onChange={(event) => onApartmentChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
              placeholder="A"
              disabled={addressLoading}
            />
          </div>
          <div>
            <Label htmlFor="zip">Cód. postal</Label>
            <Input
              id="zip"
              type="text"
              inputMode="numeric"
              value={zipCode}
              onChange={(event) => onZipCodeChange(event.target.value)}
              className="mt-1 h-10 rounded-2xl"
              placeholder="1043"
              disabled={addressLoading}
            />
          </div>
        </div>

        <Button className="mt-1 h-10 w-full rounded-2xl" onClick={onAddressSubmit} disabled={addressLoading}>
          {addressLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Guardar y continuar
        </Button>
      </div>
    </section>

    <aside className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Resumen validado</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <DataTile label="Titular" value={fullName || "—"} />
          <DataTile label="DNI" value={dni || "—"} />
          <DataTile label="Celular" value={phonePreview} />
        </div>
      </div>

      <PanelNote>
        Ingresá tu domicilio real. La siguiente pantalla abrirá la validación biométrica final para confirmar la cuenta.
      </PanelNote>
    </aside>
  </div>
);

const BiometricScreen = ({
  brandName,
  dni,
  biometricStatus,
  walletStatus,
  biometricUrl,
  biometricStarted,
  checkingBiometric,
  onOpenBiometric,
  onRefreshBiometric,
}: Pick<
  WayniKycStageViewProps,
  | "brandName"
  | "dni"
  | "biometricStatus"
  | "walletStatus"
  | "biometricUrl"
  | "biometricStarted"
  | "checkingBiometric"
  | "onOpenBiometric"
  | "onRefreshBiometric"
>) => (
  <div className="grid h-full gap-4 lg:grid-cols-[1fr_0.92fr]">
    <section className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[22px] bg-primary text-primary-foreground">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Etapa 3</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Biometría</h2>
            <p className="mt-1 text-sm text-muted-foreground">Último control obligatorio para volver a habilitar el acceso a tu cuenta.</p>
          </div>
        </div>

        <div className="rounded-[30px] border border-border/70 bg-background/65 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[20px] bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Abrí la validación segura</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Completá la selfie y la captura documental. Después volvé acá y actualizá el estado para cerrar el proceso.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 rounded-2xl sm:flex-1" onClick={onOpenBiometric} disabled={!biometricUrl}>
              <ExternalLink className="h-4 w-4" />
              {biometricStarted ? "Abrir nuevamente" : "Iniciar validación"}
            </Button>
            <Button variant="outline" className="h-11 rounded-2xl sm:flex-1" onClick={onRefreshBiometric} disabled={checkingBiometric || !dni}>
              {checkingBiometric ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Actualizar estado
            </Button>
          </div>
        </div>
      </div>

      <PanelNote>
        {brandName} mantiene el acceso restringido hasta completar esta etapa final. El proceso dura pocos minutos y confirma tu identidad en tiempo real.
      </PanelNote>
    </section>

    <aside className="kyc-app-panel flex flex-col justify-between rounded-[32px] p-5 sm:p-6 lg:p-7">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Estado en vivo</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <DataTile label="Biometría" value={biometricStatus} />
          <DataTile label="Wallet" value={walletStatus} />
          <DataTile label="DNI" value={dni || "—"} />
        </div>
      </div>

      <div className="rounded-3xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>Hasta que la biometría quede validada, la cuenta seguirá temporalmente restringida por seguridad.</p>
        </div>
      </div>
    </aside>
  </div>
);

const DoneScreen = ({ brandName, email, submittedAt }: Pick<WayniKycStageViewProps, "brandName" | "email" | "submittedAt">) => (
  <div className="flex h-full items-center justify-center">
    <section className="kyc-app-panel mx-auto w-full max-w-2xl rounded-[32px] p-6 text-center sm:p-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-foreground sm:text-3xl">Validación completada</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Tus datos fueron enviados correctamente. En breve vas a poder continuar con el acceso a tu cuenta de {brandName}.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <DataTile label="Cuenta" value={email} />
        <DataTile label="Enviado" value={submittedAt ? new Date(submittedAt).toLocaleString("es-AR") : "Ahora"} />
      </div>
    </section>
  </div>
);

const WayniKycStageView = ({
  brandName,
  email,
  step,
  progressValue,
  fullName,
  phonePreview,
  dni,
  biometricStatus,
  walletStatus,
  submittedAt,
  candidates,
  selectedCandidateKey,
  verifyLoading,
  verifyError,
  dniValue,
  phoneValue,
  genderValue,
  addressError,
  loadingProvinces,
  loadingLocalities,
  addressLoading,
  selectedProvinceId,
  selectedLocalityId,
  provinces,
  localities,
  streetName,
  streetNumber,
  floor,
  apartment,
  zipCode,
  biometricUrl,
  biometricStarted,
  checkingBiometric,
  onStart,
  onDniChange,
  onPhoneChange,
  onGenderChange,
  onSelectCandidate,
  onVerifySubmit,
  onProvinceChange,
  onLocalityChange,
  onStreetNameChange,
  onStreetNumberChange,
  onFloorChange,
  onApartmentChange,
  onZipCodeChange,
  onAddressSubmit,
  onOpenBiometric,
  onRefreshBiometric,
}: WayniKycStageViewProps) => {
  const title =
    step === "intro"
      ? "Activación segura"
      : step === "verify"
        ? "Identidad"
        : step === "address"
          ? "Dirección"
          : step === "biometric"
            ? "Biometría"
            : "Completado";

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="kyc-app-sidebar hidden w-[320px] shrink-0 flex-col justify-between border-r border-border/60 p-6 lg:flex">
        <div>
          <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
            Flujo guiado
          </Badge>
          <h2 className="mt-4 text-[1.85rem] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground">
            Validación de seguridad
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Todo el proceso fue reorganizado en una sola experiencia visual, limpia y profesional, con etapas claras y sin pantallas largas.
          </p>
        </div>

        <div className="space-y-3">
          {stageMeta.map((item) => (
            <SidebarStage key={item.key} step={item} current={step} />
          ))}
        </div>

        <div className="space-y-3">
          <DataTile label="Cuenta" value={email} />
          <PanelNote>
            La validación permanece obligatoria. Sin completar el proceso, la cuenta seguirá restringida por seguridad.
          </PanelNote>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-border/60 px-4 py-4 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Proceso obligatorio</p>
              <h1 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
                {step === "done" ? "100% completo" : `${progressValue}% completado`}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">{email}</Badge>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Progress value={progressValue} className="h-2.5 rounded-full" />
            <MobileStageStrip step={step} />
          </div>
        </header>

        <main className="min-h-0 flex-1 p-4 sm:p-5 lg:p-6">
          {step === "intro" && <IntroScreen brandName={brandName} onStart={onStart} email={email} />}
          {step === "verify" && (
            <VerifyScreen
              brandName={brandName}
              email={email}
              fullName={fullName}
              verifyError={verifyError}
              dniValue={dniValue}
              phoneValue={phoneValue}
              genderValue={genderValue}
              verifyLoading={verifyLoading}
              candidates={candidates}
              selectedCandidateKey={selectedCandidateKey}
              onDniChange={onDniChange}
              onPhoneChange={onPhoneChange}
              onGenderChange={onGenderChange}
              onSelectCandidate={onSelectCandidate}
              onVerifySubmit={onVerifySubmit}
            />
          )}
          {step === "address" && (
            <AddressScreen
              fullName={fullName}
              dni={dni}
              phonePreview={phonePreview}
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
              onProvinceChange={onProvinceChange}
              onLocalityChange={onLocalityChange}
              onStreetNameChange={onStreetNameChange}
              onStreetNumberChange={onStreetNumberChange}
              onFloorChange={onFloorChange}
              onApartmentChange={onApartmentChange}
              onZipCodeChange={onZipCodeChange}
              onAddressSubmit={onAddressSubmit}
            />
          )}
          {step === "biometric" && (
            <BiometricScreen
              brandName={brandName}
              dni={dni}
              biometricStatus={biometricStatus}
              walletStatus={walletStatus}
              biometricUrl={biometricUrl}
              biometricStarted={biometricStarted}
              checkingBiometric={checkingBiometric}
              onOpenBiometric={onOpenBiometric}
              onRefreshBiometric={onRefreshBiometric}
            />
          )}
          {step === "done" && <DoneScreen brandName={brandName} email={email} submittedAt={submittedAt} />}
        </main>
      </div>
    </div>
  );
};

export default WayniKycStageView;
