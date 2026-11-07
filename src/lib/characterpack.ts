import type { Meta } from "../types";

/**
 * LUMIÈRE — the hosted character pack: movie character art from Jay's own
 * library (the chrissix Kodi pack, converted to WebP and hosted as static
 * files), matched Kodi-style by title + year.
 *
 * This module exists because fanart.tv's API turned out to be a dead end
 * for movies: verified live on Nov 7, 2026, its v3 movie payloads carry no
 * `characterart` field at all (the art type is served for TV shows only).
 * The pack is the fork's movie source instead — see fanart.ts for how the
 * two sources divide the work.
 *
 * Everything degrades silently, exactly like the fanart path: a failed
 * manifest fetch, a malformed manifest, or simply no match all resolve to
 * an empty array and the hero stays stock.
 */

/** Where the pack lives: the manifest and the images sit side by side. */
export const CHARACTER_PACK_BASE_URL =
  "https://lumiere-characterart.netlify.app";

export const CHARACTER_PACK_MANIFEST_URL = `${CHARACTER_PACK_BASE_URL}/manifest.json`;

/** Most cutouts stood up from one pack entry — mirrors MAX_CHARACTER_ART. */
export const PACK_ART_LIMIT = 5;

export type CharacterPackEntry = {
  title: string;
  year: number;
  files: string[];
};

export type CharacterPackManifest = Record<string, CharacterPackEntry>;

/**
 * The fields of a Meta the pack can match on. Metas in the wild carry the
 * year in several places — a dedicated `year` (number or string), the
 * Stremio `releaseInfo` ("2018", "2018–2023"), or an ISO `released` date —
 * so the input type admits all of them and `metaYear` digs the year out.
 */
export type CharacterPackMeta = Pick<
  Meta,
  "name" | "releaseInfo" | "released"
> & { year?: number | string };

/**
 * The manifest's title normalization, character for character: lowercase,
 * then every run of non-alphanumerics collapses to a single space, trimmed.
 * Colons, hyphens, ampersands, periods — and apostrophes — all become word
 * boundaries: "A Bug's Life" → "a bug s life", "Ant-Man" → "ant man",
 * "Batman & Robin" → "batman robin". Verified against the live manifest.
 */
export function normalizePackTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The manifest lookup key for a title + year: "avengers infinity war 2018". */
export function characterPackKey(title: string, year: number): string {
  return `${normalizePackTitle(title)} ${year}`;
}

const YEAR_PATTERN = /(?:19|20)\d{2}/;

function yearFromValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const match = String(Math.trunc(value)).match(YEAR_PATTERN);
    return match ? Number(match[0]) : undefined;
  }
  if (typeof value === "string") {
    const match = value.match(YEAR_PATTERN);
    return match ? Number(match[0]) : undefined;
  }
  return undefined;
}

/**
 * The release year a Meta carries, wherever it carries it: a `year` field
 * (number or string) first, then `releaseInfo`, then `released`. Undefined
 * when none of them holds a plausible 4-digit year.
 */
export function metaYear(meta: CharacterPackMeta): number | undefined {
  return (
    yearFromValue(meta.year) ??
    yearFromValue(meta.releaseInfo) ??
    yearFromValue(meta.released)
  );
}

function entryFiles(entry: CharacterPackEntry | undefined): string[] {
  if (!entry || !Array.isArray(entry.files)) return [];
  return entry.files.filter(
    (file): file is string => typeof file === "string" && file.length > 0,
  );
}

function entryNormalizedTitle(
  key: string,
  entry: CharacterPackEntry,
): string {
  if (typeof entry.title === "string" && entry.title) {
    return normalizePackTitle(entry.title);
  }
  // Fall back to the key itself with its trailing year stripped.
  return key.replace(/ \d{4}$/, "");
}

function filesToUrls(files: string[], limit: number): string[] {
  return files
    .slice(0, Math.max(0, limit))
    .map(
      (file) => `${CHARACTER_PACK_BASE_URL}/${encodeURIComponent(file)}`,
    );
}

/**
 * A manifest + a Meta → the pack image URLs to stand up, in manifest file
 * order, capped at `limit`. Pure — the tests assert against this directly.
 *
 * With a year, the match is exact: the title+year key or nothing. Without
 * one, a title-only match is used ONLY when exactly one manifest entry
 * carries that normalized title — remakes sharing a title (two
 * "Alice in Wonderland" entries, 1951 and 2010) are never guessed between.
 */
export function resolvePackCharacterArt(
  manifest: CharacterPackManifest,
  meta: CharacterPackMeta,
  limit: number = PACK_ART_LIMIT,
): string[] {
  const title = typeof meta.name === "string" ? meta.name.trim() : "";
  if (!title || !manifest || typeof manifest !== "object") return [];
  const normalized = normalizePackTitle(title);
  if (!normalized) return [];

  const year = metaYear(meta);
  if (year !== undefined) {
    return filesToUrls(
      entryFiles(manifest[characterPackKey(title, year)]),
      limit,
    );
  }

  const matches = Object.entries(manifest).filter(
    ([key, entry]) => entryNormalizedTitle(key, entry) === normalized,
  );
  if (matches.length !== 1) return [];
  return filesToUrls(entryFiles(matches[0][1]), limit);
}

const REQUEST_TIMEOUT_MS = 8000;

/** The manifest fetch: one shared promise for the whole session. */
let manifestPromise: Promise<CharacterPackManifest> | undefined;

async function requestManifest(): Promise<CharacterPackManifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(CHARACTER_PACK_MANIFEST_URL, {
      signal: controller.signal,
    });
    if (!response.ok) return {};
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {};
    }
    return payload as CharacterPackManifest;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** The pack manifest, fetched at most once per session; failure = empty. */
export function fetchCharacterPackManifest(): Promise<CharacterPackManifest> {
  if (!manifestPromise) manifestPromise = requestManifest();
  return manifestPromise;
}

/** Resolved lookups, by match key: heroes rotate, titles don't re-resolve. */
const resultCache = new Map<string, Promise<string[]>>();

/**
 * The character cutout URLs for a movie Meta from the hosted pack — or an
 * empty array when the title can't be matched or anything goes wrong.
 * A Meta with no usable title resolves without touching the network.
 */
export function fetchPackCharacterArt(
  meta: CharacterPackMeta,
  limit: number = PACK_ART_LIMIT,
): Promise<string[]> {
  const title = typeof meta.name === "string" ? meta.name.trim() : "";
  if (!title) return Promise.resolve([]);
  const year = metaYear(meta);
  const cacheKey =
    year !== undefined
      ? characterPackKey(title, year)
      : `title-only:${normalizePackTitle(title)}`;
  let pending = resultCache.get(cacheKey);
  if (!pending) {
    pending = fetchCharacterPackManifest().then((manifest) =>
      resolvePackCharacterArt(manifest, meta, limit),
    );
    resultCache.set(cacheKey, pending);
    if (resultCache.size > 120) {
      resultCache.delete(resultCache.keys().next().value as string);
    }
  }
  return pending;
}

/** Test support: forget the cached manifest and every resolved lookup. */
export function resetCharacterPackCacheForTests(): void {
  manifestPromise = undefined;
  resultCache.clear();
}
