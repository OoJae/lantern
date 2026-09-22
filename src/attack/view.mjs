// What a chain observer has, and all the attacker ever receives: the public
// ledger and the contract's public derivation code. Frozen, and with no
// simulator, private state or witness anywhere in reach -- so a target that
// HOLDS cannot be holding because the attacker was denied something a real
// observer has.
export const observerView = (id, label, scheme, publicParams, ledger, pureCircuits) => Object.freeze({
  id, label, scheme,
  publicParams: Object.freeze(publicParams),
  ledger,
  pureCircuits,
});
