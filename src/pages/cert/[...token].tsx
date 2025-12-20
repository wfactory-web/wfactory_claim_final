// src/pages/cert/[...token].tsx
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { polygon } from "thirdweb/chains";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { QRCodeCanvas } from "qrcode.react";

import { client } from "@/lib/thirdwebClient";
import { decodeCertTokenUnsafe } from "@/lib/certTokenClient";
import { buildCertMessage } from "@/lib/certMessage";

type CertPayload = {
  v?: 1;
  chainId: number;
  contract: string; // MUST be NFT contract address
  tokenId: number;
  nonce: string;
  exp: number;
};

type VerifyOk = {
  ok: true;
  chainId: number;
  tokenId: number;
  contract: string;
  owner: string;
  openseaUrl: string;
};
type VerifyFail = { ok: false; error: string; detail?: any };
type VerifyRes = VerifyOk | VerifyFail;

type Step = "idle" | "verifying" | "verified" | "downloading";

const NFT_CONTRACT =
  process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x6E7b12691CEde428B27006b16f5A8D1EECdabB1e";

const CERT_W = 2246;
const CERT_H = 1321;

// Brand green for QR
const QR_GREEN = "#d4d4d4ff";

// ✅ WATERMARK goes to WHITE BOX (center-left)
const WM_BOX = { x: 150, y: 260, w: 1400 };

// ✅ QR + BIG TEXT area (sample photo style)
const QR_BLOCK = { x: 240, y: 640, size: 260, gap: 70 };

