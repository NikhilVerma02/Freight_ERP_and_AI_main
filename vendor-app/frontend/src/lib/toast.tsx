import React, { createContext, useCallback, useContext, useState } from "react";

type Tone = "success" | "error" | "info";
interface Toast { id: number; tone: Tone; message: string; }

interface ToastCtx { show: (tone: Tone, message: string) => void; }

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let next = 0;

  const show = useCallback((tone: Tone, message: string) => {
    const id = ++next;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const bg = { success: "bg-emerald-600", error: "bg-red-600", info: "bg-blue-600" };

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`${bg[t.tone]} text-white rounded-lg px-4 py-2.5 text-sm shadow-lg`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
