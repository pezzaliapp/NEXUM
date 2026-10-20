// THE NEWS WINDOW (2026-10-18; findable, 2026-10-19 after the author's Fold review): how many hours of GDELT the browser
// downloads — the same three windows wherever the news are switched on (Strumenti, Livelli, the news panels), with a
// title, a one-line hint on how to read them on the map, and the sizes and what NEXUM keeps one tap away.
import { useState } from "react";
import ORDER from "../config/publicorder.json";
import { DESK_W } from "../lib/layers";
import { newsWindow, setNewsWindow } from "./alerts";

const G = ORDER.guide;

export function NewsWindow({ hint = false }: { hint?: boolean }) {
  const [h, setH] = useState(newsWindow());
  const W = ORDER.windows;
  const choose = (x: number) => { setNewsWindow(x); setH(x); window.dispatchEvent(new CustomEvent("nexum:news-window")); };
  return (
    <div className="ops-sub xs" data-testid="ops-news-window">
      <div className="ops-nw-h" id="ops-nw-h" data-testid="ops-news-window-title">{G.windowTitle}</div>
      <div className="seg" role="group" aria-labelledby="ops-nw-h">{W.map((w) => (
        <button key={w.h} type="button" aria-pressed={h === w.h} data-testid={`ops-news-window-${w.h}`} onClick={() => choose(w.h)}>{w.label}</button>))}</div>
      {hint && <p className="dim" data-testid="ops-news-window-hint">{innerWidth < DESK_W ? G.mapHint.touch : G.mapHint.desk}</p>}
      <details className="ops-nw-more" data-testid="ops-news-window-more">
        <summary>{G.details}</summary>
        <p className="faint" data-testid="ops-news-window-note">{W.find((w) => w.h === h)?.note}</p>
        <p className="faint">{ORDER.retention}</p>
      </details>
    </div>);
}

/** The full how-to, for the help: the path that exists on this screen (touch: the ⌖ Strumenti button; desktop: Livelli). */
export const newsHowTo = () => (innerWidth < DESK_W ? G.help.touch : G.help.desk);
