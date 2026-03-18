import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import KycStepCapture from "@/components/kyc/KycStepCapture";
import {
  buildKycPath,
  FILE_KIND_DESCRIPTIONS,
  FILE_KIND_LABELS,
  fileKinds,
  formatDateTime,
  getKycStatusLabel,
  KYC_DOC_BUCKET,
  type KycFileKind,
  validateKycFile,
} from "@/lib/kyc";

interface KycCaseRecord {
  id: string;
  operator_code: string;
  status: string;
  submitted_at: string | null;
  dni_front_path: string | null;
  dni_back_path: string | null;
  selfie_path: string | null;
  selfie_with_document_path: string | null;
  dni_front_captured_at: string | null;
  dni_back_captured_at: string | null;
  selfie_captured_at: string | null;
  selfie_with_document_captured_at: string | null;
}

type FileState = Partial<Record<KycFileKind, { uploading: boolean; uploadedAt?: string | null; path?: string | null }>>;

const pathFieldMap: Record<KycFileKind, keyof KycCaseRecord> = {
  dni_front: "dni_front_path",
  dni_back: "dni_back_path",
  selfie: "selfie_path",
  selfie_with_document: "selfie_with_document_path",
};

const capturedFieldMap: Record<KycFileKind, keyof KycCaseRecord> = {
  dni_front: "dni_front_captured_at",
  dni_back: "dni_back_captured_at",
  selfie: "selfie_captured_at",
  selfie_with_document: "selfie_with_document_captured_at",
};

