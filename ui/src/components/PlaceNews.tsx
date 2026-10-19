import { ops } from "../ops/state";
import NEWS_UI from "../config/publicorder.json";
import { PlaceEpisodes } from "./Episode";

/** NEWS OF THIS PLACE (2026-10-18, search review): the GDELT reports GDELT associates with this city (its NEXUM name
 *  and its other names from its source) or this nation, in the news list — where the reports whose place is
 *  confirmed and the ones GDELT only suggests are two separate lists. Not a relation of the place: a look-up. Opened
 *  from a city, the window is 24 hours (2026-10-19, author's decision: a city's episodes of the day before stay in
 *  view; 1 and 6 hours stay one tap away in the list). The city's documented episodes come first, apart. */
export function PlaceNews({ id, d, label }: { id: string; d: any; label: string }) {
  const P = (NEWS_UI as any).placeNews;
  const city = d?.type === P.cityType;
  if (!city && d?.type !== P.nationType) return null;
  const nation = city ? String((d?.properties ?? d?.props)?.[P.nationProp] ?? "") : label;
  const alt = city ? [label, ...((d?.aliases ?? []) as string[])] : [];
  const open = async () => {
    if (city) { const a = await import("../ops/alerts"); a.setNewsWindow(P.cityHours); window.dispatchEvent(new CustomEvent("nexum:news-window")); }
    ops.set({ tool: "news", palette: false, pick: null, sheet: "half", feat: null, newsFilter: { nation, city: city ? label : "", cityAlt: alt, cat: "", geo: "" } });
  };
  return (
    <>
      {city && <PlaceEpisodes id={id} />}
      <div className="xs" data-testid="place-news">
        <button type="button" className="linklike" data-testid="place-news-open" onClick={open}>{P.open.replace("{place}", label)}</button>
        <span className="dim"> — {city ? P.note : P.noteNation ?? P.note}</span>
      </div>
    </>);
}
