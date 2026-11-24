const pre = { background: "#141122", border: "1px solid #2a2342", borderRadius: 8, padding: 14, overflow: "auto" } as const;

export default function Home() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 18px" }}>
      <h1 style={{ color: "#b36bff", margin: 0 }}>Video-storage API</h1>
      <p>Creator: Azmi Ganteng</p>

      <h2>Cara pakai</h2>
      <pre style={pre}>GET /video/&lt;url&gt;</pre>
      <p>Ganti <code>&lt;url&gt;</code> dengan link halaman/embed yang ingin dianalisis. Response selalu JSON.</p>

      <h2>Contoh</h2>
      <pre style={pre}>{`/video/https://player.abyssplayer.com/8Vkho-Q6v
/video/https://ok.ru/videoembed/123456789
/video/https://situs.com/embed/abc?id=1
/video/https://situs.com/embed/abc?referer=https://domain-anda.com/`}</pre>
      <p>Jika sumber tidak ada di HTML, backend otomatis membuka halaman di browser headless dan merekam request video/subtitle player. Matikan dengan <code>?browser=0</code>. Request pertama bisa 15–40 detik.</p>
      <p>Parameter <code>referer</code> (opsional) hanya untuk domain Anda sendiri yang berwenang meng-embed halaman itu. Query lain ikut dikirim ke URL target.</p>

      <h2>Contoh response</h2>
      <pre style={pre}>{`{
  "creator": "Azmi Ganteng",
  "success": true,
  "source": "contoh.com",
  "page_url": "https://contoh.com/embed/abc",
  "video": {
    "url": "https://cdn.contoh.com/master.m3u8",
    "type": "hls",
    "accessible": true,
    "playlist_kind": "master",
    "qualities": [{ "label": "1080p", "width": 1920, "height": 1080, "bandwidth": 5000000, "url": "..." }]
  },
  "sources": [],
  "subtitles": [{ "language": "en", "label": "English", "format": "vtt", "url": "...", "accessible": true }],
  "limitations": [],
  "diagnostics": [],
  "status": "completed"
}`}</pre>

      <h2>Status</h2>
      <pre style={pre}>{`completed         sumber video ditemukan
no_sources_found  halaman terbuka, tapi tidak ada URL media di HTML/JS statis
blocked           server sumber menolak (401/403/404/429)
failed            URL tidak valid / timeout / error`}</pre>

      <h2>Batasan</h2>
      <p>Analisis bersifat statis (HTML, script halaman, unpack p.a.c.k.e.r, playlist HLS/MPD). Tidak ada browser headless, dan tidak ada bypass DRM, token, atau autentikasi. Jika sumber dimuat/dienkripsi lewat JavaScript saat runtime atau menolak request server, hasilnya dilaporkan apa adanya di <code>status</code> dan <code>limitations</code>.</p>
    </main>
  );
}
