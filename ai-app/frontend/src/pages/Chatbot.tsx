import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "../components/ui";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

// â”€â”€â”€ Date grouping helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function groupSessionsByDate(sessions: ChatSession[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const threeDaysAgo = new Date(todayStart.getTime() - 3 * 86400000);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400000);

  const groups: { label: string; sessions: ChatSession[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "3 days ago", sessions: [] },
    { label: "7 days ago", sessions: [] },
    { label: "Last 30 days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updated_at);
    if (d >= todayStart) groups[0].sessions.push(s);
    else if (d >= yesterdayStart) groups[1].sessions.push(s);
    else if (d >= threeDaysAgo) groups[2].sessions.push(s);
    else if (d >= sevenDaysAgo) groups[3].sessions.push(s);
    else if (d >= thirtyDaysAgo) groups[4].sessions.push(s);
    else groups[5].sessions.push(s);
  }

  return groups.filter((g) => g.sessions.length > 0);
}

// â”€â”€â”€ Markdown-lite renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let key = 0;

  const inlineFormat = (line: string) => {
    // bold **text** and `code`
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={i} className="font-semibold ai-text-primary">{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`"))
        return <code key={i} className="rounded bg-slate-700/60 px-1 py-0.5 text-xs font-mono text-accent-300">{p.slice(1, -1)}</code>;
      return p;
    });
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        elements.push(
          <pre key={key++} className="my-2 overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 p-3 text-xs font-mono text-slate-700 dark:text-slate-300">
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
    } else if (inCode) {
      codeLines.push(line);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="mt-3 mb-1 text-sm font-semibold ai-text-primary">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="mt-3 mb-1 text-sm font-bold text-slate-50">{line.slice(3)}</h2>);
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <li key={key++} className="ml-4 list-disc text-sm leading-relaxed ai-text-secondary">
          {inlineFormat(line.slice(2))}
        </li>
      );
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <li key={key++} className="ml-4 list-decimal text-sm leading-relaxed ai-text-secondary">
          {inlineFormat(line.replace(/^\d+\. /, ""))}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed ai-text-secondary">
          {inlineFormat(line)}
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// â”€â”€â”€ Greeting helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getGreeting(name: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${time}, ${name}`;
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Chatbot() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // â”€â”€ Load sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get("/api/chat/sessions");
      setSessions(data as ChatSession[]);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // â”€â”€ Auto-scroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  // â”€â”€ Close context menu on outside click â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // â”€â”€ Auto-resize textarea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function handleNewChat() {
    try {
      const session = await api.post("/api/chat/sessions", {});
      setSessions((prev) => [session as ChatSession, ...prev]);
      setActiveSession(session as ChatSession);
      setInput("");
    } catch (err) {
      console.error("Failed to create session", err);
    }
  }

  async function handleSelectSession(s: ChatSession) {
    // Reload full session (with all messages) on select
    try {
      const full = await api.get(`/api/chat/sessions/${s.session_id}`);
      setActiveSession(full as ChatSession);
    } catch {
      setActiveSession(s);
    }
    setMenuOpen(null);
  }

  async function handleDeleteSession(session_id: string) {
    try {
      await api.delete(`/api/chat/sessions/${session_id}`);
      setSessions((prev) => prev.filter((s) => s.session_id !== session_id));
      if (activeSession?.session_id === session_id) setActiveSession(null);
    } catch {}
    setMenuOpen(null);
  }

  async function handleClearAll() {
    try {
      await api.delete("/api/chat/sessions");
      setSessions([]);
      setActiveSession(null);
    } catch {}
    setClearConfirm(false);
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    let session = activeSession;
    if (!session) {
      try {
        session = (await api.post("/api/chat/sessions", {})) as ChatSession;
        setSessions((prev) => [session!, ...prev]);
      } catch {
        return;
      }
    }

    // Optimistically add user message
    const optimisticMsg: ChatMessage = { role: "user", content: q, timestamp: new Date().toISOString() };
    setActiveSession((prev) => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : null);
    setInput("");
    setLoading(true);

    try {
      const result = await api.post("/api/chat/ask", { session_id: session.session_id, question: q }) as { answer: string; session: ChatSession };
      setActiveSession(result.session);
      setSessions((prev) =>
        prev.map((s) => s.session_id === result.session.session_id ? { ...s, title: result.session.title, updated_at: result.session.updated_at } : s)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      );
    } catch (err) {
      const errMsg: ChatMessage = { role: "assistant", content: "Sorry, something went wrong. Please try again.", timestamp: new Date().toISOString() };
      setActiveSession((prev) => prev ? { ...prev, messages: [...prev.messages, errMsg] } : null);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // â”€â”€ Filtered + grouped sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const filteredSessions = sessions.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupSessionsByDate(filteredSessions);

  const displayName = user?.display_name || user?.username || "there";

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-950">

      {/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50">

        {/* Sidebar top: icons + search */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/60 px-3 py-3">
          <button
            onClick={handleNewChat}
            title="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-accent-600 dark:hover:text-accent-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-2.207 2.207L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            title="Clear all conversations"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-500 dark:hover:text-red-400"
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
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 py-1.5 pl-7 pr-2 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-accent-500 dark:focus:border-accent-500/50 focus:ring-0"
            />
            <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-500">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessionsLoading ? (
            <div className="flex justify-center py-8"><Spinner size={14} /></div>
          ) : grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-600">
              No conversations yet.<br />Start one below.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {group.label}
                </div>
                {group.sessions.map((s) => (
                  <div key={s.session_id} className="relative px-2">
                    <button
                      onClick={() => handleSelectSession(s)}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                        activeSession?.session_id === s.session_id
                          ? "bg-accent-500/10 text-accent-300 border border-accent-500/20"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <span className="flex-1 truncate text-xs leading-snug">{s.title}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === s.session_id ? null : s.session_id); }}
                        className="invisible flex-shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-300 group-hover:visible"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                          <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                    </button>
                    {menuOpen === s.session_id && (
                      <div ref={menuRef} className="absolute right-3 top-8 z-50 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl">
                        <button
                          onClick={() => handleDeleteSession(s.session_id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-.894.553L4.382 4H2a1 1 0 000 2v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 100-2h-2.382l-.724-1.447A1 1 0 0010 2H6z" clipRule="evenodd" />
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

      {/* â”€â”€ Main chat area â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative flex flex-1 flex-col overflow-hidden">

        {/* Messages or empty state */}
        <div className="flex-1 overflow-y-auto">
          {!activeSession || activeSession.messages.length === 0 ? (
            /* Empty state â€” agent icon + greeting */
            <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
              {/* Animated agent logo */}
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-accent-500/30 bg-gradient-to-br from-slate-800 to-slate-900 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
                  <span className="text-4xl">âŒ¬</span>
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-[8px] font-bold text-slate-950">AI</span>
              </div>

              <div>
                <h2 className="text-2xl font-semibold ai-text-primary">{getGreeting(displayName)}</h2>
                <p className="mt-1 text-sm text-slate-500">FreightBot is ready to help with claims, policies, and logistics.</p>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {[
                  "How do I file a damage claim?",
                  "What is the SLA for claim resolution?",
                  "How does the reorder agent work?",
                  "Explain the pipeline steps",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                    className="rounded-full border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-accent-500/40 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-accent-600 dark:hover:text-accent-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
              {activeSession.messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  {msg.role === "assistant" ? (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-accent-500/30 bg-slate-100 dark:bg-slate-800 text-sm">
                      âŒ¬
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-500/20 text-xs font-bold text-accent-300 uppercase">
                      {displayName.slice(0, 2)}
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "rounded-tr-sm bg-accent-500/15 border border-accent-500/20 text-slate-800 dark:text-slate-200"
                        : "rounded-tl-sm bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/50"
                    }`}
                  >
                    {msg.role === "assistant"
                      ? renderMarkdown(msg.content)
                      : <p className="text-sm leading-relaxed">{msg.content}</p>}
                  </div>
                </div>
              ))}

              {/* Streaming indicator */}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-accent-500/30 bg-slate-100 dark:bg-slate-800 text-sm">
                    âŒ¬
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/70 px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* â”€â”€ Glass input bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="relative px-4 pb-4 pt-2">
          {/* Mirror glow layer */}
          <div className="pointer-events-none absolute inset-x-4 -top-6 h-8 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />

          <div className="relative mx-auto max-w-3xl">
            {/* Outer glass shell */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white/90 dark:bg-slate-800/40 shadow-sm dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
              {/* Subtle top-edge sheen */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-slate-500/30 to-transparent" />

              <div className="flex items-end gap-2 px-4 py-3">
                {/* Agent avatar inside input */}
                <div className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-accent-500/40 bg-gradient-to-br from-slate-700 to-slate-800 text-sm shadow-[0_0_8px_rgba(34,211,238,0.2)]">
                  âŒ¬
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask FreightBot anything about your freight operationsâ€¦"
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none disabled:opacity-50"
                  style={{ maxHeight: "180px", lineHeight: "1.5" }}
                />

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-accent-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)] transition-all hover:bg-accent-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.5)] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                >
                  {loading ? (
                    <Spinner size={14} />
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Hint */}
              <div className="px-4 pb-2 text-[10px] text-slate-400 dark:text-slate-600">
                Press <kbd className="rounded border border-slate-300 dark:border-slate-700 px-1 font-mono">Enter</kbd> to send Â· <kbd className="rounded border border-slate-300 dark:border-slate-700 px-1 font-mono">Shift+Enter</kbd> for new line
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Clear-all confirm dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {clearConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-sm font-semibold ai-text-primary">Clear all conversations?</h3>
            <p className="mt-1 text-xs text-slate-500">This permanently deletes all your chat sessions and cannot be undone.</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setClearConfirm(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-medium text-white hover:bg-red-500"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



