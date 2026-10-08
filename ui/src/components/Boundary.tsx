// ONE ERROR, ONE PART (2026-10-07, Wave 1 — S39): a part of NEXUM that fails while drawing shows a short notice in its
// place, with Riprova (draw it again) and Ricarica (reload the page); the rest of the app stays on screen and usable.
// The root boundary is the last net: the whole page, the same two actions. The error is written to the console only.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { S } from "../lib/strings";

type Props = { name: string; children: ReactNode; whole?: boolean };

export class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error(`[NEXUM] ${this.props.name}:`, error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    const actions = (
      <p className="boundary-actions">
        <button type="button" onClick={() => this.setState({ failed: false })}>{S.web.retry}</button>{" "}
        <button type="button" onClick={() => location.reload()}>{S.web.reload}</button>
      </p>);
    if (this.props.whole) return (
      <div className="overlay-center" role="alert" data-testid="boundary" data-part={this.props.name}>
        <div><div className="wordmark">NEXUM</div><p className="err">{S.web.brokenAll}</p>{actions}</div></div>);
    return <div className="boundary" role="alert" data-testid="boundary" data-part={this.props.name}><p>{S.web.broken}</p>{actions}</div>;
  }
}
