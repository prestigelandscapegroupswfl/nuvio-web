import type { Meta } from "../types";
import { fetchPackCharacterArt } from "./characterpack.ts";

/**
 * LUMIÈRE — Kodi-style character art for the hero.
 *
 * The stock client has no slot for "characterart" artwork: AIOMetadata only
 * ever fills poster / background / logo. This module is the fork's dispatch
 * side — given a title's Meta it picks the source that can actually serve
 * it and hands the cutouts to the CharacterArt component. Everything
 * degrades silently: no match, no key, or a failed request all mean
 * "render nothing extra", which is the stock behaviour.
 *
 * SOURCES, in precedence order:
 *
 * 1. **Movies → the hosted character pack** (src/lib/characterpack.ts):
 *    Jay's own Kodi character-art library, matched by title + year. This
 *    is the ONLY movie source — fanart.tv's API is a dead end for movies:
 *    verified live on Nov 7, 2026, its v3 movie payloads carry no
 *    `characterart` field at all (that art type is API-served for TV
 *    shows only), so there is deliberately no API fallback for movies.
 * 2. **Series → the fanart.tv API path below**, retained for future use.
 *    Today it resolves nothing: fanart.tv's TV endpoint keys on TVDB ids,
 *    which a Meta does not carry, so `fanartIdForMeta` returns undefined
 *    and the lookup stops before any request. Wiring series up is a
 *    matter of resolving a TVDB id first (TMDB's `/tv/{id}/external_ids`
 *    during enrichment) — the fetch/selection code is already here.
 */

// ─── Configuration — the ONE place the fanart.tv key lives ────────────────
//
// Set VITE_FANART_API_KEY in .env.local (or the deploy environment) at build
// time. The fallback constant below exists so the key can also be baked in
// by editing exactly one line — leave it EMPTY in the tree. The key gates
// the fanart.tv API path only (series, future use): with no key that path
// never makes a request. Movie character art needs no key at all — it comes
// from the hosted pack (see characterpack.ts).
const FANART_API_KEY_FALLBACK = "";

export const FANART_API_KEY: string =
  import.meta.env?.VITE_FANART_API_KEY || FANART_API_KEY_FALLBACK;

/** True only when a fanart.tv key is configured; the API path is inert without one. */
export const characterArtEnabled = FANART_API_KEY.trim().length > 0;

/** Most characters ever stood up in a hero at once. */
export const MAX_CHARACTER_ART = 5;

/**
 * Standing heights for the strip, as a percentage of the strip's own height,
 * in display order. The variation is what reads as a lineup rather than a
 * fence: a tall lead, a shorter second, and so on — the same staggered feel
 * as Kodi's character-art skins and the LUMIÈRE mockup.
 */
export const CHARACTER_STRIP_HEIGHTS = [100, 88, 95, 84, 92] as const;

/** How far each subsequent cutout tucks behind the previous one, in %. */
export const CHARACTER_STRIP_OVERLAP = 14;

/** One slot of the character strip: where a cutout stands and how tall. */
export type CharacterSlot = {
  heightPct: number;
  overlapPct: number;
  zIndex: number;
};

/**
 * The strip's layout for `count` characters. Pure, so the proof harness can
 * lay out a fixture with exactly the numbers the component renders with.
 */
export function characterStripLayout(count: number): CharacterSlot[] {
  const shown = Math.max(0, Math.min(count, MAX_CHARACTER_ART));
  return Array.from({ length: shown }, (_, index) => ({
    heightPct: CHARACTER_STRIP_HEIGHTS[index],
    overlapPct: index === 0 ? 0 : CHARACTER_STRIP_OVERLAP,
    zIndex: index + 1,
  }));
}

/**
 * The id fanart.tv's movie endpoint expects for this title: a TMDB id when
 * the Meta carries one (`tmdb:299536`, or a bare numeric id), else its IMDb
 * id (`tt…`) — the endpoint accepts either. Mirrors the id handling in
 * metadataEnrichment.ts. Undefined when the title is not a movie or carries
 * neither id, in which case there is nothing to look up. Retained for the
 * fanart API path (future series support); movies no longer route here —
 * they resolve from the character pack instead.
 */
export function fanartIdForMeta(
  meta: Pick<Meta, "id" | "type">,
): string | undefined {
  if (meta.type !== "movie") return undefined;
  const tmdb =
    meta.id.match(/^tmdb:(\d+)/i)?.[1] || meta.id.match(/^(\d+)$/)?.[1];
  if (tmdb) return tmdb;
  return meta.id.match(/tt\d+/i)?.[0]?.toLowerCase();
}

type FanartImage = { url: string; likes: number };

function fanartImages(payload: unknown): FanartImage[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as { characterart?: unknown }).characterart;
  if (!Array.isArray(rows)) return [];
  const images: FanartImage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const url = (row as { url?: unknown }).url;
    if (typeof url !== "string" || !url) continue;
    const likes = Number((row as { likes?: unknown }).likes);
    images.push({ url, likes: Number.isFinite(likes) ? likes : 0 });
  }
  return images;
}

/**
 * A fanart.tv movie payload → the character cutout URLs to stand up: the
 * `characterart` array, best-liked first, capped at MAX_CHARACTER_ART.
 * Pure — this is the selection the component renders and the tests assert.
 */
export function pickCharacterArt(
  payload: unknown,
  limit: number = MAX_CHARACTER_ART,
): string[] {
  return fanartImages(payload)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, Math.max(0, limit))
    .map((image) => image.url);
}

const REQUEST_TIMEOUT_MS = 8000;

/** Session cache, by fanart id: rows re-render and heroes rotate, titles don't refetch. */
const cache = new Map<string, Promise<string[]>>();

async function requestCharacterArt(id: string): Promise<string[]> {
  const url = `https://webservice.fanart.tv/v3/movies/${encodeURIComponent(id)}?api_key=${encodeURIComponent(FANART_API_KEY)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    return pickCharacterArt(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The character cutout URLs for a title, best first — or an empty array for
 * anything at all that goes wrong or simply has none. Cached per session.
 *
 * Dispatch, by precedence (see the module header): a MOVIE resolves from
 * the hosted character pack, matched by title + year — the pack is the
 * only movie source, and no fanart key is needed for it. Anything else
 * takes the fanart.tv API path below, which is gated on a configured key
 * and, today, stops at id resolution: a Meta carries no TVDB id, so
 * series resolve to nothing rather than guessing.
 */
export function fetchCharacterArt(
  meta: Pick<Meta, "id" | "type" | "name" | "releaseInfo" | "released"> & {
    year?: number | string;
  },
): Promise<string[]> {
  if (meta.type === "movie") {
    return fetchPackCharacterArt(meta, MAX_CHARACTER_ART);
  }
  if (!characterArtEnabled) return Promise.resolve([]);
  const id = fanartIdForMeta(meta);
  if (!id) return Promise.resolve([]);
  let pending = cache.get(id);
  if (!pending) {
    pending = requestCharacterArt(id);
    cache.set(id, pending);
    if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  }
  return pending;
}
