import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, isSuperseded } from "../lib/api";
import { band } from "../lib/confidence";
import { conf } from "../lib/format";
import { colorOf, SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useEntity, useStore } from "../store";

/** The unit of navigation: one stable ref, rendered from the single store. Click = select + focus. */
export function Ref({ id, origin = "inspector", showType = false, title }: { id: string; origin?: string;
  showType?: boolean; title?: string }) {
  const e = useEntity(id);
  const focus = useStore((s) => s.focus);
  const types = useStore((s) => s.types);
  if (!e) return <span className="mono faint">{id}</span>;
  const t = types.get(e.type);
  return (
    <button type="button" className={`ref${focus === id ? " is-focus" : ""}`} data-ref={id} title={title ?? e.label}
      onClick={(ev) => (ev.shiftKey ? store.setSecondary(id) : store.select(id, origin))}>
      <span className="shape" style={{ color: colorOf(t?.family, e.kind) }}>{SHAPE[e.kind]}</span>
      <span className="lbl">{e.label}</span>
      {showType && <span className="faint xs">{t?.label ?? e.type}</span>}
    </button>
  );
}

export function Conf({ value, text }: { value: number | null | undefined; text?: string | null }) {
  const b = band(value);
  return <span className={`badge b${b}`} title={text ?? S.bandLabel[b]}>{conf(value)}</span>;
}

/** Support in words for the primary interface ("supporto forte"); the number stays in Perché? and in the details. */
export function Support({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const b = band(value);
  return <span className={`support s${b}`} data-support={b} title={`${S.bandLabel[b]} (${conf(value)})`}>{S.bandLabel[b]}</span>;
}

export function WhyButton({ id }: { id: string }) {
  return <button type="button" className="whybtn" data-why={id} onClick={() => store.why(id)} title={S.whyTitle}>
    {S.why}</button>;
}

export function Section({ title, count, open = true, children, name, onToggle }: { title: string; count?: ReactNode;
  open?: boolean; children: ReactNode; name?: string; onToggle?: (open: boolean) => void }) {
  return (
    <details className="sec" open={open} data-section={name}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}>
      <summary>{title}{count !== undefined && <span className="count">{count}</span>}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export interface Fetched<T> { data?: T; error?: ApiError | Error; loading: boolean }

/** Fetch keyed by `key`; a new key supersedes the previous request (the stale answer is ignored). */
export function useFetch<T>(key: string | null, fn: () => Promise<T>): Fetched<T> {
  const [st, setSt] = useState<Fetched<T>>({ loading: key != null });
  const current = useRef<string | null>(null);
  useEffect(() => {
    current.current = key;
    if (key == null) { setSt({ loading: false }); return; }
    setSt((s) => ({ data: s.data, loading: true }));
    fn().then((data) => { if (current.current === key) setSt({ data, loading: false }); },
      (error) => { if (!isSuperseded(error) && current.current === key) setSt({ error, loading: false }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return st;
}

export function ErrorNote({ error }: { error?: Error }) {
  if (!error) return null;
  const e = error as ApiError;
  const msg = e.status === 504 ? S.deadline : e.status === 429 ? S.busy : `${S.error}: ${e.message}`;
  return <div className="err" role="alert">{msg}{e.hint ? ` — ${e.hint}` : ""}</div>;
}
