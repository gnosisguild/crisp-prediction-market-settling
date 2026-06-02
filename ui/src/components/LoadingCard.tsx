// Loading placeholder shown while a market's on-chain state is being read, so panels don't flash
// the wrong content (e.g. a trade panel) before the real status resolves.

function Bar({ w, h = 12 }: { w: string | number; h?: number }) {
  return <span className="skel" style={{ width: w, height: h, marginTop: 8 }} />;
}

export function LoadingCard({ label = "Reading on-chain state…" }: { label?: string }) {
  return (
    <div className="committee-panel">
      <div className="committee-head">
        <div>
          <div className="pulse" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {label}
          </div>
          <Bar w={220} h={18} />
        </div>
        <div className="meta pulse">loading…</div>
      </div>
      <div style={{ marginTop: 18, display: "grid", gap: 6 }}>
        <Bar w="92%" />
        <Bar w="78%" />
        <Bar w="60%" />
      </div>
    </div>
  );
}
