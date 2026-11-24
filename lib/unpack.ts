/** Unpacker untuk obfuscator umum "p.a.c.k.e.r" (eval(function(p,a,c,k,e,d){...})). Hanya mengembalikan teks JS biasa. */
export function unpackAll(src: string): string {
  let out = "";
  const re = /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/g;
  for (const m of src.matchAll(re)) {
    const base = +m[2], count = +m[3], dict = m[4].split("|");
    if (base < 2 || base > 62) continue;
    const enc = (n: number): string =>
      (n < base ? "" : enc(Math.floor(n / base))) + (n % base > 35 ? String.fromCharCode((n % base) + 29) : (n % base).toString(36));
    const map: Record<string, string> = {};
    for (let c = count - 1; c >= 0; c--) { const k = enc(c); map[k] = dict[c] || k; }
    out += "\n" + m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\").replace(/\b\w+\b/g, (w) => map[w] ?? w);
  }
  return out;
}
