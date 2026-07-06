import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api, ApiError, BASE_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Badge, statusToTone, Button, Card, CardBody, CardHeader, CardTitle, CardSubtitle, Spinner } from "../components/ui";
import { Modal } from "../components/ui/Modal";
import { Label, Select, Textarea } from "../components/ui/Input";
import { AgentFlowCard } from "../components/AgentFlowCard";
import LiveCapture from "../components/LiveCapture";
import { AGENT_META, STEP_KEYS, buildFacts, StepKey } from "../lib/agentFacts";
import { getLanguage } from "../lib/i18n";
import type { CustomerOption, OrderOption, VendorOption } from "../lib/types";

// Speech-to-text languages offered for the mic — independent of the UI language toggle, since
// a customer may want the interface in English but speak the description in Hindi (or vice
// versa). BCP-47 codes the browser's SpeechRecognition understands.
const MIC_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "mr-IN", label: "मराठी" },
  { code: "gu-IN", label: "ગુજરાતી" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
];

// Web Speech API isn't in the standard lib.dom typings — declare the bits we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechRecognitionSupported = !!SpeechRecognitionCtor;

interface StepState {
  status: "pending" | "running" | "ok" | "failed" | "skipped";
  error?: string | null;
  data?: unknown;
}

function initialSteps(): Record<StepKey, StepState> {
  return STEP_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: { status: "pending" } }),
    {} as Record<StepKey, StepState>
  );
}

/** One line of an SSE stream is "data: <json>" followed by a blank line. Parses whatever
 * complete "data: ..." blocks are in `buffer` so far, calling onEvent for each, and returns
 * the leftover partial buffer to keep accumulating on the next chunk. */
function consumeSseBuffer(buffer: string, onEvent: (event: any) => void): string {
  let idx: number;
  while ((idx = buffer.indexOf("\n\n")) !== -1) {
    const chunk = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 2);
    if (!chunk.startsWith("data:")) continue;
    const jsonStr = chunk.slice(5).trim();
    if (!jsonStr) continue;
    try {
      onEvent(JSON.parse(jsonStr));
    } catch {
      /* ignore malformed line */
    }
  }
  return buffer;
}

