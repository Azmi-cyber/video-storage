import dns from "node:dns/promises";
import net from "node:net";

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") ||
    l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") ||
    l.startsWith("::ffff:192.168.") || l.startsWith("::ffff:169.254.");
}

/** SSRF guard: hanya http(s) ke host publik. */
export async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Hanya URL http/https yang didukung.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivate(a.address))) throw new Error("Host privat/internal diblokir.");
}

export type FetchResult = {
  ok: boolean; status: number; finalUrl: string; contentType: string; body: string; truncated: boolean;
};

export async function safeFetch(
  url: string,
  o: { headers?: Record<string, string>; timeout?: number; maxBytes?: number } = {}
): Promise<FetchResult> {
  let cur = url;
  for (let hop = 0; hop <= 4; hop++) {
    const u = new URL(cur);
    await assertPublic(u);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.timeout ?? 7000);
    try {
      const res = await fetch(u, { headers: o.headers, redirect: "manual", signal: ac.signal });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { cur = new URL(loc, u).href; continue; }
      const max = o.maxBytes ?? 1_500_000;
      let size = 0;
      const chunks: Uint8Array[] = [];
      const reader = res.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length; chunks.push(value);
          if (size >= max) { await reader.cancel(); break; }
        }
      }
      return {
        ok: res.ok, status: res.status, finalUrl: u.href,
        contentType: res.headers.get("content-type") || "",
        body: Buffer.concat(chunks).toString("utf8"), truncated: size >= max,
      };
    } finally { clearTimeout(timer); }
  }
  throw new Error("Terlalu banyak redirect.");
}
