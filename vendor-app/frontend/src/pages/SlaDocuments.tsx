import React, { useEffect, useRef, useState } from "react";
import { api, ApiError, uploadFile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

// ── types ──────────────────────────────────────────────────────────────────
interface VendorSla {
  id: number;
  vendor_username: string;
  vendor_company_name?: string;
  sla_document_filename: string;
  sla_text_cache: string;
  liability_summary: string;
  customer_usernames: string[];
  uploaded_at?: string;
}

interface SlaAskResponse {
  answer: string;
  sources: string[];
}

// ── Web Speech API shims ───────────────────────────────────────────────────
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
const speechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// ── AskSlaBox ──────────────────────────────────────────────────────────────
function AskSlaBox({ slaId }: { slaId: number }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [result, setResult] = useState<SlaAskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (speechSynthesisSupported) window.speechSynthesis.cancel();
    };
  }, []);

  async function ask(spokenQuestion?: string) {
    const q = (spokenQuestion ?? question).trim();
    if (!q) return;
    setAsking(true);
    setError(null);
    try {
      const res = await api.post<SlaAskResponse>(`/api/vendors/sla/${slaId}/ask`, { question: q });
      setResult(res);
      if (res.answer) speak(res.answer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get an answer");
      setResult(null);
    } finally {
      setAsking(false);
    }
  }

  function toggleListening() {
    if (!speechRecognitionSupported) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new SpeechRecognitionCtor!();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++)
        transcript += event.results[i][0].transcript;
      setQuestion(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input failed — check microphone permissions");
    };
    recognition.onend = () => {
      setListening(false);
      setQuestion((current) => { if (current.trim()) ask(current.trim()); return current; });
    };
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  function speak(text: string) {
    if (!speechSynthesisSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-navy-600 dark:bg-navy-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ask AI about this SLA</p>
      <div className="flex w-full gap-2">
        <div className="flex-1 min-w-0">
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder-slate-500"
            placeholder={listening ? "Listening…" : "e.g. What's the liability cap for damaged shipments?"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          />
        </div>
        {speechRecognitionSupported && (
          <Button
            variant={listening ? "danger" : "secondary"}
            onClick={toggleListening}
            disabled={asking}
            title={listening ? "Stop listening" : "Ask by voice"}
          >
            {listening ? "⏹" : "🎤"}
          </Button>
        )}
        <Button onClick={() => ask()} disabled={asking || listening || !question.trim()}>
          {asking ? "Asking…" : "Ask"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {result?.answer && (
        <div className="rounded-lg bg-white p-3 text-sm text-slate-700 dark:bg-navy-800 dark:text-slate-200">
          <div className="flex items-start justify-between gap-2">
            <p className="flex-1">{result.answer}</p>
            {speechSynthesisSupported && (
              <button
                onClick={() => (speaking ? stopSpeaking() : speak(result.answer!))}
                className="shrink-0 text-base text-accent"
                title={speaking ? "Stop reading aloud" : "Read answer aloud"}
              >
                {speaking ? "🔇" : "🔊"}
              </button>
            )}
          </div>
          {result.sources.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-accent">Sources used</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {result.sources.map((s, i) => (
                  <li key={i} className="rounded bg-slate-50 p-2 text-xs text-slate-500 dark:bg-navy-900 dark:text-slate-400">{s}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SlaDocuments() {
  const { user } = useAuth();
  const { show } = useToast();
  const canUpload = false;
  const [slas, setSlas] = useState<VendorSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<VendorSla[]>("/api/vendors/sla");
      setSlas(data); // backend already filters by role
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load SLAs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user?.username]);

  function pickFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      show("error", "Only PDF files are supported");
      return;
    }
    setPendingFile(file);
  }

  async function upload() {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("vendor_username", user?.username ?? "");
      form.append("customer_usernames", "[]");
      await uploadFile("/api/vendors/sla/upload", form);
      show("success", "SLA uploaded and indexed for AI Q&A");
      setPendingFile(null);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteSla(id: number) {
    setDeletingId(id);
    try {
      await api.delete(`/api/vendors/sla/${id}`);
      show("success", "SLA deleted");
      setSlas((prev) => prev.filter((s) => s.id !== id));
      setConfirmId(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete SLA");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">SLA Documents</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {canUpload
            ? "Upload your Service Level Agreement PDFs. Each document is indexed so you can ask AI questions about it."
            : "Review vendor SLA documents and ask AI questions about them."}
        </p>
      </div>

      {/* Drop zone — admin only */}
      {canUpload && <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center transition-colors cursor-pointer ${
          dragOver ? "border-accent bg-accent/5" : "border-slate-300 dark:border-navy-600"
        }`}
        onClick={() => !pendingFile && inputRef.current?.click()}
      >
        <span className="text-4xl">📄</span>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pendingFile ? (
            <span className="font-medium text-slate-800 dark:text-slate-200">{pendingFile.name}</span>
          ) : (
            "Drag & drop a PDF here, or click to choose"
          )}
        </p>
        {!pendingFile && (
          <Button onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} disabled={uploading}>
            Choose file
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }}
        />
      </div>}

      {/* Confirm panel — admin only */}
      {canUpload && pendingFile && (
        <Card className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{pendingFile.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Will be indexed and made available to your linked customers automatically.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload SLA"}
            </Button>
            <Button variant="secondary" onClick={() => setPendingFile(null)} disabled={uploading}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* SLA list */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Your Uploaded SLAs</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : slas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-12 text-center dark:border-navy-700">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-slate-500 dark:text-slate-400">No SLA documents uploaded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {slas.map((sla) => (
              <Card key={sla.id} className="flex flex-col gap-3 p-5">
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Freight ERP</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{sla.sla_document_filename}</p>
                      {sla.uploaded_at && (
                        <p className="text-[11px] text-slate-400">
                          Uploaded {new Date(sla.uploaded_at).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  {canUpload && (
                    <Button
                      variant="danger"
                      onClick={() => setConfirmId(sla.id)}
                      disabled={deletingId === sla.id}
                    >
                      {deletingId === sla.id ? "Deleting…" : "Delete"}
                    </Button>
                  )}
                </div>

                {/* Liability summary */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Liability Summary</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{sla.liability_summary}</p>
                </div>

                {/* Full text toggle */}
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-accent hover:underline">
                    View extracted text
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-navy-900 dark:text-slate-300">
                    {sla.sla_text_cache}
                  </pre>
                </details>

                {/* Shared with */}
                <p className="text-xs text-slate-400">
                  Shared with: {sla.customer_usernames.length > 0 ? sla.customer_usernames.join(", ") : "all linked customers"}
                </p>

                {/* AI Q&A */}
                <AskSlaBox slaId={sla.id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="Delete SLA?"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          This SLA document will be removed and customers will no longer be able to view or ask about it.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmId !== null && deleteSla(confirmId)}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
