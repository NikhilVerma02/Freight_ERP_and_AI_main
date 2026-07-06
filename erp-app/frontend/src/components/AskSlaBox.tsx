import React, { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import type { SlaAskResponse } from "../lib/types";

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
const speechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function AskSlaBox({ slaId }: { slaId: number }) {
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
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor!();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setQuestion(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input failed — check microphone permissions");
    };
    recognition.onend = () => {
      setListening(false);
      setQuestion((current) => {
        if (current.trim()) ask(current.trim());
        return current;
      });
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
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-navy-600 dark:bg-navy-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ask AI about this SLA</p>
      <div className="flex w-full gap-2">
        <Input
          wrapperClassName="flex-1 min-w-0"
          className="w-full"
          placeholder={listening ? "Listening…" : "e.g. What's the liability cap for damaged shipments?"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
        />
        {speechRecognitionSupported && (
          <Button
            variant={listening ? "danger" : "secondary"}
            onClick={toggleListening}
            disabled={asking}
            title={listening ? "Stop listening" : "Ask by voice"}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
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
                aria-label={speaking ? "Stop reading aloud" : "Read answer aloud"}
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
                  <li key={i} className="rounded bg-slate-50 p-2 text-xs text-slate-500 dark:bg-navy-900 dark:text-slate-400">
                    {s}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
