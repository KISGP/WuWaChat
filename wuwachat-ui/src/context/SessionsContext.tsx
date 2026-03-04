import { createContext, useContext, useState, ReactNode } from "react";

interface SessionContextType {
  AllSessions: AllSessions;
  setAllSessions: (sessions: AllSessions) => void;
  currentSessionId: Session["session_id"] | null;
  setCurrentSessionId: (session: Session["session_id"] | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [AllSessions, setAllSessions] = useState<AllSessions>([]);

  const [currentSessionId, setCurrentSessionId] = useState<
    Session["session_id"] | null
  >(null);

  return (
    <SessionContext.Provider
      value={{
        AllSessions,
        currentSessionId,
        setCurrentSessionId,
        setAllSessions,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

export type { SessionContextType };
