import type { CollectionFolder } from "../types";

/**
 * LUMIÈRE — animated folder artwork ("focus GIFs").
 *
 * Collection folders synced from the account can carry a focus GIF alongside
 * the static cover: Nuvio's TV client swaps to it while a tile is focused,
 * and this client never did — it rendered the cover and stopped. This module
 * is the decision half of the swap, kept pure so it is testable without a
 * DOM: which URL a folder's tile should show right now. The component half
 * (focus/hover state, lazy preload, failure handling) lives in
 * `Collections.tsx`'s FolderTile.
 *
 * Everything degrades to the static cover: GIF disabled, no GIF URL, or a
 * GIF that failed to load all mean "show the cover", which is the stock
 * behaviour.
 */

/** The folder fields the swap decision reads. */
export type FolderArtFields = Pick<
  CollectionFolder,
  "coverImageUrl" | "focusGifUrl" | "focusGifEnabled"
>;

/**
 * The GIF a folder's tile swaps to, or undefined when the folder has no
 * usable focus GIF: the feature is per-folder opt-in (`focusGifEnabled`)
 * and needs a non-empty URL.
 */
export function folderFocusGifUrl(folder: FolderArtFields): string | undefined {
  if (folder.focusGifEnabled !== true) return undefined;
  const url = (folder.focusGifUrl ?? "").trim();
  return url.length > 0 ? url : undefined;
}

/**
 * The image a folder tile should display. The GIF wins only while the tile
 * is active (focused or hovered) and the GIF is known-good; `gifFailed` is
 * the component's record that the GIF errored, preloaded or in place, and
 * once set the tile keeps the cover for good. Returns undefined when the
 * folder has no cover either — the caller falls back to its emoji art.
 */
export function folderTileImageSrc(
  folder: FolderArtFields,
  state: { active: boolean; gifFailed: boolean },
): string | undefined {
  const gif = folderFocusGifUrl(folder);
  if (state.active && gif && !state.gifFailed) return gif;
  return folder.coverImageUrl;
}
