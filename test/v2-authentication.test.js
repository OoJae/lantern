// v1's test/authentication.test.js, for v2: "nothing in Lantern trusts the fee
// payer". Every v2 circuit authenticates by a commitment opening (identity,
// veto, guardian leaf, device key), never by the caller's coin key, so a
// sponsor who pays for a recovering phone's transactions gains nothing. Proved
// statically, over the v2 source, the v1 modules it imports, and the generated
// module that actually runs.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const V2_DIR = 'contracts/v2';
const SOURCES = readdirSync(join(root, V2_DIR))
  .filter((f) => f.endsWith('.compact'))
  .map((f) => ({ f, text: readFileSync(join(root, V2_DIR, f), 'utf8') }));
const GENERATED = ['contracts/managed-lantern2/contract/index.js']
  .map((f) => ({ f, text: readFileSync(join(root, f), 'utf8') }));

const code = (text) => text.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

// The same list as v1's test.
const WALLET_BOUND = [
  'ownPublicKey', 'kernel.', 'mintShieldedToken', 'mintUnshieldedToken', 'sendShielded',
  'sendImmediateShielded', 'receiveShielded', 'sendUnshielded', 'receiveUnshielded',
  'mergeCoin', 'evolveNonce', 'shieldedBurnAddress', 'unshieldedBalance', 'nativeToken',
  'createZswapInput', 'createZswapOutput', 'ZswapCoinPublicKey', 'CoinInfo', 'QualifiedCoinInfo',
];

describe('v2: nothing trusts the fee payer', () => {
  it('scans every v2 contract source', () => {
    expect(SOURCES.map((s) => s.f).sort()).toEqual(['lantern2.compact']);
  });

  // The two v1 modules v2 imports are scanned too: they run inside v2's circuits.
  it('imports exactly the two shared v1 modules, and no contract source uses a wallet-bound primitive', () => {
    const imports = [...code(SOURCES[0].text).matchAll(/import\s+"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['../src/identity', '../src/ownergate']);
    const imported = imports.map((p) => ({ f: `${p}.compact`, text: readFileSync(join(root, V2_DIR, `${p}.compact`), 'utf8') }));
    const hits = [];
    for (const { f, text } of [...SOURCES, ...imported]) {
      for (const w of WALLET_BOUND) if (code(text).includes(w)) hits.push(`${f}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it('the scan would catch one (positive control)', () => {
    const planted = 'export circuit bad(): [] { assert(ownPublicKey() == x, "owner"); }';
    expect(WALLET_BOUND.filter((w) => code(planted).includes(w))).toEqual(['ownPublicKey']);
  });

  for (const { f, text } of GENERATED) {
    it(`${f} touches the coin key only in constructor boilerplate`, () => {
      const lines = text.split('\n').filter((l) => /coinPublicKey|ownPublicKey|[Ss]hielded|[Kk]ernel/.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('constructorContext_0.initialZswapLocalState.coinPublicKey');
    });
  }

  it('every v2 circuit authenticates by an opening or proves a public fact', () => {
    // A circuit that read no witness would authenticate nobody. Each one opens a
    // secret (identity, veto card, guardian leaf, device key) or, for
    // proveSuccession, proves a public fact from the lineage path.
    const src = code(SOURCES[0].text);
    const circuits = [...src.matchAll(/export circuit (\w+)\(/g)].map((m) => m[1]);
    expect(circuits.sort()).toEqual([
      'addGuardian', 'approveRecovery', 'checkIn', 'enrollIdentity', 'finalizeRecovery', 'hostGatedAction',
      'lockIdentity', 'openRecovery', 'proveHeadOwnership', 'proveSuccession', 'rotateGuardianSet',
      'unlockIdentity', 'vetoRecovery',
    ]);
    const WITNESSES = /identitySecret\(\)|vetoSecret\(\)|guardianSecret\(\)|ephemeralSk\(\)|lineagePath\(\)/;
    for (const c of circuits) {
      const start = src.indexOf(`export circuit ${c}(`);
      const next = src.indexOf('\nexport ', start + 1);
      const body = src.slice(start, next < 0 ? undefined : next);
      expect(WITNESSES.test(body), c).toBe(true);
    }
  });
});
