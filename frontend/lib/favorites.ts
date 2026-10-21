export interface FavoriteProject {
  id: string;
  name: string;
  saved_at: string;
}

const FAVORITES_KEY = "slotsmith.project-favorites";

export function readFavoriteProjects(): FavoriteProject[] {
  try {
    const saved = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];

    const newestFirst = parsed
      .filter((item): item is FavoriteProject =>
        !!item &&
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        typeof item.saved_at === "string" &&
        !Number.isNaN(Date.parse(item.saved_at)),
      )
      .sort((left, right) => Date.parse(right.saved_at) - Date.parse(left.saved_at));

    return newestFirst.filter(
      (favorite, index, list) =>
        list.findIndex((item) => item.id === favorite.id) === index,
    );
  } catch {
    return [];
  }
}

export function writeFavoriteProjects(favorites: FavoriteProject[]) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Keep favorites usable for this session even when browser storage is blocked.
  }
}
