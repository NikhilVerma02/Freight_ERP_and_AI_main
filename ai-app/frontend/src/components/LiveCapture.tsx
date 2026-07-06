import React, { useEffect, useRef, useState } from "react";

export type CaptureKind = "video" | "photo" | "audio";

export interface LiveCaptureLabels {
  video: string;
  photo: string;
  audio: string;
  startCamera: string;
  startMic: string;
  startRecording: string;
  stopRecording: string;
  capturePhoto: string;
  retake: string;
  recording: string;
  permissionError: string;
  hint: string;
}

interface LiveCaptureProps {
  onCapture: (file: File) => void;
  labels: LiveCaptureLabels;
}

function pickMimeType(candidates: string[]): string | undefined {
  return candidates.find((c) => (window as any).MediaRecorder?.isTypeSupported?.(c));
}

/** Live video/photo/audio capture via getUserMedia + MediaRecorder, producing a File
 * that drops into the same upload flow as a picked file — see CaseIntake.tsx. A video
 * recording's audio track (e.g. the customer narrating the damage out loud) is preserved
 * as-is; Gemini understands it natively, no separate transcription needed. */
export default function LiveCapture({ onCapture, labels }: LiveCaptureProps) {
  const [kind, setKind] = useState<CaptureKind>("video");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }

  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  function switchKind(next: CaptureKind) {
    stopStream();
    setPreviewUrl(null);
    setError(null);
    setKind(next);
  }

  async function startDevice() {
    setError(null);
    try {
      const constraints: MediaStreamConstraints =
        kind === "audio" ? { audio: true } : { video: { facingMode: "environment" }, audio: kind === "video" };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      setStream(s);
    } catch {
      setError(labels.permissionError);
    }
  }

  function startRecording() {
    if (!stream) return;
    const mimeType =
      kind === "audio"
        ? pickMimeType(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"])
        : pickMimeType(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || (kind === "audio" ? "audio/webm" : "video/webm"),
      });
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `live-${kind}-${Date.now()}.${ext}`, { type: blob.type });
      setPreviewUrl(URL.createObjectURL(blob));
      onCapture(file);
      stopStream();
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `live-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPreviewUrl(URL.createObjectURL(blob));
        onCapture(file);
        stopStream();
      },
      "image/jpeg",
      0.92
    );
  }

  function retake() {
    setPreviewUrl(null);
    startDevice();
  }

  const formattedTime = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["video", "photo", "audio"] as CaptureKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              kind === k ? "bg-accent-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {labels[k]}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="overflow-hidden rounded-md border border-slate-700 bg-slate-950">
        {previewUrl ? (
          <div className="p-2">
            {kind === "photo" ? (
              <img src={previewUrl} className="max-h-56 w-full rounded object-contain" alt="Captured" />
            ) : kind === "audio" ? (
              <audio src={previewUrl} controls className="w-full" />
            ) : (
              <video src={previewUrl} controls className="max-h-56 w-full rounded" />
            )}
            <button
              type="button"
              onClick={retake}
              className="mt-2 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              {labels.retake}
            </button>
          </div>
        ) : stream ? (
          <div className="p-2">
            {kind !== "audio" && <video ref={videoRef} autoPlay playsInline muted className="max-h-56 w-full rounded bg-black" />}
            {kind === "audio" && (
              <div className="flex h-20 items-center justify-center text-slate-400">
                {recording ? (
                  <span className="flex items-center gap-2 text-rose-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {labels.recording} {formattedTime}
                  </span>
                ) : (
                  <span className="text-xs">🎙️</span>
                )}
              </div>
            )}
            {kind !== "audio" && recording && (
              <p className="mt-1 flex items-center gap-2 text-xs text-rose-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {labels.recording} {formattedTime}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              {kind === "photo" ? (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600"
                >
                  {labels.capturePhoto}
                </button>
              ) : recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  {labels.stopRecording}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600"
                >
                  {labels.startRecording}
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startDevice}
            className="flex w-full flex-col items-center justify-center gap-1 px-4 py-6 text-center text-xs text-slate-400 hover:text-slate-200"
          >
            <span className="text-xl">{kind === "audio" ? "🎙️" : "📷"}</span>
            {kind === "audio" ? labels.startMic : labels.startCamera}
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">{labels.hint}</p>
    </div>
  );
}