function shortAddr(a?: string) {
  if (!a) return "";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function openseaAssetUrl(contract: string, tokenId: number) {
  return `https://opensea.io/assets/matic/${contract}/${tokenId}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const m = ctx.measureText(test).width;
    if (m > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export default function CertVaultPage() {
  const router = useRouter();
  const account = useActiveAccount();

  const tokenParam = router.query.token;

  const tokenStr = useMemo(() => {
    if (!tokenParam) return "";
    if (Array.isArray(tokenParam)) return tokenParam.join("/");
    return String(tokenParam);
  }, [tokenParam]);

  const payload = useMemo<CertPayload | null>(() => {
    if (!tokenStr) return null;
    try {
      const p = decodeCertTokenUnsafe(tokenStr) as any;
      return {
        v: p.v ?? 1,
        chainId: Number(p.chainId ?? 137),
        contract: String(p.contract ?? ""),
        tokenId: Number(p.tokenId),
        nonce: String(p.nonce ?? ""),
        exp: Number(p.exp ?? 0),
      };
    } catch {
      return null;
    }
  }, [tokenStr]);

  const walletAddress = account?.address ? String(account.address) : "";
  const tokenId = Number(payload?.tokenId ?? NaN);

  const expectedContract = String(NFT_CONTRACT || "").toLowerCase();
  const tokenContract = String(payload?.contract || "").toLowerCase();

  const tokenOk =
    !!payload &&
    Number(payload.chainId) === 137 &&
    Number.isFinite(tokenId) &&
    !!payload.contract &&
    !!payload.nonce &&
    Number(payload.exp) > 0;

  const contractOk = tokenOk && tokenContract === expectedContract;

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>("");
  const [verify, setVerify] = useState<VerifyOk | null>(null);

  // ✅ Watermark opacity (adjustable). Works only after verify because watermark only draws after verify.
  const [wmOpacity, setWmOpacity] = useState<number>(30);

  const wallets = useMemo(() => {
    return [createWallet("io.metamask"), inAppWallet({ auth: { options: ["email"] } })];
  }, []);

  const previewUrl = useMemo(() => {
    if (!tokenStr) return "";
    return `/api/cert/preview?token=${encodeURIComponent(tokenStr)}`;
  }, [tokenStr]);

  const isVerifying = step === "verifying";
  const isDownloading = step === "downloading";
  const unlocked = !!verify && !isVerifying && !isDownloading;

  const canVerify = tokenOk && !!walletAddress && !!account && !isVerifying && !isDownloading;
  const canDownload = !!verify && unlocked && !!walletAddress && !!account && !isDownloading;

  const viewHref = verify?.openseaUrl || openseaAssetUrl(expectedContract, tokenId);

  // ---- canvas refs ----
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const polyImgRef = useRef<HTMLImageElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // optional polygon stamp
  useEffect(() => {
    if (typeof window === "undefined") return;
    const img = new Image();
    img.src = "/polygon.png"; // optional
    img.onload = () => {
      polyImgRef.current = img;
      requestAnimationFrame(() => drawCanvas());
    };
    img.onerror = () => {
      polyImgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // redraw whenever these change
    requestAnimationFrame(() => drawCanvas());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verify, wmOpacity, walletAddress, tokenId, expectedContract, viewHref, previewUrl]);

  function prepareCanvasSize(canvas: HTMLCanvasElement) {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(CERT_W * dpr);
    canvas.height = Math.floor(CERT_H * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * ✅ LOCKED VIEW (BEFORE VERIFY)
   * - NO BASE IMAGE
   * - NO QR
   * - NO TEXT
   */
  function drawLocked(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.clearRect(0, 0, CERT_W, CERT_H);

    // deep black base
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CERT_W, CERT_H);

    // subtle vignette / panel glow (still safe, not an image)
    const grad = ctx.createRadialGradient(CERT_W * 0.55, CERT_H * 0.52, 40, CERT_W * 0.55, CERT_H * 0.52, CERT_W);
    grad.addColorStop(0, "rgba(101,217,22,0.10)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.00)");
    grad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CERT_W, CERT_H);

    // locked label
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(101,217,22,0.65)";
    ctx.font = '900 76px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';
    ctx.shadowColor = "rgba(101,217,22,0.35)";
    ctx.shadowBlur = 22;
    ctx.fillText("LOCKED", CERT_W / 2, CERT_H / 2 - 10);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(234,255,248,0.55)";
    ctx.font = '600 28px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';
    ctx.fillText("VERIFY TO UNLOCK CERTIFICATE", CERT_W / 2, CERT_H / 2 + 60);

    ctx.restore();
  }

  /**
   * ✅ VERIFIED WATERMARK TEXT (NO FRAME) in WHITE BOX
   * Only draws when verify === true.
   */
  function drawVerifiedWatermark(ctx: CanvasRenderingContext2D) {
    if (!verify) return;

    const title = "CONGRATULATIONS OWNER OF LOST IN MULTIVERSE";
    const owner = walletAddress || "";
    const nft = expectedContract;
    const chainName = "Polygon";
    // wmOpacity is 0–100
    const alpha = clamp(wmOpacity / 100, 0, 1);

    // proportional layers
    const oTitle   = alpha * 1.0;   // main text
    const oDetails = alpha * 0.85;  // details slightly lighter
    const oMicro   = alpha * 0.35;  // micro diagonal text


    const boxX = WM_BOX.x;
    const boxY = WM_BOX.y;
    const boxW = WM_BOX.w;

    ctx.save();
    ctx.textAlign = "left";

    // Title
    ctx.fillStyle = `rgba(101,217,22,${oTitle})`;
    ctx.font = '900 52px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';

    const titleLines = wrapText(ctx, title, boxW);
    let y = boxY;

    for (const ln of titleLines) {
      ctx.fillText(ln, boxX, y);
      y += 58;
    }

    // Details
    ctx.fillStyle = `rgba(101,217,22,${oDetails})`;
    ctx.font = '600 30px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';

    y += 14;
    ctx.fillText(`TokenId: ${tokenId}`, boxX, y);
    y += 46;
    ctx.fillText(`Contract Address: ${nft}`, boxX, y);
    y += 46;
    ctx.fillText(`Owner Wallet: ${owner}`, boxX, y);
    y += 46;
    ctx.fillText(`Chain: ${chainName} (137)`, boxX, y);
    y += 46;
    ctx.fillText(`On Polygon Blockchain`, boxX, y);

    // Optional small Polygon stamp
    const polyImg = polyImgRef.current;
    if (polyImg) {
      ctx.globalAlpha = 0.14;
      ctx.drawImage(polyImg, boxX + boxW - 74, boxY + 10, 58, 58);
      ctx.globalAlpha = 1;
    }

    // subtle micro diagonal
    //ctx.save();
    //ctx.translate(0, CERT_H);
    //ctx.rotate((-18 * Math.PI) / 180);
    //ctx.font = '500 18px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';
    //ctx.fillStyle = `rgba(101,217,22,${oMicro})`;
    //const microText = `${owner} • TOKEN ${tokenId} • LOST IN MULTIVERSE • POLYGON`;
    //for (let yy = -CERT_H; yy < CERT_H * 1.4; yy += 150) {
      //ctx.fillText(microText, 140, yy);
    //}
    //ctx.restore();

    //ctx.restore();
  }

  /**
   * ✅ QR + BIG TEXT (ONLY AFTER VERIFY)
   * Text color MUST be white.
   * QR color MUST be #65d916.
   */
  function drawQrAndHeadline(ctx: CanvasRenderingContext2D) {
    if (!verify) return;

    const qr = qrCanvasRef.current;
    if (!qr) return;

    const x = QR_BLOCK.x;
    const y = QR_BLOCK.y;
    const size = QR_BLOCK.size;

    ctx.save();

    // backplate glow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = QR_GREEN;
    roundRect(ctx, x - 26, y - 26, size + 52, size + 52, 18);
    ctx.fill();
    ctx.globalAlpha = 1;

    // border
    ctx.strokeStyle = "rgba(234,255,248,0.85)";
    ctx.lineWidth = 8;
    roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 14);
    ctx.stroke();

    // QR itself (green)
    ctx.drawImage(qr, x, y, size, size);

    // Big text (WHITE)
    const tx = x + size + QR_BLOCK.gap;
    const ty = y + 92;

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.font = '900 112px "Orbitron","Oxanium","Rajdhani","Space Grotesk",sans-serif';

    // subtle glow (green)
    ctx.save();
    ctx.shadowColor = "rgba(101,217,22,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillText("SCAN QR", tx, ty);
    ctx.fillText("FOR NFT", tx, ty + 130);
    ctx.restore();

    ctx.restore();
  }

  function drawCanvas() {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = prepareCanvasSize(canvas);
    if (!ctx) return;

    // ✅ BEFORE VERIFY: show ONLY locked (no image, no QR, no text)
    if (!verify) {
      baseImgRef.current = null;
      drawLocked(ctx);
      return;
    }

    // ✅ AFTER VERIFY: load base preview image and draw
    if (!previewUrl) {
      drawLocked(ctx);
      return;
    }

    const base = new Image();
    base.crossOrigin = "anonymous";
    base.src = previewUrl;

    base.onload = () => {
      baseImgRef.current = base;

      ctx.clearRect(0, 0, CERT_W, CERT_H);
      ctx.drawImage(base, 0, 0, CERT_W, CERT_H);

      // ✅ QR + Text after verify only
      drawQrAndHeadline(ctx);

      // ✅ Watermark after verify only
      drawVerifiedWatermark(ctx);
    };

    base.onerror = () => {
      // fallback
      drawLocked(ctx);
    };
  }

  async function onVerify() {
    try {
      setError("");
      setVerify(null);

      if (!tokenOk) throw new Error("Invalid / expired cert token.");
      if (!walletAddress || !account) throw new Error("Connect wallet first.");

      if (!contractOk) {
        throw new Error(
          `CERT TOKEN CONTRACT MISMATCH.\nToken: ${payload?.contract}\nExpected NFT: ${NFT_CONTRACT}\nFix: regenerate cert token using the NFT contract address.`
        );
      }

      setStep("verifying");

      const msg = buildCertMessage({
        action: "verify",
        chainId: 137,
        contract: expectedContract,
        tokenId,
        wallet: walletAddress,
        nonce: payload!.nonce,
        exp: payload!.exp,
      });

      const signature = await account.signMessage({ message: msg });

      const res = await fetch("/api/cert/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenStr, wallet: walletAddress, signature }),
      });

      const data = (await res.json()) as VerifyRes;
      if (!data.ok) throw new Error(data.error || "Verify failed");

      setVerify(data);
      setStep("verified");
    } catch (e: any) {
      setStep("idle");
      setVerify(null);
      setError(e?.message || "Verify failed");
    }
  }

  async function onDownload() {
    try {
      setError("");

      if (!tokenOk) throw new Error("Invalid / expired cert token.");
      if (!walletAddress || !account) throw new Error("Connect wallet first.");
      if (!verify) throw new Error("Verify first to unlock download.");
      if (!contractOk) throw new Error("Contract mismatch. Regenerate cert token.");

      setStep("downloading");

      const msg = buildCertMessage({
        action: "download",
        chainId: 137,
        contract: expectedContract,
        tokenId,
        wallet: walletAddress,
        nonce: payload!.nonce,
        exp: payload!.exp,
      });

      const signature = await account.signMessage({ message: msg });

      const res = await fetch("/api/cert/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenStr, wallet: walletAddress, signature }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as any;
        throw new Error(j?.error || `Download failed (${res.status})`);
      }

      // Export VERIFIED canvas at EXACT 2246x1321
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CERT_W;
      exportCanvas.height = CERT_H;
      const ectx = exportCanvas.getContext("2d");
      if (!ectx) throw new Error("Export failed.");

      // draw base
      const base = baseImgRef.current;
      if (!base) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = previewUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Preview image load failed."));
        });
        ectx.drawImage(img, 0, 0, CERT_W, CERT_H);
      } else {
        ectx.drawImage(base, 0, 0, CERT_W, CERT_H);
      }

      // QR + headline (verified only)
      drawQrAndHeadline(ectx);

      // verified watermark
      drawVerifiedWatermark(ectx);

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) throw new Error("Export failed.");
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `WFACTORY_CERT_${tokenId}_PRINT.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        "image/png",
        1
      );

      setStep("verified");
    } catch (e: any) {
      setStep("verified");
      setError(e?.message || "Download failed");
    }
  }

  // Hardening: block save gestures
  function blockSave(e: any) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    return false;
  }

  return (
    <>
      <Head>
        <title>W FACTORY • Phygital Wear</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      {/* Hidden QR generator (used ONLY after verify on the canvas) */}
      <div style={{ position: "absolute", left: -99999, top: -99999, opacity: 0, pointerEvents: "none" }}>
        <QRCodeCanvas
          value={viewHref || "https://opensea.io"}
          size={QR_BLOCK.size}
          includeMargin={false}
          level="M"
          fgColor={QR_GREEN}
          bgColor="transparent"
          ref={qrCanvasRef as any}
        />
      </div>

      <div className="wf-bg">
        <div className="wf-grid" />

        <div className="wf-shell">
          {/* LEFT PANEL */}
          <aside className="wf-rail">
            <div className="wf-brand">
              <div className="wf-logo">W</div>
              <div>
                <div className="wf-title">CERTIFICATE VAULT</div>
                <div className="wf-sub">Connect → Verify → Download / View</div>
              </div>
            </div>

            <div className="wf-card">
              <div className="wf-kv">
                <div className="wf-k">TokenID</div>
                <div className="wf-v">{Number.isFinite(tokenId) ? `#${tokenId}` : "-"}</div>

                <div className="wf-k">Chain</div>
                <div className="wf-v">Polygon (137)</div>

                <div className="wf-k">NFT Contract</div>
                <div className="wf-v wf-mono">{shortAddr(expectedContract)}</div>

                <div className="wf-k">Wallet</div>
                <div className="wf-v wf-mono">{walletAddress ? shortAddr(walletAddress) : "Not connected"}</div>
              </div>

              <div className="wf-actions">
                <ConnectButton
                  client={client}
                  chain={polygon}
                  wallets={wallets}
                  connectModal={{ size: "compact", title: "Connect Wallet" }}
                />

                <button className="wf-btn wf-btn-primary" onClick={onVerify} disabled={!canVerify}>
                  {step === "verifying" ? (
                    <>
                      <span className="wf-spin" /> Verifying…
                    </>
                  ) : (
                    "Verify (Sign) → Unlock"
                  )}
                </button>

                <button className="wf-btn wf-btn-primary" onClick={onDownload} disabled={!canDownload}>
                  {step === "downloading" ? (
                    <>
                      <span className="wf-spin" /> Downloading…
                    </>
                  ) : (
                    "Download Certificate (Sign Again)"
                  )}
                </button>

                <a
                  className={`wf-btn wf-btn-primary wf-link ${unlocked ? "" : "disabled"}`}
                  href={unlocked ? viewHref : "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!unlocked) e.preventDefault();
                  }}
                >
                  View NFT (OpenSea)
                </a>
              </div>

              {error ? (
                <div className="wf-err">
                  <div className="wf-errTitle">Access Blocked</div>
                  <div className="wf-errBody">{error}</div>
                </div>
              ) : null}

              {/* ✅ Opacity slider (works after verify). Visible always, disabled until verified. */}
              <div className={`wf-dev ${verify ? "" : "wf-devDisabled"}`}>
                <div className="wf-devTitle">Watermark Opacity</div>
                <input
                  className="wf-range"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={wmOpacity}
                  disabled={!verify}
                  onChange={(e) => setWmOpacity(Number(e.target.value))}
                />
                <div className="wf-devVal">{wmOpacity.toFixed(2)}</div>
                {!verify ? <div className="wf-devHint">Verify first to enable watermark overlay.</div> : null}
              </div>
            </div>
          </aside>

          {/* RIGHT PREVIEW */}
          <main className="wf-main">
            <div className="wf-frame">
              <div className="wf-frameTop">
                <div className="wf-frameTitle">
                  CERTIFICATE PREVIEW
                  <span className="wf-frameTag">{verify ? "VERIFIED" : "LOCKED"}</span>
                </div>
              </div>

              <div className="wf-previewWrapOuter">
                <div
                  className={`wf-previewWrap ${verify ? "unlocked" : "locked"}`}
                  onContextMenu={blockSave}
                  onDragStart={blockSave}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => (e as any).preventDefault?.()}
                  style={{
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                  }}
                >
                  {/* Animations stay */}
                  <div className="wf-glowPulse" />
                  <div className="wf-scanlines" />
                  <div className="wf-noise" />

                  {verify ? <div className="wf-verifiedBadge">VERIFIED OWNER</div> : null}

                  {/* Canvas always present; it draws LOCKED before verify */}
                  <canvas ref={canvasRef} className="wf-canvas" />
                </div>
              </div>
            </div>
          </main>
        </div>

        <style jsx global>{`
          :root {
            --g: rgba(101, 217, 22, 1);
            --g2: rgba(0, 140, 255, 1);
          }

          .wf-bg {
            min-height: 100vh;
            background: radial-gradient(1200px 600px at 15% 20%, rgba(101, 217, 22, 0.12), transparent 55%),
              radial-gradient(900px 500px at 80% 15%, rgba(0, 140, 255, 0.1), transparent 55%),
              linear-gradient(180deg, #05070a, #05070a 45%, #030406);
            color: #eafff8;
            font-family: "Orbitron", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          }

          .wf-grid {
            position: fixed;
            inset: 0;
            pointer-events: none;
            background-image: linear-gradient(to right, rgba(101, 217, 22, 0.06) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(101, 217, 22, 0.04) 1px, transparent 1px);
            background-size: 70px 70px;
            mask-image: radial-gradient(circle at 40% 20%, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.3), transparent 70%);
            opacity: 0.55;
          }

          .wf-shell {
            display: grid;
            grid-template-columns: 420px 1fr;
            gap: 22px;
            padding: 28px;
            max-width: 1480px;
            margin: 0 auto;
          }

          .wf-rail {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .wf-brand {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .wf-logo {
            width: 46px;
            height: 46px;
            border-radius: 14px;
            display: grid;
            place-items: center;
            font-weight: 900;
            letter-spacing: 0.12em;
            background: linear-gradient(135deg, rgba(101, 217, 22, 0.28), rgba(0, 140, 255, 0.16));
            border: 1px solid rgba(101, 217, 22, 0.35);
            box-shadow: 0 0 0 1px rgba(101, 217, 22, 0.12), 0 18px 55px rgba(101, 217, 22, 0.08);
          }
          .wf-title {
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.12em;
          }
          .wf-sub {
            font-size: 12px;
            color: rgba(234, 255, 248, 0.65);
            font-family: ui-sans-serif, system-ui;
          }

          .wf-card {
            border-radius: 18px;
            background: linear-gradient(180deg, rgba(11, 16, 22, 0.82), rgba(8, 10, 14, 0.82));
            border: 1px solid rgba(101, 217, 22, 0.18);
            box-shadow: 0 0 0 1px rgba(101, 217, 22, 0.08), 0 25px 80px rgba(0, 0, 0, 0.55);
            padding: 16px;
          }

          .wf-kv {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 8px 10px;
            padding: 12px;
            border-radius: 14px;
            background: rgba(0, 0, 0, 0.22);
            border: 1px solid rgba(255, 255, 255, 0.06);
            font-family: ui-sans-serif, system-ui;
          }
          .wf-k {
            font-size: 12px;
            color: rgba(234, 255, 248, 0.65);
          }
          .wf-v {
            font-size: 12px;
            font-weight: 700;
          }
          .wf-mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }

          .wf-actions {
            display: grid;
            gap: 10px;
            margin-top: 12px;
          }

          .wf-btn {
            width: 100%;
            border-radius: 14px;
            padding: 12px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            font-size: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.25);
            color: rgba(234, 255, 248, 0.92);
            cursor: pointer;
            transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
            position: relative;
            overflow: hidden;
          }
          .wf-btn::before {
            content: "";
            position: absolute;
            inset: -2px;
            background: radial-gradient(420px 140px at 20% 10%, rgba(101, 217, 22, 0.22), transparent 55%),
              radial-gradient(420px 140px at 80% 10%, rgba(0, 140, 255, 0.16), transparent 55%);
            opacity: 0.4;
            filter: blur(10px);
            pointer-events: none;
          }
          .wf-btn:hover {
            transform: translateY(-1px);
            border-color: rgba(101, 217, 22, 0.28);
            box-shadow: 0 0 0 1px rgba(101, 217, 22, 0.1), 0 16px 40px rgba(0, 0, 0, 0.5);
            filter: brightness(1.05);
          }
          .wf-btn:disabled,
          .wf-link.disabled {
            opacity: 0.42;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
            filter: none;
          }
          .wf-btn:disabled::after,
          .wf-link.disabled::after {
            content: "🔒";
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.7;
            font-size: 14px;
          }
          .wf-btn-primary {
            background: linear-gradient(135deg, rgba(101, 217, 22, 0.26), rgba(0, 140, 255, 0.14));
            border-color: rgba(101, 217, 22, 0.34);
            animation: wfBtnPulse 2.6s ease-in-out infinite;
          }
          @keyframes wfBtnPulse {
            0% {
              box-shadow: 0 0 0 rgba(101, 217, 22, 0);
            }
            50% {
              box-shadow: 0 0 26px rgba(101, 217, 22, 0.14);
            }
            100% {
              box-shadow: 0 0 0 rgba(101, 217, 22, 0);
            }
          }

          .wf-link {
            display: inline-block;
            text-align: center;
            text-decoration: none;
            line-height: 1.2;
          }

          .wf-spin {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 999px;
            border: 2px solid rgba(234, 255, 248, 0.25);
            border-top-color: rgba(101, 217, 22, 0.9);
            margin-right: 8px;
            animation: wfspin 0.9s linear infinite;
          }
          @keyframes wfspin {
            to {
              transform: rotate(360deg);
            }
          }

          .wf-err {
            margin-top: 12px;
            padding: 12px;
            border-radius: 14px;
            background: rgba(255, 50, 50, 0.08);
            border: 1px solid rgba(255, 50, 50, 0.25);
            font-family: ui-sans-serif, system-ui;
          }
          .wf-errTitle {
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            font-size: 12px;
            margin-bottom: 6px;
          }
          .wf-errBody {
            white-space: pre-wrap;
            font-size: 12px;
            color: rgba(255, 210, 210, 0.95);
          }

          .wf-dev {
            margin-top: 12px;
            padding: 10px 12px;
            border-radius: 14px;
            border: 1px solid rgba(101, 217, 22, 0.18);
            background: rgba(0, 0, 0, 0.25);
            font-family: ui-sans-serif, system-ui;
          }
          .wf-devDisabled {
            opacity: 0.7;
          }
          .wf-devTitle {
            font-weight: 900;
            letter-spacing: 0.12em;
            font-size: 11px;
            margin-bottom: 8px;
            color: rgba(234, 255, 248, 0.85);
          }
          .wf-range {
            width: 100%;
          }
          .wf-devVal {
            margin-top: 6px;
            font-size: 12px;
            color: rgba(234, 255, 248, 0.7);
          }
          .wf-devHint {
            margin-top: 6px;
            font-size: 11px;
            color: rgba(234, 255, 248, 0.55);
          }

          .wf-frame {
            border-radius: 22px;
            border: 1px solid rgba(101, 217, 22, 0.16);
            background: rgba(0, 0, 0, 0.18);
            box-shadow: 0 0 0 1px rgba(101, 217, 22, 0.07), 0 30px 90px rgba(0, 0, 0, 0.6);
            overflow: hidden;
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .wf-frameTop {
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            background: linear-gradient(180deg, rgba(12, 16, 22, 0.88), rgba(0, 0, 0, 0.12));
          }
          .wf-frameTitle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 900;
            letter-spacing: 0.14em;
            font-size: 12px;
          }
          .wf-frameTag {
            font-weight: 900;
            font-size: 11px;
            letter-spacing: 0.14em;
            color: rgba(234, 255, 248, 0.72);
            font-family: ui-sans-serif, system-ui;
          }
          .wf-previewWrapOuter {
            padding: 18px;
            flex: 1;
            display: grid;
            place-items: center;
          }

          .wf-previewWrap {
            width: min(1200px, 100%);
            aspect-ratio: ${CERT_W} / ${CERT_H};
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.25);
            position: relative;
            isolation: isolate;
          }

          .wf-canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
            -webkit-user-drag: none;
            z-index: 1;
          }

          /* scanlines */
          .wf-scanlines {
            pointer-events: none;
            position: absolute;
            inset: 0;
            background: repeating-linear-gradient(
              to bottom,
              rgba(101, 217, 22, 0.14) 0px,
              rgba(101, 217, 22, 0.14) 1px,
              transparent 3px,
              transparent 9px
            );
            animation: scanlineMove 8.6s linear infinite;
            opacity: 0.34;
            mix-blend-mode: screen;
            z-index: 4;
          }
          @keyframes scanlineMove {
            from {
              background-position-y: -120%;
            }
            to {
              background-position-y: 120%;
            }
          }

          /* hologram noise */
          .wf-noise {
            pointer-events: none;
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 30% 20%, rgba(101, 217, 22, 0.18), transparent 55%),
              radial-gradient(circle at 70% 70%, rgba(0, 140, 255, 0.12), transparent 55%);
            animation: holoFlicker 3.7s ease-in-out infinite;
            opacity: 0.35;
            z-index: 3;
          }
          @keyframes holoFlicker {
            0% {
              opacity: 0.22;
            }
            50% {
              opacity: 0.58;
            }
            100% {
              opacity: 0.22;
            }
          }

          /* glow pulse */
          .wf-glowPulse {
            pointer-events: none;
            position: absolute;
            inset: -6px;
            box-shadow: 0 0 40px rgba(101, 217, 22, 0.36), 0 0 110px rgba(101, 217, 22, 0.18);
            animation: glowPulse 2.4s ease-in-out infinite;
            opacity: 0.55;
            z-index: 2;
          }
          @keyframes glowPulse {
            0%,
            100% {
              opacity: 0.42;
            }
            50% {
              opacity: 1;
            }
          }

          /* verified badge */
          .wf-verifiedBadge {
            position: absolute;
            top: 16px;
            right: 16px;
            padding: 8px 14px;
            border-radius: 999px;
            font-weight: 900;
            letter-spacing: 0.14em;
            font-size: 11px;
            color: rgba(101, 217, 22, 0.98);
            border: 1px solid rgba(101, 217, 22, 0.62);
            background: rgba(0, 0, 0, 0.45);
            animation: badgePulse 2s ease-in-out infinite;
            z-index: 6;
          }
          @keyframes badgePulse {
            0%,
            100% {
              box-shadow: 0 0 12px rgba(101, 217, 22, 0.38);
            }
            50% {
              box-shadow: 0 0 28px rgba(101, 217, 22, 0.92);
            }
          }

          @media (max-width: 1080px) {
            .wf-shell {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </>
  );
}
