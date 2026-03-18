import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Smartphone,
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

const stageItems = [
  { key: "verify", label: "Identidad", icon: UserRound },
  { key: "address", label: "Dirección", icon: MapPin },
  { key: "biometric", label: "Biometría", icon: Camera },
] as const;

const selectClass =
  "mt-1 h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

const stageOrder: KycFlowScreen[] = ["intro", "verify", "address", "biometric", "done"];

const isStageComplete = (current: KycFlowScreen, stage: (typeof stageItems)[number]["key"]) => {
  if (current === "done") return true;
  return stageOrder.indexOf(current) > stageOrder.indexOf(stage);
};

const StageStrip = ({ step }: { step: KycFlowScreen }) => (
  <div className="grid grid-cols-3 gap-2">
    {stageItems.map((item) => {
      const isActive = step === item.key;
      const done = isStageComplete(step, item.key);
      const Icon = item.icon;

      return (
        <div
          key={item.key}
          className={cn(
            "flex items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-semibold sm:text-xs",
            isActive || done
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/70 bg-background/70 text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{item.label}</span>
        </div>
      );
    })}
  </div>
);

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <p className="text-xs text-muted-foreground">
    <span className="font-semibold uppercase tracking-[0.18em]">{label}</span>
    <span className="ml-2 text-foreground">{value || "—"}</span>
  </p>
);

const IntroScreen = ({ onStart, brandName, email }: Pick<WayniKycStageViewProps, "onStart" | "brandName" | "email">) => (
  <section className="kyc-stage-card mx-auto flex h-full w-full max-w-2xl flex-col justify-between rounded-[28px] p-5 sm:p-6">
    <div>
      <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary">
        Validación inmediata
      </Badge>
      <h2 className="mt-4 text-[1.9rem] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[2.35rem]">
        Necesitamos validar tus datos antes de habilitar nuevamente tu cuenta.
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Esta validación es obligatoria por seguridad y confirmación de cuenta. Sin este proceso no será posible acceder.
      </p>
    </div>

    <div className="space-y-4">
      <InfoLine label="Cuenta" value={email} />
      <InfoLine label="Flujo" value={`Identidad · Dirección · Biometría (${brandName})`} />
      <Button className="h-11 w-full rounded-2xl" onClick={onStart}>
        Comenzar validación
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </section>
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
  <section className="kyc-stage-card mx-auto flex h-full w-full max-w-2xl flex-col rounded-[28px] p-5 sm:p-6">
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Etapa 1</p>
      <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Identidad</h2>
      <p className="mt-1 text-sm text-muted-foreground">Confirmá tus datos para iniciar la validación obligatoria de {brandName}.</p>
    </div>

    {verifyError && (
      <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        {verifyError}
      </div>
    )}

    <div className="grid gap-3">
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
            placeholder="38045521"
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
              placeholder="1166051847"
              disabled={verifyLoading}
            />
          </div>
        </div>
      </div>

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

      {candidates.length > 1 && (
        <div className="rounded-2xl border border-border/70 bg-background/70 p-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Titular</p>
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
                    "rounded-2xl border px-3 py-2 text-left transition",
                    isSelected
                      ? "border-primary/30 bg-primary/10"
                      : "border-border/70 bg-background hover:border-primary/30",
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">{candidate.full_name}</p>
                  <p className="text-xs text-muted-foreground">CUIT: {candidate.tax_identification_value}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>

    <div className="mt-auto space-y-2 pt-4">
      <InfoLine label="Cuenta" value={email} />
      {fullName && <InfoLine label="Titular" value={fullName} />}
      <Button className="h-10 w-full rounded-2xl" onClick={onVerifySubmit} disabled={verifyLoading}>
        {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
        Continuar
      </Button>
    </div>
  </section>
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
  <section className="kyc-stage-card mx-auto flex h-full w-full max-w-2xl flex-col rounded-[28px] p-5 sm:p-6">
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Etapa 2</p>
      <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Dirección</h2>
    </div>

    {addressError && (
      <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
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

      <div className="grid grid-cols-3 gap-3">
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
    </div>

    <div className="mt-auto space-y-2 pt-4">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
        <InfoLine label="Titular" value={fullName || "—"} />
        <InfoLine label="DNI" value={dni || "—"} />
        <InfoLine label="Celular" value={phonePreview} />
      </div>
      <Button className="h-10 w-full rounded-2xl" onClick={onAddressSubmit} disabled={addressLoading}>
        {addressLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
        Guardar y continuar
      </Button>
    </div>
  </section>
);

const BiometricScreen = ({
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
  | "dni"
  | "biometricStatus"
  | "walletStatus"
  | "biometricUrl"
  | "biometricStarted"
  | "checkingBiometric"
  | "onOpenBiometric"
  | "onRefreshBiometric"
>) => (
  <section className="kyc-stage-card mx-auto flex h-full w-full max-w-2xl flex-col rounded-[28px] p-5 sm:p-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Etapa 3</p>
      <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">Biometría</h2>
      <p className="mt-2 text-sm text-muted-foreground">Abrí la validación segura, completá selfie y documento, y luego actualizá estado.</p>
    </div>

    <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Estado actual</p>
          <p>Biometría: {biometricStatus} · Wallet: {walletStatus}</p>
        </div>
      </div>
    </div>

    <div className="mt-auto space-y-3 pt-4">
      <InfoLine label="DNI" value={dni || "—"} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Button className="h-11 rounded-2xl" onClick={onOpenBiometric} disabled={!biometricUrl}>
          <ExternalLink className="h-4 w-4" />
          {biometricStarted ? "Abrir nuevamente" : "Iniciar validación"}
        </Button>
        <Button variant="outline" className="h-11 rounded-2xl" onClick={onRefreshBiometric} disabled={checkingBiometric || !dni}>
          {checkingBiometric ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Actualizar estado
        </Button>
      </div>
    </div>
  </section>
);

const DoneScreen = ({ brandName, email, submittedAt }: Pick<WayniKycStageViewProps, "brandName" | "email" | "submittedAt">) => (
  <section className="kyc-stage-card mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center rounded-[28px] p-5 text-center sm:p-6">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <CheckCircle2 className="h-7 w-7" />
    </div>
    <h2 className="mt-4 text-2xl font-semibold text-foreground">Validación completada</h2>
    <p className="mt-2 text-sm text-muted-foreground">Tus datos fueron enviados correctamente para habilitar el acceso a {brandName}.</p>
    <div className="mt-4 space-y-1">
      <InfoLine label="Cuenta" value={email} />
      <InfoLine label="Enviado" value={submittedAt ? new Date(submittedAt).toLocaleString("es-AR") : "Ahora"} />
    </div>
  </section>
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-b border-border/60 px-3 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Proceso obligatorio</p>
            <h1 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">{title}</h1>
          </div>
          <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary">
            {step === "done" ? "100%" : `${progressValue}%`}
          </Badge>
        </div>

        <div className="mt-3 space-y-2">
          <Progress value={progressValue} className="h-2" />
          <StageStrip step={step} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 sm:py-4">
        {step === "intro" && <IntroScreen onStart={onStart} brandName={brandName} email={email} />}
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
  );
};

export default WayniKycStageView;
