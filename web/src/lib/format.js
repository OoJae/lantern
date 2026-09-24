export const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
export const short = (h) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);
export const toHex = (v) => (v instanceof Uint8Array ? hex(v) : typeof v === 'bigint' ? v.toString(16).padStart(64, '0') : String(v));

export const FIELD_LABEL = {
  identitySecret: 'identity secret',
  idSalt: 'identity salt',
  vetoSecret: 'veto secret',
  vetoSalt: 'veto salt',
  guardianSecret: 'guardian secret',
  leafSalt: 'leaf salt',
  ephemeralSk: 'device key',
};

export const LEDGER_LABEL = {
  enrolled: 'identity commitments', guardianLeaves: 'guardian leaves', recoveries: 'recoveries opened',
  approvals: 'approval nullifiers', vetoes: 'veto nullifiers', killed: 'vetoed recoveries',
  retired: 'retired commitments', lineage: 'lineage leaves', guardianSets: 'guardian sets', gateActions: 'DApp actions',
};

export const clockText = (seconds) => {
  const d = new Date(Number(seconds) * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};
