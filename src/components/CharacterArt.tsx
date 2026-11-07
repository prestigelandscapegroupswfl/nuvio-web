import { useEffect, useRef, useState } from "react";
import type { Meta } from "../types";
import { characterStripLayout, fetchCharacterArt } from "../lib/fanart";

/**
 * LUMIÈRE — the character layer.
 *
 * Stands a title's fanart.tv character cutouts along the bottom of a hero:
 * bottom-anchored, staggered heights, each tucking behind the last, over
 * the backdrop and under the copy. Renders nothing at all when the title
 * has no character art (most don't), when no fanart key is configured, or
 * when the lookup fails — the hero is then exactly the stock one.
 *
 * `active` gates the fetch, not the display: the home carousel mounts every
 * slide up front, and only the slide actually being featured should spend a
 * fanart request. Once loaded, a slide keeps its characters.
 */
export function CharacterArt({
  item,
  active = true,
}: {
  item: Meta;
  active?: boolean;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const requestedFor = useRef<string>("");

  useEffect(() => {
    if (!active) return;
    const key = `${item.type}:${item.id}`;
    if (requestedFor.current === key) return;
    requestedFor.current = key;
    let cancelled = false;
    void fetchCharacterArt(item).then((found) => {
      if (!cancelled) setUrls(found);
    });
    return () => {
      cancelled = true;
    };
  }, [item, active]);

  if (!urls.length) return null;
  const layout = characterStripLayout(urls.length);
  return (
    <div className="lumiere-character-art" aria-hidden="true">
      {urls.map((url, index) => (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          style={{
            height: `${layout[index].heightPct}%`,
            marginLeft: index === 0 ? undefined : `-${layout[index].overlapPct}%`,
            zIndex: layout[index].zIndex,
          }}
          // A cutout that fails to load leaves the lineup rather than a
          // broken-image glyph standing in it.
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ))}
    </div>
  );
}
