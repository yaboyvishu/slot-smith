"use client";

import { useState } from "react";
import { useFavorites } from "../lib/favorites-provider";

export default function FavoriteButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [announcement, setAnnouncement] = useState("");
  const saved = isFavorite(id);

  function handleClick() {
    toggleFavorite({ id, name });
    setAnnouncement(saved ? "Removed from favorites" : "Added to favorites");
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-label={`${saved ? "Remove" : "Add"} ${name} ${saved ? "from" : "to"} favorites`}
        aria-pressed={saved}
        onClick={handleClick}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-brand-maroon-strong bg-white transition hover:bg-pink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-maroon-strong ${saved ? "text-pink-700" : "text-brand-maroon"}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          className="size-5"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
        </svg>
      </button>
      <span role="status" aria-live="polite" className="text-xs text-slate-700">
        {announcement}
      </span>
    </span>
  );
}
