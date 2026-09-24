import { Link } from '../lib/router.jsx';
import { LanternMark } from '../App.jsx';

export default function Landing() {
  return (
    <section className="page landing">
      <div className="hero">
        <LanternMark className="hero-mark" />
        <p className="eyebrow">Social recovery for Midnight private state</p>
        <h1>Lose the device.<br />Keep the identity.</h1>
        <p className="lede">
          Lantern lets hidden guardians restore a lost Midnight identity secret, and proves it is the right one.
        </p>
        <div className="cta">
          <Link to="/demo" className="button primary">Watch a recovery</Link>
          <Link to="/attacks" className="button">Try to find the guardians</Link>
        </div>
      </div>

      <div className="facts">
        <article>
          <h2>No recovery by default</h2>
          <p>On Midnight, private state lives on one device. Midnight’s own security guide says it plainly:
            “You cannot recover a witness secret from the chain.” A wallet seed restores keys, not state.</p>
        </article>
        <article>
          <h2>Correct, not just authorised</h2>
          <p>Guardians approve a specific new device. After 72 hours, the device finalizes by proving the rebuilt
            secret opens the original commitment. A wrong secret — one tampered share — is refused.</p>
        </article>
        <article>
          <h2>The guardians stay hidden</h2>
          <p>Each guardian is a salted commitment in a Merkle tree. An approval leaves an opaque nullifier and adds
            one to a public count: how many approved, never who. An attacker holding the ledger and the real names
            still cannot confirm who they are.</p>
        </article>
        <article>
          <h2>Downstream apps keep working</h2>
          <p>A DApp stores one value, the identity root, and asks whether the caller is its current owner. The
            recovery retires the old secret there too, with nothing for the DApp to update.</p>
        </article>
      </div>
    </section>
  );
}
