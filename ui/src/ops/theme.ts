// UI themes of the style panel (appearance only, this browser only): the accent, links and surfaces. The colours of
// NEXUM's data never change with the theme.

export const THEMES: Record<string, { label: string; accent: string; link: string; bg: string; panel: string }> = {
  nexum: { label: "NEXUM (ambra)", accent: "#E0A640", link: "#79A7C9", bg: "#0D1012", panel: "#13171A" },
  ice: { label: "Ghiaccio", accent: "#7FD3E8", link: "#A8C8E8", bg: "#0B1014", panel: "#11181D" },
  terminal: { label: "Terminale", accent: "#7FE07F", link: "#9FD0A0", bg: "#070A07", panel: "#0E130E" },
  crimson: { label: "Cremisi", accent: "#E0606A", link: "#D7A0A8", bg: "#110C0D", panel: "#181213" },
  violet: { label: "Viola", accent: "#B48CF0", link: "#A0A8E0", bg: "#0E0C12", panel: "#15131B" },
  black: { label: "Nero assoluto", accent: "#E0A640", link: "#79A7C9", bg: "#000000", panel: "#0A0A0A" },
};
export function applyTheme(id: string) {
  const t = THEMES[id] ?? THEMES.nexum;
  const r = document.documentElement.style;
  r.setProperty("--accent", t.accent); r.setProperty("--accent-dim", `${t.accent}26`); r.setProperty("--link", t.link);
  r.setProperty("--bg", t.bg); r.setProperty("--panel", t.panel);
}
