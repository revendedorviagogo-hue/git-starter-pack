import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, FileImage, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/kyc";

interface KycStepCaptureProps {
  title: string;
  description: string;
  captureMode: "user" | "environment";
  uploadedAt?: string | null;
  isUploaded?: boolean;
  isUploading?: boolean;
  onFileReady: (file: File) => Promise<void>;
}

const KycStepCapture = ({
  title,
  description,
  captureMode,
  uploadedAt,
  isUploaded,
  isUploading,
  onFileReady,
}: KycStepCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopCamera]);

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Seu navegador não liberou a câmera. Use o envio manual abaixo.");
      return;
    }

    setStartingCamera(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: captureMode === "user" ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch {
      setError("Não foi possível acessar a câmera. Você ainda pode enviar a foto do aparelho.");
    } finally {
      setStartingCamera(false);
    }
  }, [captureMode]);

  useEffect(() => {
    if (capturedFile || previewUrl) return;
    openCamera();
  }, [capturedFile, openCamera, previewUrl]);

  const loadPreview = useCallback((file: File) => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setCapturedFile(file);
  }, []);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;

    const file = new File([blob], `${title.toLowerCase().replace(/\s+/g, "-")}.jpg`, { type: "image/jpeg" });
    loadPreview(file);
    stopCamera();
  }, [loadPreview, stopCamera, title]);

  const resetCapture = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedFile(null);
    setError("");
    openCamera();
  }, [openCamera, previewUrl]);

  const confirmCapture = useCallback(async () => {
    if (!capturedFile) return;
    setSubmitting(true);
    try {
      await onFileReady(capturedFile);
    } finally {
      setSubmitting(false);
    }
  }, [capturedFile, onFileReady]);

  const handleManualFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadPreview(file);
    stopCamera();
    event.target.value = "";
  }, [loadPreview, stopCamera]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Captura ao vivo</p>
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{captureMode === "user" ? "Câmera frontal" : "Câmera traseira"}</Badge>
          {uploadedAt && <Badge variant="secondary">Última captura {formatDateTime(uploadedAt)}</Badge>}
          {isUploaded && <Badge>Etapa concluída</Badge>}
        </div>
      </div>

      <div className="kyc-live-camera-frame rounded-[28px] border border-border/80 p-3 sm:p-4">
        {previewUrl ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[22px] border border-border bg-background/80">
              <img src={previewUrl} alt={title} className="aspect-[4/5] w-full object-cover" loading="lazy" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={resetCapture}>
                <RefreshCw className="h-4 w-4" />
                Refazer
              </Button>
              <Button type="button" onClick={confirmCapture} disabled={submitting || isUploading}>
                {submitting || isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Usar esta captura
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="overflow-hidden rounded-[22px] border border-border bg-background/90">
              {cameraOpen ? (
                <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-secondary/40 text-muted-foreground">
                  {startingCamera ? <Loader2 className="h-6 w-6 animate-spin" /> : <CameraOff className="h-8 w-8" />}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-[22px] border border-border bg-card/70 p-4">
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-background/70 p-3">
                  <p className="text-sm font-medium text-foreground">Como capturar</p>
                  <p className="mt-1 text-sm text-muted-foreground">Mantenha tudo visível, sem cortes e com boa luz. Você pode fotografar direto pela câmera ou enviar do celular.</p>
                </div>
                {error && <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-3">
                <Button type="button" className="w-full" onClick={captureFrame} disabled={!cameraOpen || startingCamera}>
                  <Camera className="h-4 w-4" />
                  Tirar foto agora
                </Button>
                <Button type="button" variant="secondary" className="w-full" onClick={openCamera} disabled={startingCamera}>
                  {startingCamera ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Abrir câmera
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  Enviar do aparelho
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture={captureMode}
                  className="hidden"
                  onChange={handleManualFile}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Modo ideal</p>
          <p className="mt-2 text-sm text-foreground">{captureMode === "user" ? "Use a câmera frontal e mantenha o rosto centralizado." : "Use a câmera traseira e enquadre o documento inteiro."}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Formato aceito</p>
          <p className="mt-2 text-sm text-foreground">JPG, PNG ou WEBP com até 10MB por captura.</p>
        </div>
      </div>
    </div>
  );
};

export default KycStepCapture;
