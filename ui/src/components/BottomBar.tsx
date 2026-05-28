export function BottomBar() {
  return (
    <div className="bottombar">
      <div>
        <span className="seq">// CRISP × TRUEO PoC // </span>
        Encrypted-vote-resolved prediction markets — each market settles through a CRISP committee, no single oracle holds the key.
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
