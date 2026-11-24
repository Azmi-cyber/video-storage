export const metadata = { title: "Video-storage API — Azmi Ganteng", description: "API JSON untuk menganalisis sumber video dari halaman streaming." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: "#0c0a14", color: "#e9e6f5", font: "15px/1.6 ui-monospace,Menlo,Consolas,monospace" }}>{children}</body>
    </html>
  );
}
