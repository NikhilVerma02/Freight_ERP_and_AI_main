import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

// ─── Speech recognition types ─────────────────────────────────────────────────

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

interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLike extends Event { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechSupported = !!SpeechRecognitionCtor;

// ─── Text-to-speech ────────────────────────────────────────────────────────────

const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

const SCRIPT_RANGES: { code: string; re: RegExp }[] = [
  { code: "bn-IN", re: /[ঀ-৿]/ },
  { code: "ta-IN", re: /[஀-௿]/ },
  { code: "te-IN", re: /[ఀ-౿]/ },
  { code: "gu-IN", re: /[઀-૿]/ },
  { code: "kn-IN", re: /[ಀ-೿]/ },
  { code: "pa-IN", re: /[਀-੿]/ },
  { code: "hi-IN", re: /[ऀ-ॿ]/ },
];

function detectSpeechLang(text: string): string {
  for (const { code, re } of SCRIPT_RANGES) if (re.test(text)) return code;
  return "en-US";
}

function stripMdForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .trim();
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage { role: "user" | "assistant"; content: string; error?: boolean }
interface StoredMessage { role: "user" | "assistant"; content: string; created_at?: string }
interface SessionSummary { id: string; title: string; created_at?: string; updated_at?: string; message_count: number }

// ─── Date grouping ─────────────────────────────────────────────────────────────

function groupSessions(sessions: SessionSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const d3 = new Date(today.getTime() - 3 * 86400000);
  const d7 = new Date(today.getTime() - 7 * 86400000);
  const d30 = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; items: SessionSummary[] }[] = [
    { label: "Today", items: [] }, { label: "Yesterday", items: [] },
    { label: "3 days ago", items: [] }, { label: "7 days ago", items: [] },
    { label: "Last 30 days", items: [] }, { label: "Older", items: [] },
  ];
  for (const s of sessions) {
    const d = new Date(s.updated_at || s.created_at || 0);
    if (d >= today)           groups[0].items.push(s);
    else if (d >= yesterday)  groups[1].items.push(s);
    else if (d >= d3)         groups[2].items.push(s);
    else if (d >= d7)         groups[3].items.push(s);
    else if (d >= d30)        groups[4].items.push(s);
    else                      groups[5].items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
}

function getGreeting(name: string) {
  const h = new Date().getHours();
  const t = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${t}, ${name}`;
}

// ─── Markdown-lite renderer (light + dark aware) ───────────────────────────────

function renderMd(text: string): React.ReactNode {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let inCode = false, codeLines: string[] = [], key = 0;
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{p.slice(2,-2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`"))
        return <code key={i} className="rounded bg-blue-50 dark:bg-slate-700/60 px-1 py-0.5 text-xs font-mono text-blue-700 dark:text-cyan-300 border border-blue-100 dark:border-transparent">{p.slice(1,-1)}</code>;
      return p;
    });
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(<pre key={key++} className="my-2 overflow-x-auto rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 p-3 text-xs font-mono text-slate-700 dark:text-slate-300">{codeLines.join("\n")}</pre>);
        codeLines = []; inCode = false;
      } else { inCode = true; }
    } else if (inCode) {
      codeLines.push(line);
    } else if (line.startsWith("## ")) {
      out.push(<h2 key={key++} className="mt-3 mb-1 text-sm font-bold text-slate-900 dark:text-slate-100">{line.slice(3)}</h2>);
    } else if (line.match(/^[-*] /)) {
      out.push(<li key={key++} className="ml-4 list-disc text-sm leading-relaxed text-slate-700 dark:text-slate-300">{inline(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      out.push(<div key={key++} className="h-2" />);
    } else {
      out.push(<p key={key++} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{inline(line)}</p>);
    }
  }
  return <div className="space-y-0.5">{out}</div>;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Chatbot() {
  const { user } = useAuth();
  const { show } = useToast();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [micLang, setMicLang] = useState("en-US");
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [search, setSearch] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBeforeRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => () => { recognitionRef.current?.stop(); if (ttsSupported) window.speechSynthesis.cancel(); }, []);

  function stopSpeaking() {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeakingIndex(null);
  }

  function toggleSpeak(index: number, content: string) {
    if (!ttsSupported) return;
    if (speakingIndex === index) { stopSpeaking(); return; }
    window.speechSynthesis.cancel();
    const text = stripMdForSpeech(content);
    const utter = new SpeechSynthesisUtterance(text);
    const lang = detectSpeechLang(text);
    utter.lang = lang;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang) ||
      window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (voice) utter.voice = voice;
    utter.onend = () => setSpeakingIndex((i) => (i === index ? null : i));
    utter.onerror = () => setSpeakingIndex((i) => (i === index ? null : i));
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utter);
  }

  function loadSessions(selectFirst = false) {
    api.get<SessionSummary[]>("/api/chatbot/sessions")
      .then((res) => {
        setSessions(res);
        if (selectFirst && res.length > 0) selectSession(res[0].id);
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load sessions"))
      .finally(() => setLoadingSessions(false));
  }

  useEffect(() => { loadSessions(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  function selectSession(id: string) {
    recognitionRef.current?.stop();
    stopSpeaking();
    setActiveSessionId(id);
    setLoadingMessages(true);
    setMenuOpen(null);
    api.get<{ messages: StoredMessage[] }>(`/api/chatbot/sessions/${id}`)
      .then((res) => setMessages(res.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load chat"))
      .finally(() => setLoadingMessages(false));
  }

  function startNewChat() {
    recognitionRef.current?.stop();
    stopSpeaking();
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    api.delete(`/api/chatbot/sessions/${id}`)
      .then(() => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (id === activeSessionId) startNewChat();
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to delete"));
    setMenuOpen(null);
  }

  function handleClearAll() {
    Promise.all(sessions.map((s) => api.delete(`/api/chatbot/sessions/${s.id}`))).then(() => {
      setSessions([]); startNewChat();
    }).catch(() => show("error", "Failed to clear sessions"));
    setClearConfirm(false);
  }

  function toggleListening() {
    if (!speechSupported) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    transcriptBeforeRef.current = input;
    const rec = new SpeechRecognitionCtor!();
    rec.continuous = true; rec.interimResults = true; rec.lang = micLang;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      const base = transcriptBeforeRef.current;
      setInput((base ? `${base} ` : "") + t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || sending) return;
    recognitionRef.current?.stop();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setSending(true);
    try {
      let sid = activeSessionId;
      if (!sid) {
        const s = await api.post<SessionSummary>("/api/chatbot/sessions");
        sid = s.id; setActiveSessionId(sid);
      }
      const res = await api.post<{ answer: string }>("/api/chatbot/ask", { question, session_id: sid });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      loadSessions(false);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: err instanceof ApiError ? err.message : "Something went wrong.", error: true }]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const displayName = user.display_name || user.username || "there";
  const initials = displayName.slice(0, 2).toUpperCase();
  const filtered = sessions.filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()));
  const grouped = groupSessions(filtered);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-[calc(100vh-7.5rem)] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950 shadow-sm">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50">

        {/* Top controls */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/60 px-3 py-3">
          <button
            onClick={startNewChat}
            title="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-cyan-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-2.207 2.207L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            title="Clear all"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-red-50 dark:hover:bg-slate-800 hover:text-red-500 dark:hover:text-red-400"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 py-1.5 pl-7 pr-2 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-400 dark:focus:border-cyan-500/50 focus:ring-1 focus:ring-blue-100 dark:focus:ring-transparent"
            />
            <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <svg className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
          ) : grouped.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-600">
              No conversations yet.<br />Start one below.
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">{g.label}</p>
                {g.items.map((s) => (
                  <div key={s.id} className="relative px-2">
                    <button
                      onClick={() => selectSession(s.id)}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                        s.id === activeSessionId
                          ? "bg-blue-50 dark:bg-cyan-500/10 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-cyan-500/20"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <span className="flex-1 truncate text-xs leading-snug">{s.title}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === s.id ? null : s.id); }}
                        className="invisible flex-shrink-0 rounded p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 group-hover:visible"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
                        </svg>
                      </button>
                    </button>
                    {menuOpen === s.id && (
                      <div ref={menuRef} className="absolute right-3 top-8 z-50 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-lg dark:shadow-xl">
                        <button
                          onClick={(e) => handleDelete(e, s.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-.894.553L4.382 4H2a1 1 0 000 2v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 100-2h-2.382l-.724-1.447A1 1 0 0010 2H6z" clipRule="evenodd"/>
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main chat area ──────────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white dark:bg-transparent">

        {/* Messages or empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <svg className="h-6 w-6 animate-spin text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
          ) : messages.length === 0 ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
              {/* Bot icon */}
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-200 dark:border-cyan-500/30 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 shadow-md dark:shadow-[0_0_40px_rgba(6,182,212,0.15)]">
                  <svg viewBox="0 0 40 40" fill="none" className="h-10 w-10">
                    <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" className="text-blue-300 dark:text-cyan-500/30"/>
                    <path d="M12 20h16M20 12v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-500 dark:text-cyan-400"/>
                    <circle cx="20" cy="20" r="4" fill="currentColor" className="text-blue-500 dark:text-cyan-400"/>
                  </svg>
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 dark:bg-cyan-500 text-[8px] font-bold text-white dark:text-slate-950">AI</span>
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{getGreeting(displayName)}</h2>
                <p className="mt-1 text-sm text-slate-500">Portal Assistant is here to help with orders, claims, inventory, and SLA terms.</p>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {[
                  "How do I file a damage claim?",
                  "What are my SLA terms?",
                  "Show me my recent orders",
                  "What is the claim deadline?",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                    className="rounded-full border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 shadow-sm transition-colors hover:border-blue-300 dark:hover:border-cyan-500/40 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-cyan-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {/* Avatar */}
                  {m.role === "assistant" ? (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 dark:border-cyan-500/30 bg-blue-50 dark:bg-slate-800 shadow-sm">
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" className="text-blue-300 dark:text-cyan-500/40"/>
                        <circle cx="10" cy="10" r="2.5" fill="currentColor" className="text-blue-500 dark:text-cyan-400"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 dark:bg-cyan-500/20 text-xs font-bold text-white dark:text-cyan-300 shadow-sm">
                      {initials}
                    </div>
                  )}

                  {/* Bubble + actions */}
                  <div className={`flex max-w-[78%] flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        m.role === "user"
                          ? "rounded-tr-sm bg-blue-600 dark:bg-cyan-500/15 dark:border dark:border-cyan-500/20 text-white dark:text-slate-200 shadow-sm"
                          : m.error
                            ? "rounded-tl-sm border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                            : "rounded-tl-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/50 shadow-sm"
                      }`}
                    >
                      {m.role === "assistant" && !m.error
                        ? renderMd(m.content)
                        : <p className="text-sm leading-relaxed">{m.content}</p>}
                    </div>

                    {m.role === "assistant" && !m.error && ttsSupported && (
                      <button
                        onClick={() => toggleSpeak(i, m.content)}
                        title={speakingIndex === i ? "Stop reading aloud" : "Read aloud"}
                        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                          speakingIndex === i
                            ? "text-blue-600 dark:text-cyan-300"
                            : "text-slate-400 dark:text-slate-600 hover:text-blue-600 dark:hover:text-cyan-300"
                        }`}
                      >
                        {speakingIndex === i ? (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 animate-pulse">
                            <path fillRule="evenodd" d="M5 5a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H6a1 1 0 01-1-1V5z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                            <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13" />
                          </svg>
                        )}
                        {speakingIndex === i ? "Stop" : "Listen"}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 dark:border-cyan-500/30 bg-blue-50 dark:bg-slate-800 shadow-sm">
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" className="text-blue-300 dark:text-cyan-500/40"/>
                      <circle cx="10" cy="10" r="2.5" fill="currentColor" className="text-blue-500 dark:text-cyan-400"/>
                    </svg>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/70 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1">
                      {[0,1,2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-blue-400 dark:bg-cyan-400"
                          animate={{ opacity: [0.3,1,0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────────── */}
        <div className="relative px-4 pb-4 pt-2">
          {/* Fade mask above input */}
          <div className="pointer-events-none absolute inset-x-4 -top-6 h-8 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />

          <div className="relative mx-auto max-w-3xl">
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 shadow-md dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] dark:backdrop-blur-xl">
              {/* Top sheen */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-blue-100 dark:via-slate-500/30 to-transparent" />

              <div className="flex items-end gap-2 px-4 py-3">
                {/* Bot avatar inside input */}
                <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 dark:border-cyan-500/40 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-800 shadow-sm dark:shadow-[0_0_8px_rgba(6,182,212,0.2)]">
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" className="text-blue-300 dark:text-cyan-500/40"/>
                    <circle cx="10" cy="10" r="2.5" fill="currentColor" className="text-blue-500 dark:text-cyan-400"/>
                  </svg>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask about orders, claims, inventory, or SLA terms…"
                  disabled={sending}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none disabled:opacity-50"
                  style={{ maxHeight: "160px", lineHeight: "1.5" }}
                />

                {/* Mic button */}
                {speechSupported && (
                  <button
                    onClick={toggleListening}
                    title={listening ? "Stop listening" : "Speak your question"}
                    className={`mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                      listening
                        ? "animate-pulse bg-red-100 dark:bg-red-500/30 text-red-500 dark:text-red-400 border border-red-300 dark:border-red-500/50"
                        : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-cyan-300"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/>
                    </svg>
                  </button>
                )}

                {/* Send */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-md dark:shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all hover:bg-blue-700 dark:hover:bg-cyan-400 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                  </svg>
                </button>
              </div>

              {/* Language selector + hint */}
              <div className="flex items-center justify-between px-4 pb-2.5">
                {speechSupported ? (
                  <select
                    value={micLang}
                    onChange={(e) => setMicLang(e.target.value)}
                    className="rounded-md border border-slate-200 dark:border-slate-700/60 bg-transparent px-1.5 py-0.5 text-[10px] text-slate-500 outline-none"
                  >
                    {MIC_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                ) : <span />}
                <p className="text-[10px] text-slate-400 dark:text-slate-600">
                  <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1 font-mono">Enter</kbd> to send ·{" "}
                  <kbd className="rounded border border-slate-200 dark:border-slate-700 px-1 font-mono">Shift+Enter</kbd> for new line
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Clear-all confirm ─────────────────────────────────────────────────── */}
      {clearConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-xl dark:shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Clear all conversations?</h3>
            <p className="mt-1 text-xs text-slate-500">This permanently deletes all your chat sessions.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setClearConfirm(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={handleClearAll} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-medium text-white hover:bg-red-500">Clear all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
