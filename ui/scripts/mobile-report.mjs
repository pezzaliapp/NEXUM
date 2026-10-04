// Comparison page of the mobile acceptance run (tests/mobile): one row per step, one column per device, with the
// geometric result of each step. Local file, no external resources:
//   node scripts/mobile-report.mjs   →   ../data/reports/phase3/mobile/index.html
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../data/reports/phase3/mobile");
const DEVICES = [
  ["iphone15promax-portrait", "iPhone 15 Pro Max · verticale", "WebKit · 430×740 utili"],
  ["iphone15promax-landscape", "iPhone 15 Pro Max · orizzontale", "WebKit · 932×340 utili"],
  ["fold-closed", "Galaxy Z Fold · chiuso", "Chrome · 344×690 utili"],
  ["fold-open", "Galaxy Z Fold · aperto", "Chrome · 884×960 utili"],
];
const STEPS = {
  "01-apertura": "Apro NEXUM", "02-fuoco-mandalay": "Tocco un elemento: cos'è, a cosa è collegato",
  "03-perche": "Perché?", "04-pivot-insight": "Seguo la connessione", "05-grafo": "Grafo del nuovo fuoco",
  "06-tempo": "Tempo: cosa è successo e quando", "07-percorso": "Percorso con i nomi completi",
  "08-bilma": "Bilma Airport · Si trova in → Niger", "09-niger": "Niger", "10-filtri": "Filtri (Paese escluso)",
  "11-grafo-nascosta": "Connessione nascosta dai filtri", "12-grafo-mostra": "Mostra", "13-grafo-nessuna": "Nessuna connessione (Pitcairn)",
  "14-tempo-nessuno": "Tempo senza eventi datati", "15-scheda-completa": "Scheda aperta per intero", "16-mappa-fuoco": "Mappa: gerarchia del fuoco",
  "17-fuori-periodo": "Evento del 2025: data subito, fuori dal periodo", "18-indietro": "Ripristina e ←: il fuoco resta, il periodo non cambia da solo",
  "19-periodo": "Che periodo sto guardando", "20-modificato": "Periodo · 2020 · Filtri · 1 · Ripristina",
};
const KEYS = { overflowX: "pagina più larga dello schermo", overlaps: "sovrapposizioni", clipped: "testo tagliato",
  outside: "fuori schermo", small: "bersagli < 44 px", covered: "coperti" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let rows = "";
for (const [step, title] of Object.entries(STEPS)) {
  let cells = "";
  for (const [dev] of DEVICES) {
    const img = `${dev}/${step}.jpg`, js = path.join(dir, dev, `${step}.json`);
    if (!fs.existsSync(path.join(dir, img))) { cells += `<td class="na">non applicabile</td>`; continue; }
    const g = fs.existsSync(js) ? JSON.parse(fs.readFileSync(js, "utf8")) : null;
    const issues = g ? Object.entries(KEYS).flatMap(([k, label]) => (k === "overflowX" ? (g[k] ? [label] : []) : (g[k] ?? []).map((x) => `${label}: ${x}`))) : ["nessun controllo"];
    cells += `<td><a href="${img}"><img loading="lazy" src="${img}" alt="${esc(title)} — ${dev}"></a>` +
      `<div class="${issues.length ? "ko" : "ok"}">${issues.length ? issues.map(esc).join("<br>") : "controlli geometrici superati"}</div></td>`;
  }
  rows += `<tr><th scope="row">${esc(title)}<span>${step}</span></th>${cells}</tr>`;
}
const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEXUM mobile · confronto</title><style>
:root{--bg:#0D1012;--panel:#13171A;--line:#262C31;--text:#D6DBDE;--dim:#8A949A;--ok:#86A07A;--ko:#E0A640}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,sans-serif}
header{padding:16px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0 0 4px}p{margin:4px 0;color:var(--dim)}
.wrap{overflow-x:auto;padding:0 8px 24px}table{border-collapse:collapse;min-width:1100px}
th,td{border-bottom:1px solid var(--line);padding:10px 8px;vertical-align:top;text-align:left}
thead th{position:sticky;top:0;background:var(--panel);font-weight:600}thead th span,tbody th span{display:block;color:var(--dim);font-weight:400;font-size:12px}
tbody th{width:170px}img{display:block;max-height:560px;max-width:320px;border:1px solid var(--line)}
td.na{color:var(--dim)}.ok{color:var(--ok);font-size:12px;margin-top:6px}.ko{color:var(--ko);font-size:12px;margin-top:6px;max-width:320px;overflow-wrap:anywhere}
</style></head><body><header><h1>NEXUM mobile · confronto tra dispositivi</h1>
<p>Percorso: apro → tocco → capisco → connessione → Perché? → la seguo → continuo. Viewport utili (schermo meno le barre del browser).</p>
<p>Questi controlli non dichiarano la UX mobile accettata: il gate finale è la prova fisica su Galaxy Z Fold8 Ultra e iPhone 15 Pro Max.</p></header>
<div class="wrap"><table><thead><tr><th>Passo</th>${DEVICES.map(([, a, b]) => `<th>${esc(a)}<span>${esc(b)}</span></th>`).join("")}</tr></thead>
<tbody>${rows}</tbody></table></div></body></html>`;
fs.writeFileSync(path.join(dir, "index.html"), html);
console.log(path.join(dir, "index.html"));
