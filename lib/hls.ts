export type Variant = { label: string; url: string; width: number | null; height: number | null; bandwidth: number | null; codecs: string | null; frame_rate: number | null };
export type HlsMediaTrack = { type: string; name: string | null; lang: string | null; url: string | null };
export type HlsInfo = { kind: "master" | "media"; variants: Variant[]; subtitles: HlsMediaTrack[]; audio: HlsMediaTrack[]; encryption: string[] };

function attrs(line: string) {
  const o: Record<string, string> = {};
  for (const m of line.slice(line.indexOf(":") + 1).matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) o[m[1]] = m[2].replace(/^"|"$/g, "");
  return o;
}

export function parseHls(text: string, base: string): HlsInfo | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines[0] || !lines[0].startsWith("#EXTM3U")) return null;
  const abs = (u: string) => { try { return new URL(u, base).href; } catch { return u; } };
  const variants: Variant[] = [], subtitles: HlsMediaTrack[] = [], audio: HlsMediaTrack[] = [];
  const enc = new Set<string>();
  lines.forEach((l, i) => {
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const a = attrs(l), uri = lines[i + 1];
      if (!uri || uri.startsWith("#")) return;
      const [w, h] = (a.RESOLUTION || "").split("x").map(Number);
      const bw = a.BANDWIDTH ? Number(a.BANDWIDTH) : null;
      variants.push({
        label: h ? `${h}p` : bw ? `${Math.round(bw / 1000)}kbps` : "variant",
        url: abs(uri), width: w || null, height: h || null, bandwidth: bw,
        codecs: a.CODECS || null, frame_rate: a["FRAME-RATE"] ? Number(a["FRAME-RATE"]) : null,
      });
    } else if (l.startsWith("#EXT-X-MEDIA:")) {
      const a = attrs(l);
      const t = { type: a.TYPE, name: a.NAME || null, lang: a.LANGUAGE || null, url: a.URI ? abs(a.URI) : null };
      if (a.TYPE === "SUBTITLES" || a.TYPE === "CLOSED-CAPTIONS") subtitles.push(t);
      else if (a.TYPE === "AUDIO") audio.push(t);
    } else if (l.startsWith("#EXT-X-KEY:")) {
      const a = attrs(l);
      if (a.METHOD && a.METHOD !== "NONE") enc.add(a.KEYFORMAT ? `${a.METHOD} (${a.KEYFORMAT})` : a.METHOD);
    }
  });
  variants.sort((x, y) => (y.height ?? 0) - (x.height ?? 0) || (y.bandwidth ?? 0) - (x.bandwidth ?? 0));
  return { kind: variants.length ? "master" : "media", variants, subtitles, audio, encryption: [...enc] };
}

export function parseMpd(text: string) {
  const reps = [...text.matchAll(/<Representation\b[^>]*>/g)].map((m) => {
    const g = (k: string) => m[0].match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? null;
    const h = g("height") ? Number(g("height")) : null;
    return { label: h ? `${h}p` : "audio/other", width: g("width") ? Number(g("width")) : null, height: h,
      bandwidth: g("bandwidth") ? Number(g("bandwidth")) : null, codecs: g("codecs"), mime: g("mimeType") };
  });
  return { reps, protected: /<ContentProtection\b/i.test(text) };
}
