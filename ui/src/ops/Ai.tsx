// AI OVERVIEW (optional, 2026-10-04): a small open language model run ENTIRELY in this browser (WebLLM on WebGPU,
// Apache-2.0 models), downloaded once only when the person asks — no account, no key, no server, no paid service.
// It rewrites in plain words ONLY the facts NEXUM shows for the element in focus (or the world's recent events); it
// adds nothing, and its text is said to be generated (it can be wrong; the facts are in NEXUM's cards).

import { useRef, useState } from "react";
import { store, useStore } from "../store";
import { typeLabelOf } from "../components/Highlights";

const MODELS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0,5B (≈ 280 MB, Apache-2.0)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1,5B (≈ 870 MB, Apache-2.0, più accurato)" },
];

function factsOfFocus(): string | null {
  const st = store.get();
  if (!st.focus) return null;
  const e = store.entity(st.focus);
  if (!e) return null;
  const lines = [`Elemento: ${e.label} (${typeLabelOf(e.type)})`];
  const props = e.details?.properties ?? {};
  for (const f of st.types.get(e.type)?.facts ?? []) {
    const v = props[f.property];
    if (v != null && v !== "") lines.push(`${f.label}: ${typeof v === "string" && f.values?.[v] ? f.values[v] : v}${f.unit ? ` ${f.unit}` : ""}`);
  }
  if (e.t) lines.push(`Data: ${new Date(e.t).toISOString().slice(0, 10)}`);
  const ctx = st.context?.id === st.focus ? st.context.data : null;
  for (const sec of ["related_objects", "related_events"]) {
    for (const it of (ctx?.[sec]?.items ?? []).slice(0, 12)) {
      const r = store.entity(it.$ref);
      if (r) lines.push(`Collegato (${String(it.reason ?? "").replace(/_/g, " ")}): ${r.label} (${typeLabelOf(r.type)})`);
    }
  }
  return lines.join("\n");
}

export default function Ai() {
  const focus = useStore((s) => s.focus);
  const [model, setModel] = useState(MODELS[0].id);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "writing" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [out, setOut] = useState("");
  const engine = useRef<any>(null);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const load = async () => {
    setPhase("loading");
    try {
      const web = await import("@mlc-ai/web-llm");
      engine.current = await web.CreateMLCEngine(model, { initProgressCallback: (p: any) => setProgress(p.text ?? "") });
      setPhase("ready");
    } catch (e: any) { setProgress(String(e?.message ?? e)); setPhase("error"); }
  };
  const [question, setQuestion] = useState("");
  const write = async (ask?: string) => {
    const facts = factsOfFocus();
    if (!facts || !engine.current) return;
    setPhase("writing"); setOut("");
    try {
      const chunks = await engine.current.chat.completions.create({ stream: true, temperature: 0.2, max_tokens: 380, messages: ask ? [
        { role: "system", content: "Rispondi in italiano usando SOLO i fatti forniti. Se la risposta non è nei fatti, dillo chiaramente. Ogni ipotesi va dichiarata come ipotesi." },
        { role: "user", content: `Fatti:\n${facts}\n\nDomanda: ${ask}` }] : [
        { role: "system", content: "Riscrivi in italiano, in 4-6 frasi semplici, SOLO i fatti forniti. Non aggiungere informazioni, cause, previsioni, probabilità o giudizi. Se un fatto manca, non inventarlo." },
        { role: "user", content: facts }] });
      let text = "";
      for await (const c of chunks) { text += c.choices?.[0]?.delta?.content ?? ""; setOut(text); }
      setPhase("ready");
    } catch (e: any) { setOut(String(e?.message ?? e)); setPhase("ready"); }
  };
  return (
    <div data-testid="ops-ai">
      <p className="xs dim">Un modello linguistico aperto gira <b>solo nel tuo browser</b> (WebGPU): nessun account, nessuna chiave, nessun server. Riscrive in parole semplici i fatti NEXUM dell'elemento in primo piano, senza aggiungerne.</p>
      {!gpu && <p className="xs warn" data-testid="ops-ai-nogpu">Questo browser non offre WebGPU: la sintesi locale non è disponibile qui (Chrome, Edge o Safari recenti la offrono).</p>}
      {phase === "idle" && gpu && <>
        <select value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <button type="button" className="primary" data-testid="ops-ai-load" onClick={load}>Scarica e avvia il modello</button>
        <p className="xs faint">Il modello si scarica una volta da Hugging Face e resta nella cache del browser.</p></>}
      {(phase === "loading" || phase === "error") && <p className="xs mono" data-testid="ops-ai-progress">{progress}</p>}
      {(phase === "ready" || phase === "writing") && <>
        <button type="button" className="primary" disabled={!focus || phase === "writing"} onClick={() => write()} data-testid="ops-ai-write">
          {focus ? "Sintesi dell'elemento in primo piano" : "Scegli un elemento sulla mappa"}</button>
        {focus && <div className="row"><input type="search" className="grow" value={question} placeholder="Una domanda su questi fatti…" onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && question.trim() && write(question.trim())} data-testid="ops-ai-q" />
          <button type="button" className="xs" disabled={!question.trim() || phase === "writing"} onClick={() => write(question.trim())}>Chiedi</button></div>}
        {out && <div className="ops-ai-out" data-testid="ops-ai-out"><p>{out}</p>
          <p className="xs warn">Testo GENERATO da un modello linguistico locale: può contenere errori. I fatti e le fonti sono nella scheda NEXUM.</p></div>}</>}
    </div>);
}