const KycUpload = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [caseRecord, setCaseRecord] = useState<KycCaseRecord | null>(null);
  const [fileState, setFileState] = useState<FileState>({});
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = "KYC ao vivo";
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("kyc_cases")
      .select("id, operator_code, status, submitted_at, dni_front_path, dni_back_path, selfie_path, selfie_with_document_path, dni_front_captured_at, dni_back_captured_at, selfie_captured_at, selfie_with_document_captured_at")
      .eq("id", caseId)
      .maybeSingle();

    if (error || !data) {
      setCaseRecord(null);
      setLoading(false);
      return;
    }

    const record = data as unknown as KycCaseRecord;
    setCaseRecord(record);
    setFileState({
      dni_front: { uploading: false, uploadedAt: record.dni_front_captured_at, path: record.dni_front_path },
      dni_back: { uploading: false, uploadedAt: record.dni_back_captured_at, path: record.dni_back_path },
      selfie: { uploading: false, uploadedAt: record.selfie_captured_at, path: record.selfie_path },
      selfie_with_document: { uploading: false, uploadedAt: record.selfie_with_document_captured_at, path: record.selfie_with_document_path },
    });
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const completedFiles = useMemo(
    () => fileKinds.filter((kind) => Boolean(fileState[kind]?.path)).length,
    [fileState],
  );

  const progressValue = Math.round((completedFiles / fileKinds.length) * 100);
  const activeKind = fileKinds[currentStep];

  const syncStepFromState = useCallback((nextState: FileState) => {
    const nextIndex = fileKinds.findIndex((kind) => !nextState[kind]?.path);
    setCurrentStep(nextIndex === -1 ? fileKinds.length - 1 : nextIndex);
  }, []);

  const handleUpload = useCallback(async (kind: KycFileKind, file: File) => {
    if (!caseId || !caseRecord) return;

    const validationError = validateKycFile(file);
    if (validationError) {
      toast({ title: "Arquivo inválido", description: validationError });
      return;
    }

    const path = buildKycPath(caseRecord.operator_code, caseId, kind, file);
    const now = new Date().toISOString();

    setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: true } }));

    const { error: uploadError } = await supabase.storage.from(KYC_DOC_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: false } }));
      toast({ title: "Falha no upload", description: "Não foi possível enviar a captura." });
      return;
    }

    const updatePayload = {
      [pathFieldMap[kind]]: path,
      [capturedFieldMap[kind]]: now,
      status: "collecting",
    } as Record<string, string>;

    const { error: updateError } = await supabase.from("kyc_cases").update(updatePayload).eq("id", caseId);

    if (updateError) {
      setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: false } }));
      toast({ title: "Upload não registrado", description: "Tente novamente em alguns instantes." });
      return;
    }

    await supabase.from("kyc_audit_logs").insert({
      case_id: caseId,
      operator_code: caseRecord.operator_code,
      event_type: "document_uploaded",
      file_kind: kind,
      user_agent: navigator.userAgent,
      metadata: {
        path,
        size: file.size,
        type: file.type,
        captured_at: now,
      },
    } as never);

    const nextState = {
      ...fileState,
      [kind]: { uploading: false, uploadedAt: now, path },
    };

    setFileState(nextState);
    setCaseRecord((prev) => (prev ? { ...prev, status: "collecting", [pathFieldMap[kind]]: path, [capturedFieldMap[kind]]: now } : prev));
    syncStepFromState(nextState);
    toast({ title: "Captura salva", description: `${FILE_KIND_LABELS[kind]} enviado com sucesso.` });
  }, [caseId, caseRecord, fileState, syncStepFromState]);

  const submitCase = useCallback(async () => {
    if (!caseId || !caseRecord) return;

    const missing = fileKinds.filter((kind) => !fileState[kind]?.path);
    if (missing.length > 0) {
      toast({ title: "Capturas pendentes", description: "Finalize as 4 etapas antes de concluir." });
      return;
    }

    setSubmitting(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("kyc_cases")
      .update({ status: "submitted", submitted_at: now })
      .eq("id", caseId);

    if (!error) {
      await supabase.from("kyc_audit_logs").insert({
        case_id: caseId,
        operator_code: caseRecord.operator_code,
        event_type: "case_submitted",
        user_agent: navigator.userAgent,
        metadata: { submitted_at: now },
      } as never);

      setCaseRecord((prev) => (prev ? { ...prev, status: "submitted", submitted_at: now } : prev));
      toast({ title: "KYC enviado", description: "Agora seu caso foi enviado para análise." });
    } else {
      toast({ title: "Erro ao concluir", description: "Não foi possível finalizar o envio." });
    }

    setSubmitting(false);
  }, [caseId, caseRecord, fileState]);

  useEffect(() => {
    syncStepFromState(fileState);
  }, [fileState, syncStepFromState]);

  if (loading) {
    return (
      <div className="kyc-live-shell flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!caseRecord) {
    return (
      <div className="kyc-live-shell flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg border-border kyc-live-panel">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-semibold text-foreground">Link indisponível</h1>
            <p className="mt-3 text-sm text-muted-foreground">Este caso não existe, já foi encerrado ou não aceita novas capturas.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="kyc-live-shell min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="kyc-live-panel rounded-[32px] border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">KYC ao vivo</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Validação por câmera em tempo real</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Sem formulários longos: primeiro rosto, depois documentos, tudo em uma única tela passo a passo.</p>
              </div>
              <Badge variant="outline" className="text-sm">{getKycStatusLabel(caseRecord.status)}</Badge>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso das capturas</span>
                <span className="font-medium text-foreground">{completedFiles}/{fileKinds.length}</span>
              </div>
              <Progress value={progressValue} className="h-2.5" />
              <div className="grid gap-2 sm:grid-cols-4">
                {fileKinds.map((kind, index) => {
                  const done = Boolean(fileState[kind]?.path);
                  const active = currentStep === index || (completedFiles === fileKinds.length && index === fileKinds.length - 1);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setCurrentStep(index)}
                      className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : done
                            ? "border-border bg-card/60"
                            : "border-border bg-background/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Etapa {index + 1}</span>
                        {done && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{FILE_KIND_LABELS[kind]}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="kyc-live-panel rounded-[32px] border border-border p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Resumo da captura</h2>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Status</p>
                <p className="mt-2 text-sm text-foreground">{getKycStatusLabel(caseRecord.status)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Etapa atual</p>
                <p className="mt-2 text-sm text-foreground">{FILE_KIND_LABELS[activeKind]}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Enviado para análise</p>
                <p className="mt-2 text-sm text-foreground">{formatDateTime(caseRecord.submitted_at)}</p>
              </div>
            </div>

            <Button
              type="button"
              className="mt-5 w-full"
              onClick={submitCase}
              disabled={submitting || completedFiles < fileKinds.length || caseRecord.status === "submitted"}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Finalizar KYC
            </Button>
          </div>
        </section>

        <section className="kyc-live-panel rounded-[32px] border border-border p-5 sm:p-6">
          <KycStepCapture
            key={activeKind}
            title={FILE_KIND_LABELS[activeKind]}
            description={FILE_KIND_DESCRIPTIONS[activeKind]}
            captureMode={activeKind === "selfie" || activeKind === "selfie_with_document" ? "user" : "environment"}
            uploadedAt={fileState[activeKind]?.uploadedAt}
            isUploaded={Boolean(fileState[activeKind]?.path)}
            isUploading={Boolean(fileState[activeKind]?.uploading)}
            onFileReady={(file) => handleUpload(activeKind, file)}
          />
        </section>
      </main>
    </div>
  );
};

export default KycUpload;
