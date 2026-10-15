import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { tr } from "./core/i18n/tr";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time crash anywhere below it and shows a plain recovery screen instead of
 * letting React unmount the whole tree to nothing - which, against this app's own dark chrome,
 * is indistinguishable from the entire window going black rather than an error. That's exactly
 * what happened when a saved shape block's old-format corner-radius field wasn't migrated (see
 * unpack.ts's migrateLegacyShapeCornerRadius, the actual bug that incident needed) - this is only
 * the safety net for whatever the next one turns out to be, so a genuine crash reads as "Weft
 * hit an error" rather than "the app is broken/frozen" with no indication why. Reloading is a
 * safe recovery here: the document itself already lives on disk (or in the in-memory store, which
 * a reload re-derives from the last save/open), not in this component tree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(tr("ui.weft_crashed_2"), error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            color: "#18181b",
            background: "#fff",
            height: "100vh",
            boxSizing: "border-box",
            overflow: "auto",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>{tr("ui.weft_crashed")}</h1>
          <p style={{ marginBottom: 16 }}>{tr("ui.something_went_wrong_while_displaying_reloading")}</p>
          <button
            type="button"
            style={{ padding: "8px 16px", marginBottom: 16, cursor: "pointer" }}
            onClick={() => window.location.reload()}
          >
            {tr("ui.reload")}
          </button>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.7 }}>
            {this.state.error.stack ?? String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
