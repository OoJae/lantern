// Leak scanning for circuit proof data, with a POSITIVE CONTROL built in.
//
// A "the secret is absent from the public transcript" test is only meaningful
// if the scanner could have seen the secret at all. Lantern's first privacy
// tests searched for Field secrets as big-endian hex, but the runtime stores
// Field values LITTLE-endian, so the search could never match and the tests
// passed without testing anything. This module closes that hole: every secret
// is searched in every encoding the runtime or a serializer might use, and a
// scan FAILS unless each secret is first found on the private side of the
// same proof. Absence then means something.
//
// Portable (no Node APIs): the browser demo runs the same scanner.

/** The four parts of a circuit run's proof data, split by who can see them. */
export const PUBLIC_PARTS = Object.freeze(['input', 'output', 'publicTranscript']);
export const PRIVATE_PARTS = Object.freeze(['privateTranscriptOutputs']);

// Shorter needles match by accident in a large blob. Every Lantern secret is at
// least 64 bits; a shorter one is rejected rather than scanned weakly.
const MIN_HEX = 16;

const toHex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

function fieldBytesLE(x) {
  const out = [];
  for (let v = x; v > 0n; v >>= 8n) out.push(Number(v & 0xffn));
  return Uint8Array.from(out);
}

/** Every string form in which `secret` could appear in a flattened blob. */
export function encodingsOf(secret) {
  let forms;
  if (typeof secret === 'bigint') {
    if (secret < 0n) throw new Error('negative secrets are not scannable');
    const le = fieldBytesLE(secret);
    forms = [toHex(le), toHex(le.slice().reverse()), secret.toString(16), secret.toString(10)];
  } else if (secret instanceof Uint8Array) {
    forms = [toHex(secret), toHex(secret.slice().reverse())];
  } else {
    throw new Error(`cannot scan a secret of type ${typeof secret}`);
  }
  const hexForms = forms.slice(0, forms.length - (typeof secret === 'bigint' ? 1 : 0));
  if (hexForms.every((f) => f.length < MIN_HEX)) {
    throw new Error(`secret too short to scan reliably (${hexForms[0].length} hex chars)`);
  }
  return [...new Set(forms)].filter((f) => f.length >= MIN_HEX);
}

/**
 * Flatten any value the runtime produces into one searchable string. Bytes
 * become hex; bigints become hex AND decimal; every leaf is separated by '|'
 * so two adjacent values cannot combine into a false match.
 */
export function flatten(x) {
  const parts = [];
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (v instanceof Uint8Array) parts.push(toHex(v));
    else if (typeof v === 'bigint') parts.push(v.toString(16), v.toString(10));
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v instanceof Map) for (const [k, val] of v) { walk(k); walk(val); }
    else if (typeof v === 'object') for (const val of Object.values(v)) walk(val);
    parts.push('|');
  };
  walk(x);
  return parts.join('|');
}

const sideOf = (proofData, keys) => flatten(keys.map((k) => proofData?.[k]));

/**
 * Scan one circuit run. `secrets` maps a label to a bigint or Uint8Array.
 * Returns, per label, whether it was seen on the private side (the positive
 * control) and on the public side (the leak), and in which encoding.
 */
export function scanProofData(proofData, secrets) {
  if (!proofData) throw new Error('no proof data: the circuit has not run');
  const priv = sideOf(proofData, PRIVATE_PARTS);
  const pub = sideOf(proofData, PUBLIC_PARTS);
  const report = {};
  for (const [label, secret] of Object.entries(secrets)) {
    const forms = encodingsOf(secret);
    report[label] = {
      private: forms.some((f) => priv.includes(f)),
      public: forms.some((f) => pub.includes(f)),
      publicForm: forms.find((f) => pub.includes(f)) ?? null,
    };
  }
  return report;
}

/**
 * Throws unless every secret is (a) present on the private side -- so the
 * scanner demonstrably could see it -- and (b) absent from the public side.
 */
export function assertNoLeak(proofData, secrets) {
  const report = scanProofData(proofData, secrets);
  const unseen = Object.keys(report).filter((k) => !report[k].private);
  if (unseen.length) {
    throw new Error(`positive control failed: ${unseen.join(', ')} not found in the private transcript, `
      + 'so its absence from the public side would prove nothing');
  }
  const leaked = Object.keys(report).filter((k) => report[k].public);
  if (leaked.length) {
    throw new Error(`LEAK: ${leaked.map((k) => `${k} (as ${report[k].publicForm})`).join(', ')} `
      + 'appears in the public part of the proof');
  }
  return report;
}
