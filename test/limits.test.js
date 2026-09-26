// The frozen contracts' limits that SECURITY.md documents, pinned so the documentation stays true.
// Each test runs the behaviour a section describes. If one starts failing, the contract changed and
// the section it names must change with it.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { world, asGuardian, EPH_B, ephSkFor, ID_SECRET, ID_SALT } from './fixtures.js';
import { LanternSim, pureCircuits as P, bytes32, fieldOf } from './simulator.js';
import { HostSim, member, xy, SNAP, snapshotOf, ROOT, HEAD } from './host-fixtures.js';
import { dealShares, recoverFromShares } from '../src/identity.js';

describe('SECURITY.md §6.17: replacing the guardians does not replace the secret', () => {
  it('a rotation does not revoke shares: evicted guardians\' old shares still rebuild the live secret and act as the owner', () => {
    const { sim, id, guardians } = world({ n: 3, threshold: 2 });
    let seed = 1;
    const shares = dealShares(ID_SECRET, 3, 2, () => BigInt(++seed) * 0x1234567n);

    // The owner evicts the whole set with the veto card and adds two fresh guardians.
    sim.call('rotateGuardianSet', id, bytes32(4444));
    for (let i = 0; i < 2; i++) {
      sim.ps.guardianSecret = bytes32(300 + i);
      sim.ps.leafSalt = bytes32(400 + i);
      sim.call('addGuardian', id);
    }

    // Two evicted guardians pool their old shares: the live secret, not a retired one.
    const { identitySecret } = recoverFromShares([shares[0], shares[1]]);
    expect(identitySecret).toBe(ID_SECRET);
    sim.ps.identitySecret = identitySecret;
    sim.ps.idSalt = ID_SALT; // the fixtures use a fixed salt; the client derives it from the secret, so shares give it too
    sim.ps.lineagePath = sim.ledger.lineage.findPathForLeaf(P.lineageLeafOf(id, id));
    expect(() => sim.call('hostGatedAction', id, id, bytes32(77))).not.toThrow();
    expect(() => sim.call('proveHeadOwnership', id, id)).not.toThrow();
    sim.ps.ephemeralSk = ephSkFor(EPH_B);
    const rid = sim.call('openRecovery', id, EPH_B);

    // Only their tokens died.
    asGuardian(sim, guardians[0]);
    expect(() => sim.call('approveRecovery', id, rid)).toThrow(/does not bind/);
  });
});

describe('SECURITY.md §3: what separates the domains', () => {
  const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest('hex');
  const pad = (s, n) => { const b = Buffer.alloc(n); Buffer.from(s).copy(b); return b; };
  const le = (x) => { const b = Buffer.alloc(32); for (let i = 0; i < 32; i++, x >>= 8n) b[i] = Number(x & 255n); return b; };
  const hex = (u) => Buffer.from(u).toString('hex');

  it('a hash begins with its domain string, a commitment with its salt, and the two sets of lengths are disjoint', () => {
    const secret = fieldOf(7), salt = bytes32(8), s32 = bytes32(9), ctx = bytes32(10), ic = bytes32(11), rid = bytes32(12), eph = bytes32(13);
    const commitments = [
      [hex(P.idCommitOf(secret, salt)), [salt, pad('lantern:id:v1', 13), le(secret)]],
      [hex(P.vetoCommitOf(secret, salt)), [salt, pad('lantern:veto:v1', 15), le(secret)]],
      [hex(P.guardianLeafOf(s32, ctx, salt)), [salt, pad('lantern:guardian:v1', 19), s32, ctx]],
    ];
    const hashes = [
      [hex(P.recoveryIdOf(ic, eph)), [pad('lantern:rid:v1', 14), ic, eph]],
      [hex(P.approvalNullifierOf(s32, ic, rid)), [pad('lantern:approve:v1', 18), s32, ic, rid]],
      [hex(P.vetoNullifierOf(secret, rid)), [pad('lantern:vetonul:v1', 18), le(secret), rid]],
    ];
    const lengths = (rows) => rows.map(([out, parts]) => {
      expect(out).toBe(sha(...parts));
      return parts.reduce((n, p) => n + p.length, 0);
    });
    const c = lengths(commitments), h = lengths(hashes);
    expect(c).toEqual([77, 79, 115]);
    expect(h).toEqual([78, 114, 82]);
    expect(c.filter((n) => h.includes(n))).toEqual([]);
  });
});

describe('SECURITY.md §4.4 and §8: the attested host\'s committee', () => {
  it('at quorum 3, one lost key halts the host for good', () => {
    const h = new HostSim({ quorum: 3 });
    const root = SNAP.root;
    h.call('openEpoch', 0n, root);
    for (const i of [0, 1, 2]) h.vote(i, 0, root);
    h.call('sealEpoch', 0n, root);
    h.gate(0, ROOT, HEAD);

    // Slot 2's key is lost. The other two can neither replace it nor seal a new epoch.
    const fresh = member(9);
    const [nx, ny] = xy(fresh);
    h.call('openRotation', 2n, nx, ny);
    h.rotVote(0, 2, fresh);
    h.rotVote(1, 2, fresh);
    expect(() => h.call('sealRotation', 2n, nx, ny)).toThrow(/quorum not reached/);
    h.call('openEpoch', 1n, root);
    h.vote(0, 1, root);
    h.vote(1, 1, root);
    expect(() => h.call('sealEpoch', 1n, root)).toThrow(/quorum not reached/);
    h.advance(86_400);
    expect(() => h.gate(0, ROOT, HEAD)).toThrow(/stale/);
  });

  it('anyone can seal a voted snapshot late, and the epoch cannot take a new root', () => {
    const h = new HostSim({ quorum: 2 });
    const rOld = SNAP.root;
    const rNew = snapshotOf([{ root: ROOT, current: bytes32(4321) }]).root; // HEAD retired since
    h.call('openEpoch', 0n, rOld);
    h.vote(0, 0, rOld);
    h.vote(1, 0, rOld);
    // The committee's seal never lands; it rebuilds the snapshot, but epoch 0 is spoken for.
    h.call('openEpoch', 0n, rNew);
    expect(() => h.vote(0, 0, rNew)).toThrow(/already voted/);
    h.vote(2, 0, rNew);
    expect(() => h.call('sealEpoch', 0n, rNew)).toThrow(/quorum not reached/);
    // Five days later a stranger seals the old snapshot, and the retired owner passes from then.
    h.advance(5 * 86_400);
    h.call('sealEpoch', 0n, rOld);
    expect(() => h.gate(0, ROOT, HEAD)).not.toThrow();
  });
});

describe('SECURITY.md §6.8: a veto commitment nobody can open', () => {
  it('enrolment accepts it, and then no guardian can ever be added', () => {
    const sim = new LanternSim();
    const id = P.idCommitOf(sim.ps.identitySecret, sim.ps.idSalt);
    sim.call('enrollIdentity', id, P.vetoCommitOf(fieldOf(999), bytes32(998)), 2n);
    expect(() => sim.call('addGuardian', id)).toThrow(/requires the veto secret/);
    expect(() => sim.call('rotateGuardianSet', id, bytes32(5))).toThrow(/requires the veto secret/);
  });
});
