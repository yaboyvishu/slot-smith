"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const DEMO_CREDENTIALS = {
  email: "demo@slotsmith.app",
  password: "demo123",
  name: "Demo User",
} as const;

export interface DemoUser {
  email: string;
  name: string;
}

interface DemoSessionContextValue {
  user: DemoUser | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);
const userStorageKey = "slotsmith-demo-user";
function readSavedUser(): DemoUser | null {
  const storedValue = localStorage.getItem(userStorageKey);
  if (!storedValue) return null;

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    if (
      parsedValue &&
      typeof parsedValue === "object" &&
      "email" in parsedValue &&
      parsedValue.email === DEMO_CREDENTIALS.email
    ) {
      return { email: DEMO_CREDENTIALS.email, name: DEMO_CREDENTIALS.name };
    }
  } catch {
    return null;
  }

  return null;
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);

  useEffect(() => {
    // Demo login only: this browser storage is not real authentication or security.
    const timeoutId = window.setTimeout(() => {
      const savedUser = readSavedUser();
      if (savedUser) {
        setUser(savedUser);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const login = useCallback((email: string, password: string) => {
    if (
      email.trim().toLowerCase() !== DEMO_CREDENTIALS.email ||
      password !== DEMO_CREDENTIALS.password
    ) {
      return false;
    }

    const demoUser: DemoUser = {
      email: DEMO_CREDENTIALS.email,
      name: DEMO_CREDENTIALS.name,
    };
    localStorage.setItem(userStorageKey, JSON.stringify(demoUser));
    setUser(demoUser);
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(userStorageKey);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout }),
    [user, login, logout],
  );

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
    </DemoSessionContext.Provider>
  );
}

export function useDemoSession() {
  const context = useContext(DemoSessionContext);
  if (!context) {
    throw new Error("useDemoSession must be used inside DemoSessionProvider");
  }
  return context;
}
