import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Alert } from "./types";

interface AlertsContextValue {
  unreadCount: number;
  refresh: () => void;
}

const AlertsContext = createContext<AlertsContextValue>({
  unreadCount: 0,
  refresh: () => {},
});

const POLL_INTERVAL_MS = 15000;

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    api
      .get<Alert[]>("/api/alerts")
      .then((alerts) => setUnreadCount(alerts.filter((a) => a.status === "unread").length))
      .catch(() => {
        /* silently ignore — badge just won't update this tick */
      });
  }, [token]);

  useEffect(() => {
    refresh();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (token) {
      intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, refresh]);

  return (
    <AlertsContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts(): AlertsContextValue {
  return useContext(AlertsContext);
}
