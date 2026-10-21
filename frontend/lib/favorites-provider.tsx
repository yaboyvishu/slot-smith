"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  readFavoriteProjects,
  writeFavoriteProjects,
} from "./favorites";
import type { FavoriteProject } from "./favorites";

interface FavoritesContextValue {
  favorites: FavoriteProject[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (project: Pick<FavoriteProject, "id" | "name">) => void;
  removeFavorite: (id: string) => void;
  updateFavoriteName: (id: string, name: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteProject[]>([]);
  const favoritesRef = useRef<FavoriteProject[]>([]);

  useEffect(() => {
    const saved = readFavoriteProjects();
    favoritesRef.current = saved;
    setFavorites(saved);
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((favorite) => favorite.id === id),
    [favorites],
  );

  const toggleFavorite = useCallback(
    ({ id, name }: Pick<FavoriteProject, "id" | "name">) => {
      if (!id.trim() || !name.trim()) return;
      const next = favorites.some((favorite) => favorite.id === id)
        ? favorites.filter((favorite) => favorite.id !== id)
        : [{ id, name, saved_at: new Date().toISOString() }, ...favorites];
      favoritesRef.current = next;
      setFavorites(next);
      writeFavoriteProjects(next);
    },
    [favorites],
  );

  const removeFavorite = useCallback(
    (id: string) => {
      const next = favorites.filter((favorite) => favorite.id !== id);
      favoritesRef.current = next;
      setFavorites(next);
      writeFavoriteProjects(next);
    },
    [favorites],
  );

  const updateFavoriteName = useCallback((id: string, name: string) => {
    if (!name.trim()) return;
    const current = favoritesRef.current.find((favorite) => favorite.id === id);
    if (!current || current.name === name) return;
    const next = favoritesRef.current.map((favorite) =>
      favorite.id === id ? { ...favorite, name } : favorite,
    );
    favoritesRef.current = next;
    setFavorites(next);
    writeFavoriteProjects(next);
  }, []);

  const value = useMemo(
    () => ({
      favorites,
      isFavorite,
      toggleFavorite,
      removeFavorite,
      updateFavoriteName,
    }),
    [favorites, isFavorite, toggleFavorite, removeFavorite, updateFavoriteName],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used inside FavoritesProvider.");
  }
  return context;
}
