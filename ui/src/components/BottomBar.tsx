export function BottomBar() {
  return (
    <div className="bottombar">
      <div>
        <span className="seq">// CRISP PoC // </span>
        Optimistic prediction markets with a private CRISP attester vote as the final dispute layer — no single oracle holds the key.
      </div>
      <div>
        <a href="https://github.com/gnosisguild/enclave" target="_blank" rel="noopener noreferrer">enclave</a>
        {" · "}
        <a href="https://github.com/trueo-protocol/trueo-contracts" target="_blank" rel="noopener noreferrer">trueo</a>
      </div>
      <div style={{ textAlign: "right" }}>built for demo · not for production funds</div>
    </div>
  );
}
