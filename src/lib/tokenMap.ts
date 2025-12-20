export function codeToTokenId(code: string):
  | { ok: true; tokenId: number }
  | { ok: false; error: string } {

  const c = (code || "").trim();

  // Accept BOTH formats:
  // W-LIM-X-20-17-20   (old)
  // W-LIM-X-20-17-120  (new batch)
const m = /^W-LIM-X-20-(\d+)-(20|120|200)$/.exec(c);
if (!m) return { ok: false, error: "Invalid code format" };

const n = Number(m[1]);
if (!Number.isFinite(n)) return { ok: false, error: "Invalid number" };

const max = Number(m[2]); // 20, 120, or 200
if (!Number.isFinite(max)) return { ok: false, error: "Invalid max" };
if (n < 1 || n > max) return { ok: false, error: `Out of range (1-${max})` };

  return { ok: true, tokenId: n - 1 };
}
