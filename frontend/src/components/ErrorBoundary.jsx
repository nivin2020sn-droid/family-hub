import React from "react";

/**
 * Global error boundary — replaces a crashing route with a visible message
 * instead of a blank white screen. Helps diagnose production issues.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, info);
  }

  handleReset = () => {
    try {
      // Clear any potentially corrupt local cache, then reload
      if (typeof localStorage !== "undefined") {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("mfml_cache_"))
          .forEach((k) => localStorage.removeItem(k));
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
    } catch {}
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#FAF9F6",
            padding: "24px",
            fontFamily: "DM Sans, system-ui, sans-serif",
            color: "#2D2A26",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontFamily: "Outfit, sans-serif", fontSize: 28, marginBottom: 12 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#7A7571", marginBottom: 20, lineHeight: 1.5 }}>
              The page hit an unexpected error. Tap reset to clear the local cache and reload.
            </p>
            <pre
              style={{
                background: "#fff",
                border: "1px solid #E5E2DC",
                borderRadius: 12,
                padding: 12,
                fontSize: 12,
                textAlign: "left",
                color: "#7A7571",
                overflow: "auto",
                maxHeight: 160,
                marginBottom: 20,
              }}
            >
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={this.handleReset}
              style={{
                background: "#2D2A26",
                color: "white",
                border: "none",
                borderRadius: 999,
                padding: "12px 28px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset & reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