export default function CaseIntake() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Pickers
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [vendorUsername, setVendorUsername] = useState("");
  const [customerUsername, setCustomerUsername] = useState("");
  const [orderId, setOrderId] = useState<string>("");
  const [sku, setSku] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Media inputs
  const [media, setMedia] = useState<File | null>(null);
  const [mediaMode, setMediaMode] = useState<"upload" | "record">("upload");
  const [manualTranscript, setManualTranscript] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const [micLang, setMicLang] = useState(getLanguage() === "hi" ? "hi-IN" : "en-US");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBeforeListeningRef = useRef("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(initialSteps());
  const [runId, setRunId] = useState<string | null>(null);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [poMismatch, setPoMismatch] = useState<{ stated: string; selected: string } | null>(null);

  const isCustomer = user?.role === "customer";
  const isVendor = user?.role === "vendor";
  const isAdmin = user?.role === "admin";
  const isInspector = user?.role === "inspector";

  useEffect(() => {
    setPickerError(null);
    if (isCustomer) {
      api
        .get<VendorOption[]>("/api/ingest/vendors")
        .then(setVendors)
        .catch((err) => {
          setVendors([]);
          setPickerError(err instanceof ApiError ? err.message : String(err));
        });
    } else if (isVendor) {
      api
        .get<CustomerOption[]>("/api/ingest/customers")
        .then(setCustomers)
        .catch((err) => {
          setCustomers([]);
          setPickerError(err instanceof ApiError ? err.message : String(err));
        });
    } else if (isAdmin || isInspector) {
      api.get<VendorOption[]>("/api/ingest/vendors").then(setVendors).catch(() => setVendors([]));
      api.get<CustomerOption[]>("/api/ingest/customers").then(setCustomers).catch(() => setCustomers([]));
    }
  }, [isCustomer, isVendor, isAdmin, isInspector]);

  useEffect(() => {
    setOrders([]);
    setOrderId("");
    setSku("");
    const canQuery = isCustomer ? !!vendorUsername : isVendor ? !!customerUsername : true; // admin/inspector: always query (vendor filter optional)
    if (!canQuery) return;
    setLoadingOrders(true);
    const params = new URLSearchParams();
    if (vendorUsername) params.set("vendor_username", vendorUsername);
    if (customerUsername) params.set("customer_username", customerUsername);
    api
      .get<OrderOption[]>(`/api/ingest/orders?${params.toString()}`)
      .then((res) => {
        setOrders(res);
        setPickerError(null);
      })
      .catch((err) => {
        setOrders([]);
        setPickerError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => setLoadingOrders(false));
  }, [vendorUsername, customerUsername, isCustomer, isVendor]);

  const selectedOrder = orders.find((o) => String(o.id) === orderId);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleListening() {
    if (!speechRecognitionSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    transcriptBeforeListeningRef.current = manualTranscript;
    const recognition = new SpeechRecognitionCtor!();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = micLang;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = transcriptBeforeListeningRef.current;
      setManualTranscript((base ? `${base} ` : "") + transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function applyEvent(event: any) {
    if (event.type === "step_start") {
      setSteps((prev) => ({ ...prev, [event.step]: { status: "running" } }));
    } else if (event.type === "step_done") {
      setSteps((prev) => ({ ...prev, [event.step]: { status: event.status, error: event.error, data: event.data } }));
    } else if (event.type === "run_complete") {
      setRunId(event.run_id);
      setOverallStatus(event.status);
      if (event.status === "po_mismatch" && event.error) {
        // Parse stated/selected out of the structured error message from the backend.
        const statedMatch = event.error.match(/references '([^']+)'/);
        const selectedMatch = event.error.match(/selected is '([^']+)'/);
        setPoMismatch({
          stated: statedMatch ? statedMatch[1] : "unknown",
          selected: selectedMatch ? selectedMatch[1] : "unknown",
        });
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSteps(initialSteps());
    setRunId(null);
    setOverallStatus(null);
    setPoMismatch(null);

    if (!orderId || !sku) {
      setError(t("intake.noOrderError"));
      return;
    }
    if (!media && !manualTranscript.trim()) {
      setError(t("intake.noInputError"));
      return;
    }

    const formData = new FormData();
    formData.append("order_id", orderId);
    formData.append("sku", sku);
    if (vendorUsername) formData.append("vendor_username", vendorUsername);
    if (customerUsername) formData.append("customer_username", customerUsername);
    if (media) formData.append("media", media);
    if (manualTranscript.trim()) formData.append("manual_transcript", manualTranscript.trim());

    setRunning(true);
    setHasStarted(true);
    try {
      const token = localStorage.getItem("ai_token");
      const res = await fetch(`${BASE_URL}/api/ingest/run`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          detail = body.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseBuffer(buffer, applyEvent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const overallTone = overallStatus ? statusToTone(overallStatus) : "neutral";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold ai-text-primary">{t("intake.title")}</h1>
        <p className="mt-1 text-sm ai-text-secondary">{t("intake.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {pickerError && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {pickerError}
              </div>
            )}
            {/* Vendor / customer / order pickers */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isCustomer && (
                <div>
                  <Label>{t("intake.vendorLabel")}</Label>
                  <Select value={vendorUsername} onChange={(e) => setVendorUsername(e.target.value)}>
                    <option value="">{t("intake.selectPlaceholder")}</option>
                    {vendors.map((v) => (
                      <option key={v.username} value={v.username}>
                        {v.company_name || v.display_name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {isVendor && (
                <div>
                  <Label>{t("intake.customerLabel")}</Label>
                  <Select value={customerUsername} onChange={(e) => setCustomerUsername(e.target.value)}>
                    <option value="">{t("intake.selectPlaceholder")}</option>
                    {customers.map((c) => (
                      <option key={c.username} value={c.username}>
                        {c.display_name} (@{c.username})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {(isAdmin || isInspector) && (
                <div>
                  <Label>{t("intake.vendorLabel")} <span className="text-slate-500 text-xs">(optional)</span></Label>
                  <Select value={vendorUsername} onChange={(e) => setVendorUsername(e.target.value)}>
                    <option value="">All vendors</option>
                    {vendors.map((v) => (
                      <option key={v.username} value={v.username}>
                        {v.company_name || v.display_name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <Label>{t("intake.orderLabel")}</Label>
                <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} disabled={loadingOrders || orders.length === 0}>
                  <option value="">{loadingOrders ? t("common.loading") : t("intake.selectPlaceholder")}</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} ({o.status})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t("intake.skuLabel")}</Label>
                <Select value={sku} onChange={(e) => setSku(e.target.value)} disabled={!selectedOrder}>
                  <option value="">{t("intake.selectPlaceholder")}</option>
                  {selectedOrder?.items.map((item) => (
                    <option key={item.sku} value={item.sku}>
                      {item.item_name} ({item.sku}) — qty {item.qty}
                    </option>
                  ))}
                </Select>
              </div>

            </div>

            {/* Media input — one slot, image/video/audio, either picked from disk or recorded live */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0">{t("intake.mediaLabel")}</Label>
                <div className="flex gap-1">
                  {(["upload", "record"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMediaMode(m)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        mediaMode === m
                          ? "bg-accent-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {m === "upload" ? t("intake.mediaModeUpload") : t("intake.mediaModeRecord")}
                    </button>
                  ))}
                </div>
              </div>
              {mediaMode === "upload" ? (
                <MediaPicker
                  label=""
                  file={media}
                  accept="video/*,image/*,audio/*"
                  dragOver={dragOver}
                  onDragOver={() => setDragOver(true)}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(f) => {
                    setDragOver(false);
                    setMedia(f);
                  }}
                  onPick={setMedia}
                />
              ) : (
                <LiveCapture
                  onCapture={setMedia}
                  labels={{
                    video: t("intake.recordVideo"),
                    photo: t("intake.recordPhoto"),
                    audio: t("intake.recordAudio"),
                    startCamera: t("intake.startCamera"),
                    startMic: t("intake.startMic"),
                    startRecording: t("intake.startRecording"),
                    stopRecording: t("intake.stopRecording"),
                    capturePhoto: t("intake.capturePhoto"),
                    retake: t("intake.retake"),
                    recording: t("intake.recordingIndicator"),
                    permissionError: t("intake.captureError"),
                    hint: t("intake.liveCaptureHint"),
                  }}
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="mb-0">{t("intake.manualLabel")}</Label>
                {speechRecognitionSupported && (
                  <div className="mb-1.5 flex items-center gap-2">
                    <select
                      value={micLang}
                      onChange={(e) => setMicLang(e.target.value)}
                      disabled={listening}
                      title={t("intake.micLanguage")}
                      className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-1.5 py-1 text-xs text-slate-700 dark:text-slate-300 disabled:opacity-50"
                    >
                      {MIC_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        listening
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                          : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent-500 hover:text-accent-600 dark:hover:border-accent-400 dark:hover:text-accent-300"
                      }`}
                      title={listening ? t("intake.micStop") : t("intake.micStart")}
                    >
                      {listening ? "⏹" : "🎤"} {listening ? t("intake.micListening") : t("intake.micStart")}
                    </button>
                  </div>
                )}
              </div>
              <Textarea
                rows={3}
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="e.g. Three crates of electronics arrived with visible water damage on the packaging..."
              />
              <p className="mt-1 text-xs ai-text-muted">{t("intake.manualHint")}</p>
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            <Button type="submit" disabled={running}>
              {running ? (
                <>
                  <Spinner size={16} /> {t("intake.running")}
                </>
              ) : (
                t("intake.run")
              )}
            </Button>
          </form>
        </CardBody>
      </Card>

      {hasStarted ? (
        <Card glow className="lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>{runId ? `Run ${runId}` : t("intake.running")}</CardTitle>
              <CardSubtitle>Agent Trace</CardSubtitle>
            </div>
            {overallStatus && (
              <Badge tone={overallTone}>
                {overallStatus === "po_mismatch" ? "PO Mismatch" : t(`common.${overallStatus}`) || overallStatus}
              </Badge>
            )}
          </CardHeader>
          <CardBody>
            {STEP_KEYS.map((key, i) => {
              const meta = AGENT_META[key];
              const s = steps[key];
              return (
                <AgentFlowCard
                  key={key}
                  agentKey={key}
                  icon={meta.icon}
                  title={t(meta.titleKey)}
                  subtitle={t(meta.subtitleKey)}
                  status={s.status}
                  facts={s.status === "ok" ? buildFacts(key, s.data, t) : []}
                  emptyMessage={t(meta.emptyKey)}
                  error={s.error}
                  raw={s.status === "ok" || s.status === "failed" ? s.data : undefined}
                  isLast={i === STEP_KEYS.length - 1}
                />
              );
            })}

            {overallStatus && overallStatus !== "po_mismatch" && runId && (
              <div className="flex items-center justify-between rounded-md bg-slate-100 dark:bg-slate-800/40 px-4 py-3">
                <span className="text-sm ai-text-secondary">
                  {overallStatus === "failed"
                    ? t("intake.pipelineFailed")
                    : overallStatus === "partial"
                    ? t("intake.pipelinePartial")
                    : t("intake.pipelineComplete")}
                </span>
                <Button size="sm" onClick={() => navigate(`/cases/${runId}`)}>
                  {t("intake.viewDetail")}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="flex min-h-[16rem] items-center justify-center border-dashed">
          <CardBody className="text-center text-sm text-slate-500">{t("intake.traceEmpty")}</CardBody>
        </Card>
      )}
      </div>

      {/* PO Mismatch modal */}
      <Modal
        open={!!poMismatch}
        onClose={() => setPoMismatch(null)}
        title={
          <span className="flex items-center gap-2 text-rose-400">
            <span>⚠️</span> Wrong Evidence Uploaded
          </span>
        }
      >
        {poMismatch && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-300 leading-relaxed">
              The video or file you uploaded contains a reference to a different purchase order than
              the one you selected. To protect against claims being filed against the wrong shipment,
              the pipeline has been stopped.
            </p>

            <div className="rounded-md border border-slate-700 bg-slate-800/60 divide-y divide-slate-700">
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-mono text-rose-400 border border-rose-500/30">
                  IN VIDEO
                </span>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">PO number found in the evidence</p>
                  <p className="font-mono text-base text-rose-300">{poMismatch.stated}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-mono text-sky-400 border border-sky-500/30">
                  SELECTED
                </span>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Order you picked in the form</p>
                  <p className="font-mono text-base text-sky-300">{poMismatch.selected}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
              <p className="font-semibold mb-1">What to do next</p>
              <ul className="list-disc list-inside space-y-1 text-amber-200/80">
                <li>If the video is correct, select <strong>{poMismatch.stated}</strong> in the Order dropdown and resubmit.</li>
                <li>If the order selection is correct, upload the evidence that belongs to <strong>{poMismatch.selected}</strong>.</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setPoMismatch(null)}>Close &amp; Fix</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MediaPicker({
  label,
  file,
  accept,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
}: {
  label: string;
  file: File | null;
  accept: string;
  dragOver?: boolean;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: (f: File) => void;
  onPick: (f: File | null) => void;
}) {
  const inputId = `media-${(label || "picker").replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver?.();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onDrop?.(f);
        }}
        onClick={() => document.getElementById(inputId)?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-accent-400 bg-accent-500/5"
            : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
        }`}
      >
        <span className="text-xl text-accent-500 dark:text-accent-400">⇪</span>
        <p className="mt-1 truncate text-xs ai-text-secondary">{file ? file.name : "Drop or click"}</p>
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}
