// src/lib/certLock.ts
type ConsumeMeta = { wallet: string };

const mem = new Map<string, ConsumeMeta>();

function upstashEnabled() {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}
function singleUseEnabled() {
  return String(process.env.CERT_SINGLE_USE || "0") === "1";
}

async function upstashFetch(path: string, init?: RequestInit) {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
  return res.json();
}

export async function isLocked(key: string) {
  if (!singleUseEnabled()) return false;

  if (upstashEnabled()) {
    const j = await upstashFetch(`/get/${encodeURIComponent(key)}`);
    return j?.result != null;
  }
  return mem.has(key);
}

export async function tryConsumeOnce(key: string, meta: ConsumeMeta) {
  if (!singleUseEnabled()) return true;

  if (upstashEnabled()) {
    // SETNX
    const j = await upstashFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(meta))}?nx=true`);
    // Upstash returns { result: "OK" } when set, null otherwise
    return j?.result === "OK";
  }

  if (mem.has(key)) return false;
  mem.set(key, meta);
  return true;
}
