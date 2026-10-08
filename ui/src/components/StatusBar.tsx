import { S } from "../lib/strings";
import { useStore } from "../store";
import { SnapshotAge } from "./WebNotes";

export function StatusBar() {
  const status = useStore((s) => s.status);
  const wv = useStore((s) => s.worldVersion);
  const info = useStore((s) => s.mapInfo);
  const credits = useStore((s) => s.mapCredits);
  if (!status) return <footer className="statusbar" />;
  const ok = status.sources.filter((s) => s.health === "ok").length;
  // the third-party tiles drawn now first (their terms ask a visible credit), then the data and the map's own
  const attrs = [...new Set([...credits, ...status.sources.map((s) => s.attribution)])];
  if (status.has_geometry && status.basemap?.["nexum:attribution"] && !attrs.includes(status.basemap["nexum:attribution"]))
    attrs.push(status.basemap["nexum:attribution"]);
  if (status.has_geometry) attrs.push(S.legend.lightsCredit);   // the map's reference night lights (not a NEXUM source)
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="mono" title={`${S.status.version} · build ${__NEXUM_BUILD__}`} data-testid="status-build" data-build={__NEXUM_BUILD__}>v {wv}</span>
      <SnapshotAge />
      <span title={status.sources.map((s) => `${s.name}: ${S.health[s.health] ?? s.health}`).join("\n")}>
        <span style={{ color: ok === status.sources.length ? "#86A07A" : "var(--accent)" }}>●</span>{" "}
        {S.status.sourcesOk(ok, status.sources.length)}</span>
      {info && (
        <span className="mono" data-testid="map-lod" data-lod={info.lod}>
          {info.lod === "aggregates" ? S.aggregated(info.level ?? 0, info.returned) : S.individual(info.returned, info.total)}
          {info.truncated ? ` · ${S.truncated}` : ""} · {info.ms} ms</span>
      )}
      <a className="dim" href={`mailto:${S.web.operatorEmail}`} title={`${S.web.operatorLabel}: ${S.web.operatorEmail}`} data-testid="operator-contact">{S.web.operatorLabel}: {S.web.operatorEmail}</a>
      <span className="attr" data-testid="attributions" title={attrs.join(" · ")}>{S.status.data}: {attrs.join(" · ")}</span>
    </footer>
  );
}
