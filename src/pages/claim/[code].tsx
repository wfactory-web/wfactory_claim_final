// src/pages/claim/[code].tsx
export const dynamic = "force-dynamic";
import { useRouter } from "next/router";
import { useMemo, useState, useEffect } from "react";

import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { polygon } from "thirdweb/chains";
import { inAppWallet, createWallet } from "thirdweb/wallets";
import { keccak256, toUtf8Bytes } from "ethers";
import { QRCodeCanvas } from "qrcode.react";

import { client } from "@/lib/thirdwebClient";
import { codeToTokenId } from "@/lib/tokenMap";
import LoadingOverlay from "@/components/loading_overlay";
type ViewState = "idle" | "loading" | "success" | "already" | "error";

type CheckNfcResp =
  | { ok: true; authorized: boolean; used?: boolean; nfcHash?: string }
  | { ok: false; error?: string };

type CheckClaimResp =
  | { ok: true; exists: boolean; owner?: string }
  | { ok: false; error?: string };

function getErrMsg(x: unknown): string {
  if (!x || typeof x !== "object") return "";
  if ("error" in x && typeof (x as any).error === "string") return (x as any).error;
  return "";
}

export default function ClaimPage() {
  const router = useRouter();
  const account = useActiveAccount();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<"loading" | "success">("loading");

  // NFC secret (from URL ?p=XXXX)
  const p = useMemo(() => {
    const raw = router.query.p;
    return typeof raw === "string" ? raw : "";
  }, [router.query.p]);

  // NFC state
  const [nfcAuthorized, setNfcAuthorized] = useState(false);
  const [nfcUsed, setNfcUsed] = useState(false);
  const [nfcHash, setNfcHash] = useState("");

  // UI state
  const [view, setView] = useState<ViewState>("idle");
  const [alreadyOwner, setAlreadyOwner] = useState("");
  const [invalidLink, setInvalidLink] = useState(false);

  const code = useMemo(() => {
    const raw = router.query.code;
    return typeof raw === "string" ? raw : "";
  }, [router.query.code]);

  const mapped = useMemo(() => {
    if (!code) return null;
    return codeToTokenId(code);
  }, [code]);

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

  const tokenIdText = useMemo(() => {
    if (!mapped) return "—";
    if (!mapped.ok) return "Invalid";
    return String(mapped.tokenId);
  }, [mapped]);

  const tokenIdOrNull = useMemo(() => {
    return mapped && mapped.ok ? mapped.tokenId : null;
  }, [mapped]);

  const openSeaUrl = useMemo(() => {
    if (!contractAddress || mintedTokenId === null) return "";
    return `https://opensea.io/assets/matic/${contractAddress}/${mintedTokenId}`;
  }, [contractAddress, mintedTokenId]);

  // ----------------------------
  // 1) NFC PRE-CHECK (requires ?p=XXXX)
  // ----------------------------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      // reset each time
      setNfcAuthorized(false);
      setNfcUsed(false);
      setNfcHash("");
      setInvalidLink(false);
      setAlreadyOwner("");

      if (!router.isReady) return;
      if (!code) return;

      // If mapping invalid => invalid link UI
      if (!mapped || !mapped.ok) {
        setInvalidLink(true);
        setView("error");
        setStatus("❌ Invalid or malformed claim link.");
        return;
      }

      // Require p (NFC secret)
      if (!p) {
        
        setView("error");
        setStatus("🔒 Unauthorized. Please tap the NFC tag to claim.");
        return;
      }

      try {
        setView("loading");
        setStatus("🔒 Verifying NFC…");

        const qs = new URLSearchParams({ code, p });
        const r = await fetch(`/api/check-nfc?${qs.toString()}`);
        const j: CheckNfcResp = await r.json();

        if (cancelled) return;

        if (!r.ok || !j?.ok) {
          const msg = getErrMsg(j) || "🔒 NFC verification failed. Please scan the original tag.";
          setView("error");
          setStatus(msg);
          return;
        }

        if (!j.authorized) {
          setView("error");
          setStatus("🔒 Unauthorized NFC. Please scan the original tag.");
          return;
        }

        setNfcAuthorized(true);
        setNfcUsed(Boolean(j.used));
        setNfcHash(String(j.nfcHash || ""));
        setStatus(""); // clear; next effect will check claimed status
        setView("idle");
      } catch {
        if (cancelled) return;
        setView("error");
        setStatus("🔒 NFC verification network error. Try again.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, code, p, mapped]);

  // ----------------------------
  // 2) ON-CHAIN CLAIMED PRE-CHECK
  //    runs ONLY if NFC authorized + mapping ok
  // ----------------------------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!contractAddress) return;
      if (!router.isReady) return;
      if (!code) return;
      if (!nfcAuthorized) return;
      if (tokenIdOrNull === null) return;

      setStatus("Checking claim status…");

      try {
        const r = await fetch(
          `/api/check-claim?contractAddress=${encodeURIComponent(
            contractAddress
          )}&tokenId=${encodeURIComponent(String(tokenIdOrNull))}`
        );

        const j: CheckClaimResp = await r.json();
        if (cancelled) return;

        if (!r.ok || !j?.ok) {
          // if API fails, do NOT block mint; just clear status
          setStatus("");
          setView("idle");
          return;
        }

        if (j.exists === true) {
          setView("already");
          setMintedTokenId(Number(tokenIdOrNull));
          setAlreadyOwner(String(j.owner || ""));
          setStatus("⚠️ This NFT has already been claimed.");
        } else {
          setView("idle");
          setStatus("");
        }
      } catch {
        if (cancelled) return;
        setView("idle");
        setStatus("");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [contractAddress, router.isReady, code, nfcAuthorized, tokenIdOrNull]);

  async function onClaim() {
    console.log("[onClaim] clicked", {
      code,
      contractAddress,
      mapped,
      account: account?.address,
      nfcAuthorized,
      nfcUsed,
      nfcHash,
    });
    setOverlayOpen(true);
    setOverlayPhase("loading");
    setBusy(true);

    try {
      setStatus("");
      setTxHash("");
      setMintedTokenId(null);
      setAlreadyOwner("");
      setView("loading");

      // ---- guards ----
      if (!contractAddress) {
        setView("error");
        setStatus("Missing NEXT_PUBLIC_CONTRACT_ADDRESS (Vercel env).");
        setOverlayOpen(false);
        setOverlayPhase("loading");
        return;
      }

      if (!account?.address) {
        setView("error");
        setStatus("Connect wallet first (MetaMask or Email).");
        return;
      }

      if (!mapped || !mapped.ok) {
        setView("error");
        setStatus(mapped?.error || "Invalid code.");
        return;
      }

      // Must be NFC authorized (V2 security)
      if (!nfcAuthorized) {
        setView("error");
        setStatus("🔒 Unauthorized. Please tap the NFC tag to claim.");
        return;
      }

      const baseUri = process.env.NEXT_PUBLIC_METADATA_BASE_URI || "";
      if (!baseUri) {
        setView("error");
        setStatus("Missing NEXT_PUBLIC_METADATA_BASE_URI (Vercel env).");
        return;
      }

      // ✅ ensure trailing slash
      const base = baseUri.endsWith("/") ? baseUri : `${baseUri}/`;
      const uri = `${base}${mapped.tokenId}.json`;

      // Your contract uses req.nfcHash bytes32; we keep hash = keccak(code)
      const reqNfcHash = keccak256(toUtf8Bytes(code));
      const validUntil = Math.floor(Date.now() / 1000) + 15 * 60;

      // ---- 1) sign-mint ----
      setStatus("Signing…");

      const signRes = await fetch("/api/sign-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          tokenId: mapped.tokenId,
          to: account.address,
          uri,
          nfcHash: reqNfcHash,
          validUntil,
        }),
      });

      const signRaw = await signRes.text();
      let signData: any = null;
      try {
        signData = JSON.parse(signRaw);
      } catch {
        setView("error");
        setStatus(
          `Sign-mint returned non-JSON (${signRes.status}): ${signRaw.slice(0, 250)}`
        );
        return;
      }

      if (!signData?.ok && signData?.status === "already_claimed") {
        setView("already");
        setMintedTokenId(Number(signData.tokenId));
        setAlreadyOwner(String(signData.owner || ""));
        setStatus("⚠️ This NFT has already been claimed.");
        return;
      }

      if (!signRes.ok || !signData?.ok) {
        setView("error");
        setStatus(signData?.error || `Signing failed (${signRes.status})`);
        return;
      }

      // ---- 2) claim (gas sponsored) ----
      setStatus("Minting (gas sponsored)…");

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress,
          mintReq: signData.req,
          sig: signData.sig,
          // email will be added later for certificate sending
        }),
      });

      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        setView("error");
        setStatus(`Claim returned non-JSON (${res.status}): ${raw.slice(0, 250)}`);
        return;
      }

      if (!res.ok || !data?.ok) {
        setView("error");
        setStatus(data?.error || `Mint failed (${res.status})`);
        return;
      }

      // ---- success ----
      setTxHash(String(data.txHash || ""));
      setMintedTokenId(Number(data.tokenId));
      setView("success");
      setStatus("✅ Mint success! Your NFT is now live.");


      // keep your existing behavior for mintedTokenId (no logic refactor)
      // but also compute a safe token id for redirect:
      const redirectTokenId =
      data?.tokenId !== undefined && data?.tokenId !== null
      ? data.tokenId
      : mapped.tokenId;

      setMintedTokenId(Number(redirectTokenId));
      setView("success");
      setStatus("✅ Mint success! Your NFT is now live.");

      // ✅ overlay success + redirect (this is your new feature)
      
      setOverlayPhase("success");
      window.setTimeout(() => {
      router.push(`/cert/${encodeURIComponent(String(data.certToken))}`);
      }, 1000);

    } catch (err: any) {
      console.error("Claim fatal error:", err);
      setView("error");
      setStatus(String(err?.stack || err?.message || err));
      setOverlayOpen(false);
      setOverlayPhase("loading");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="bg" />

    <LoadingOverlay
      open={overlayOpen}
      phase={overlayPhase}
      onSuccessDelayDone={() => {
      // redirect handled in onClaim
      }}
    />
      <div className="wrap">
        <div className="card">
          <div className="top">
            <div className="brand">
              <span className="dot" />
              <div>
                <div className="title">W FACTORY — CLAIM PORTAL</div>
                <div className="sub">We Don't Follow The Future. We Manufacture It .</div>
              </div>
            </div>

            <div className="connect">
              <ConnectButton
                client={client}
                chain={polygon}
                wallets={[
                  inAppWallet({ auth: { options: ["email"] } }),
                  createWallet("io.metamask"),
                ]}
              />
            </div>
          </div>

          <div className="grid">
            <div className="left">
              <div className="robotWrap">
                <img src="/ui/robot.png" className="robot" alt="robot" />
                <div className="scanline" />
                <div className="scanSweep" />
                <div className="particles" />
                <div className="glitch" />
              </div>

              <div className="leftCopy">
                <div className="h1">Authenticate • Claim • Own</div>
                <div className="p">
                  Tap NFC. Verify the shirt code. Mint the exact matching NFT via signature mint on Polygon.
                </div>
              </div>
            </div>

            <div className="right">
              <div className="panel">
                <div className="panelTitle">Claim Your NFT</div>

                <div className="rows">
                  <div className="row">
                    <div className="k">T-SHIRT CODE</div>
                    <div className="v">{code || "Loading…"}</div>
                  </div>
                  <div className="row">
                    <div className="k">EXACT TOKEN ID</div>
                    <div className="v neon">{tokenIdText}</div>
                  </div>
                  <div className="row">
                    <div className="k">WALLET</div>
                    <div className="v mono">
                      {account?.address ? account.address : "Not connected"}
                    </div>
                  </div>
                </div>

                <button
                  className="btn"
                  onClick={onClaim}
                  disabled={
                    busy ||
                    view === "success" ||
                    view === "already" ||
                    !account?.address ||
                    !mapped?.ok ||
                    !nfcAuthorized
                  }
                >
                  {busy ? "PROCESSING…" : "CLAIM NOW"}
                </button>

                {status ? <div className="status">{status}</div> : null}

                {/* INVALID LINK (clean UI block) */}
                {view === "error" && invalidLink ? (
                  <div className="status" style={{ marginTop: 10, color: "rgba(255,90,120,0.95)" }}>
                    <div style={{ fontWeight: 900 }}>Invalid Claim Link</div>
                    <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
                      This NFC / URL is not valid. Please scan the original tag again.
                    </div>
                  </div>
                ) : null}

                {/* SUCCESS */}
                {view === "success" && txHash ? <div className="tx mono">Tx: {txHash}</div> : null}

                {view === "success" && mintedTokenId !== null ? (
                  <div className="successBox">
                    <a className="os" href={openSeaUrl} target="_blank" rel="noreferrer">
                      View NFT on OpenSea
                    </a>

                    <div className="qr">
                      <QRCodeCanvas value={openSeaUrl} size={132} includeMargin />
                      <div className="qrText mono">Scan to view</div>
                    </div>
                  </div>
                ) : null}

                {/* ALREADY CLAIMED */}
                {view === "already" && mintedTokenId !== null ? (
                  <div className="successBox">
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontWeight: 900 }}>⚠️ Already Claimed</div>
                      <div className="mono" style={{ fontSize: 12, opacity: 0.8 }}>
                        Token ID: {mintedTokenId}
                      </div>
                      <div className="mono" style={{ fontSize: 12, opacity: 0.8 }}>
                        Owner:{" "}
                        {alreadyOwner
                          ? `${alreadyOwner.slice(0, 6)}...${alreadyOwner.slice(-4)}`
                          : "—"}
                      </div>

                      {openSeaUrl ? (
                        <a className="os" href={openSeaUrl} target="_blank" rel="noreferrer">
                          View NFT
                        </a>
                      ) : null}
                    </div>

                    {openSeaUrl ? (
                      <div className="qr">
                        <QRCodeCanvas value={openSeaUrl} size={132} includeMargin />
                        <div className="qrText mono">Scan to view</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="rules">
                  <div className="rulesTitle">Rules</div>
                  <ul>
                    <li>1 code → 1 mint only</li>
                    <li>Code 15 → TokenId 14 (code − 1)</li>
                    <li>Email wallet + MetaMask supported</li>
                    <li>Polygon Mainnet (137)</li>
                  </ul>
                </div>

                <div className="contract mono">Contract: {contractAddress || "(missing env)"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="hint mono">Hover robot → premium holo scan + particles</div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          position: relative;
          color: #eef2ff;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          overflow: hidden;
          background: #07080b;
        }

        /* premium holo ambient (like your screenshot) */
        .bg {
          position: fixed;
          inset: -30%;
          background:
            radial-gradient(1200px 800px at 18% 20%, rgba(0, 255, 210, 0.22), transparent 55%),
            radial-gradient(1100px 720px at 80% 30%, rgba(120, 60, 255, 0.22), transparent 58%),
            radial-gradient(900px 700px at 50% 85%, rgba(255, 0, 160, 0.18), transparent 60%),
            linear-gradient(180deg, #07080b 0%, #05060a 100%);
          filter: blur(20px);
          opacity: 0.95;
        }

        .wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center; /* PERFECT CENTER */
          padding: 26px 16px;
          position: relative;
          z-index: 2;
        }

        .card {
          width: min(1120px, 96vw);
          border-radius: 26px;
          overflow: hidden;
          background: rgba(18, 20, 28, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(18px) saturate(165%);
          box-shadow: 0 40px 140px rgba(0, 0, 0, 0.65);
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .brand { display: flex; gap: 12px; align-items: center; }
        .dot {
          width: 10px; height: 10px; border-radius: 999px;
          background: rgba(0, 255, 210, 0.95);
          box-shadow: 0 0 18px rgba(0, 255, 210, 0.75);
        }
        .title { font-weight: 900; letter-spacing: 0.14em; font-size: 11px; opacity: 0.92; }
        .sub { font-size: 12px; opacity: 0.62; margin-top: 3px; }

        .grid {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          min-height: 520px;
        }
        @media (max-width: 980px) {
          .grid { grid-template-columns: 1fr; }
        }

        .left {
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          min-height: 520px;
        }
        @media (max-width: 980px) {
          .left { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); min-height: 420px; }
        }

        .robotWrap {
          position: relative;
          flex: 1;
          overflow: hidden;
          background: radial-gradient(700px 520px at 40% 35%, rgba(255,255,255,0.10), transparent 60%);
        }

        .robot {
          width: 100%;
          height: 100%;
          object-fit: cover;     /* no gaps */
          object-position: center;
          display: block;
          transform: scale(1.03);
          transition: transform 280ms ease, filter 280ms ease;
          filter: drop-shadow(0 18px 70px rgba(0,0,0,0.55));
        }

        /* hover premium effects */
        .robotWrap:hover .robot {
          transform: scale(1.06);
          filter:
            drop-shadow(0 18px 90px rgba(0,255,210,0.12))
            drop-shadow(0 18px 90px rgba(255,0,160,0.10));
        }

        .scanline {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.06),
            rgba(255,255,255,0.06) 1px,
            transparent 1px,
            transparent 7px
          );
          opacity: 0.06;
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        .scanSweep {
          position: absolute;
          inset: -30% -30%;
          opacity: 0;
          pointer-events: none;
          background: linear-gradient(
            120deg,
            transparent 0%,
            rgba(255,255,255,0.10) 35%,
            rgba(0,255,210,0.12) 50%,
            rgba(255,0,160,0.10) 65%,
            transparent 100%
          );
          filter: blur(10px);
          transform: translateX(-40%) translateY(-10%) rotate(10deg);
          transition: opacity 220ms ease;
        }

        .particles {
          position: absolute;
          inset: -40%;
          opacity: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 30% 35%, rgba(0,255,210,0.25), transparent 28%),
            radial-gradient(circle at 70% 30%, rgba(255,0,160,0.18), transparent 26%),
            radial-gradient(circle at 55% 78%, rgba(120,60,255,0.18), transparent 30%);
          filter: blur(10px);
          transition: opacity 220ms ease;
        }

        .glitch {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            rgba(0,255,210,0.10),
            transparent 35%,
            rgba(255,0,160,0.08)
          );
          mix-blend-mode: screen;
          transition: opacity 220ms ease;
        }

        .robotWrap:hover .scanSweep,
        .robotWrap:hover .particles,
        .robotWrap:hover .glitch {
          opacity: 1;
          animation: sweep 1.8s ease-in-out infinite;
        }

        @keyframes sweep {
          0% { transform: translateX(-55%) translateY(-12%) rotate(10deg); }
          50% { transform: translateX(10%) translateY(8%) rotate(10deg); }
          100% { transform: translateX(-55%) translateY(-12%) rotate(10deg); }
        }

        .leftCopy { padding: 14px 16px 16px; }
        .h1 { font-weight: 900; font-size: 22px; letter-spacing: 0.02em; }
        .p { margin-top: 8px; opacity: 0.72; line-height: 1.55; font-size: 13px; }

        .right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .panel {
          width: 100%;
          max-width: 460px;
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 24px 90px rgba(0,0,0,0.35);
          position: relative;
          overflow: hidden;
        }

        /* subtle holographic sheen */
        .panel::before {
          content: "";
          position: absolute;
          inset: -40%;
          background: conic-gradient(
            from 180deg,
            rgba(0,255,210,0.18),
            rgba(120,60,255,0.16),
            rgba(255,0,160,0.14),
            rgba(255,255,255,0.06),
            rgba(0,255,210,0.18)
          );
          filter: blur(28px);
          opacity: 0.55;
          pointer-events: none;
        }

        .panelTitle {
          position: relative;
          font-size: 24px;
          font-weight: 900;
          margin-bottom: 12px;
        }

        .rows {
          position: relative;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.20);
          overflow: hidden;
        }

        .row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .row:last-child { border-bottom: none; }

        .k { font-size: 11px; letter-spacing: 0.14em; opacity: 0.72; }
        .v { font-weight: 800; font-size: 13px; text-align: right; word-break: break-all; }
        .neon { color: #00ffd2; text-shadow: 0 0 16px rgba(0,255,210,0.35); }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }

        .btn {
          position: relative;
          margin-top: 14px;
          width: 100%;
          height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(0,255,210,0.28);
          background: linear-gradient(180deg, rgba(0,255,210,0.10), rgba(0,0,0,0.10));
          color: #eaffff;
          font-weight: 900;
          letter-spacing: 0.22em;
          cursor: pointer;
        }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .status { position: relative; margin-top: 10px; font-size: 13px; opacity: 0.88; }
        .tx { position: relative; margin-top: 8px; font-size: 12px; opacity: 0.8; word-break: break-all; }

        .successBox {
          position: relative;
          margin-top: 12px;
          display: flex;
          gap: 14px;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
        }

        .os {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 38px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.14);
          text-decoration: none;
          color: #eef2ff;
          font-weight: 800;
          background: rgba(255,255,255,0.06);
          white-space: nowrap;
        }

        .qr { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .qrText { font-size: 11px; opacity: 0.7; }

        .rules {
          position: relative;
          margin-top: 12px;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
        }
        .rulesTitle { font-weight: 900; letter-spacing: 0.10em; font-size: 12px; margin-bottom: 8px; opacity: 0.9; }
        .rules ul { margin: 0; padding-left: 18px; opacity: 0.82; font-size: 13px; line-height: 1.7; }

        .contract { position: relative; margin-top: 10px; font-size: 11px; opacity: 0.55; word-break: break-all; }

        .hint { margin-top: 12px; font-size: 11px; opacity: 0.55; }
      `}</style>
    </div>
  );
}
