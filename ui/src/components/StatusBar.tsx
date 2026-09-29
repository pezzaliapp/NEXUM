import { S } from "../lib/strings";
import { useStore } from "../store";

export function StatusBar() {
  const status = useStore((s) => s.status);
  const wv = useStore((s) => s.worldVersion);
  const info = useStore((s) => s.mapInfo);
  if (!status) return <footer className="statusbar" />;
  const ok = status.sources.filter((s) => s.health === "ok").length;
  const attrs = [...new Set(status.sources.map((s) => s.attribution))];
  if (status.has_geometry && status.basemap?.["nexum:attribution"] && !attrs.includes(status.basemap["nexum:attribution"]))
    attrs.push(status.basemap["nexum:attribution"]);
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="mono" title={S.status.version}>v {wv}</span>
      <span title={status.sources.map((s) => `${s.name}: ${S.health[s.health] ?? s.health}`).join("\n")}>
        <span style={{ color: ok === status.sources.length ? "#86A07A" : "var(--accent)" }}>●</span>{" "}
        {S.status.sourcesOk(ok, status.sources.length)}</span>
      {info && (
        <span className="mono" data-testid="map-lod">
          {info.lod === "aggregates" ? S.aggregated(info.level ?? 0, info.returned) : S.individual(info.returned, info.total)}
          {info.truncated ? ` · ${S.truncated}` : ""} · {info.ms} ms</span>
      )}
      <span className="attr" data-testid="attributions" title={attrs.join(" · ")}>{S.status.data}: {attrs.join(" · ")}</span>
    </footer>
  );
}
