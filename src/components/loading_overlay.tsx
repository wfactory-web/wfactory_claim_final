import React, { useEffect, useMemo } from "react";

type LoadingOverlayProps = {
  open: boolean;
  phase: "loading" | "success";
  title?: string;
  successDelayMs?: number; // default ~1s
  onSuccessDelayDone?: () => void;
};

export default function LoadingOverlay({
  open,
  phase,
  title,
  successDelayMs = 1000,
  onSuccessDelayDone,
}: LoadingOverlayProps) {
  const isSuccess = phase === "success";

  const ariaLabel = useMemo(() => {
    if (!open) return "";
    return isSuccess ? "Success Minting Overlay" : "Minting Overlay";
  }, [open, isSuccess]);

  // ✅ Prevent scrolling while overlay is open (visual only; no history manipulation)
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction as any;

    document.body.style.overflow = "hidden";
    (document.body.style as any).touchAction = "none";

    return () => {
      document.body.style.overflow = prevOverflow;
      (document.body.style as any).touchAction = prevTouchAction || "";
    };
  }, [open]);

  // ✅ Block common keyboard navigation/refresh while overlay is open (does NOT touch history)
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Refresh: F5 / Ctrl+R / Cmd+R
      if (e.key === "F5") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (ctrlOrCmd && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Back/Forward (keyboard): Alt+Left / Alt+Right
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Backspace navigation (only if not typing in an input)
      if (e.key === "Backspace") {
        const el = document.activeElement as HTMLElement | null;
        const tag = (el?.tagName || "").toLowerCase();
        const isTyping =
          tag === "input" ||
          tag === "textarea" ||
          (el as any)?.isContentEditable === true;

        if (!isTyping) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [open]);

  // ✅ Success delay callback (~1s), parent performs redirect
  useEffect(() => {
    if (!open) return;
    if (!isSuccess) return;

    const t = window.setTimeout(() => {
      onSuccessDelayDone?.();
    }, successDelayMs);

    return () => window.clearTimeout(t);
  }, [open, isSuccess, successDelayMs, onSuccessDelayDone]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        pointerEvents: "auto", // ✅ blocks clicks behind
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(1200px 700px at 50% 30%, rgba(0,255,140,0.10), rgba(0,0,0,0.88) 60%, rgba(0,0,0,0.94) 100%)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Center container with fixed aspect ratio 2246 × 1321 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 16,
        }}
        // ✅ prevent touch scroll gestures on mobile
        onTouchMove={(e) => e.preventDefault()}
      >
        <div
          style={{
            width: "min(92vw, 1200px)",
            aspectRatio: "2246 / 1321",
            position: "relative",
            borderRadius: 18,
            overflow: "hidden",
            background: "linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.88))",
            boxShadow:
              "0 0 0 1px rgba(0,255,140,0.55), 0 0 40px rgba(0,255,140,0.20), 0 0 140px rgba(0,255,140,0.12)",
          }}
          // ✅ block wheel scroll inside overlay
          onWheel={(e) => e.preventDefault()}
        >
          {/* cyberpunk border */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 18,
              border: "2px solid rgba(0,255,140,0.55)",
              boxShadow: "inset 0 0 0 1px rgba(0,255,140,0.20)",
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 10,
              borderRadius: 14,
              border: "1px solid rgba(0,255,140,0.18)",
              pointerEvents: "none",
            }}
          />

          {/* inner frame content */}
          <div
            style={{
              position: "absolute",
              inset: 16,
              borderRadius: 12,
              overflow: "hidden",
              background:
                "radial-gradient(900px 520px at 50% 40%, rgba(0,255,140,0.10), rgba(0,0,0,0.95))",
              display: "grid",
              placeItems: "center",
            }}
          >
            {/* LOADING VIDEO */}
            {phase === "loading" ? (
              <video
                src="/loading_ani.mp4"
                autoPlay
                muted
                playsInline
                loop
                preload="auto"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain", // ✅ MUST be contain
                  display: "block",
                }}
              />
            ) : (
              // SUCCESS CONTENT
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    boxShadow:
                      "0 0 0 1px rgba(0,255,140,0.60), 0 0 30px rgba(0,255,140,0.25)",
                    background:
                      "radial-gradient(circle at 50% 30%, rgba(0,255,140,0.20), rgba(0,0,0,0.90))",
                  }}
                >
                  <svg width="92" height="92" viewBox="0 0 52 52" aria-hidden="true">
                    <path
                      d="M14 27 L22 35 L38 18"
                      fill="none"
                      stroke="rgba(0,255,140,1)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        strokeDasharray: 100,
                        strokeDashoffset: 100,
                        animation: "wfx-check 600ms ease forwards",
                      }}
                    />
                  </svg>
                </div>

                <div
                  style={{
                    fontFamily:
                      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    fontWeight: 800,
                    fontSize: 18,
                    color: "rgba(0,255,140,0.95)",
                    textShadow: "0 0 18px rgba(0,255,140,0.35)",
                  }}
                >
                  {title ?? "SUCCESS MINTING"}
                </div>
              </div>
            )}
          </div>

          {/* scanlines */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "repeating-linear-gradient(to bottom, rgba(0,255,140,0.06) 0px, rgba(0,255,140,0.00) 2px, rgba(0,0,0,0.00) 6px)",
              mixBlendMode: "overlay",
              opacity: 0.22,
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes wfx-check {
          to {
            stroke-dashoffset: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          svg path {
            animation: none !important;
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
