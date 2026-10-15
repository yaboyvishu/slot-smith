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

export const favoriteScreens = [
  { href: "/data", label: "Data setup" },
  { href: "/constraints", label: "Constraints" },
  { href: "/results", label: "Generate & results" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/export", label: "Export" },
] as const;

type FavoriteScreen = (typeof favoriteScreens)[number]["href"];

interface DemoSessionContextValue {
  userName: string | null;
  favorites: FavoriteScreen[];
  logIn: (name: string) => void;
  logOut: () => void;
  toggleFavorite: (href: FavoriteScreen) => void;
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);
const userStorageKey = "slotsmith-demo-user";
const favoritesStoragePrefix = "slotsmith-demo-favorites:";

function isFavoriteScreen(value: unknown): value is FavoriteScreen {
  return (
    typeof value === "string" &&
    favoriteScreens.some((screen) => screen.href === value)
  );
}

function readFavorites(name: string): FavoriteScreen[] {
  const storedValue = localStorage.getItem(
    `${favoritesStoragePrefix}${encodeURIComponent(name)}`,
  );

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    return Array.isArray(parsedValue)
      ? parsedValue.filter(isFavoriteScreen)
      : [];
  } catch {
    return [];
  }
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [userName, setUserName] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteScreen[]>([]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedName = localStorage.getItem(userStorageKey);
      if (storedName) {
        setUserName(storedName);
        setFavorites(readFavorites(storedName));
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const logIn = useCallback((name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return;
    }

    localStorage.setItem(userStorageKey, normalizedName);
    setUserName(normalizedName);
    setFavorites(readFavorites(normalizedName));
  }, []);

  const logOut = useCallback(() => {
    localStorage.removeItem(userStorageKey);
    setUserName(null);
    setFavorites([]);
  }, []);

  const toggleFavorite = useCallback(
    (href: FavoriteScreen) => {
      if (!userName) {
        return;
      }

      const nextFavorites = favorites.includes(href)
        ? favorites.filter((favorite) => favorite !== href)
        : [...favorites, href];
      localStorage.setItem(
        `${favoritesStoragePrefix}${encodeURIComponent(userName)}`,
        JSON.stringify(nextFavorites),
      );
      setFavorites(nextFavorites);
    },
    [favorites, userName],
  );

  const value = useMemo(
    () => ({ userName, favorites, logIn, logOut, toggleFavorite }),
    [userName, favorites, logIn, logOut, toggleFavorite],
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
