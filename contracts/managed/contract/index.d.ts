import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  guardianSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  leafSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  guardianPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                             path: { sibling: { field: bigint
                                                                                              },
                                                                                     goes_left: boolean
                                                                                   }[]
                                                                           }];
  identitySecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  idSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  vetoSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  vetoSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  claimedNow(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  ephemeralSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  lineagePath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                            path: { sibling: { field: bigint
                                                                                             },
                                                                                    goes_left: boolean
                                                                                  }[]
                                                                          }];
}

export type ImpureCircuits<PS> = {
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array,
                 threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateGuardianSet(context: __compactRuntime.CircuitContext<PS>,
                    idCommit_0: Uint8Array,
                    newCtx_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>,
               idCommit_0: Uint8Array,
               ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  vetoRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeRecovery(context: __compactRuntime.CircuitContext<PS>,
                   rid_0: Uint8Array,
                   newIdCommit_0: Uint8Array,
                   newVetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveSuccession(context: __compactRuntime.CircuitContext<PS>,
                  idRoot_0: Uint8Array,
                  head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveHeadOwnership(context: __compactRuntime.CircuitContext<PS>,
                     idRoot_0: Uint8Array,
                     head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  hostGatedAction(context: __compactRuntime.CircuitContext<PS>,
                  rootIdCommit_0: Uint8Array,
                  currentIdCommit_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array,
                 threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateGuardianSet(context: __compactRuntime.CircuitContext<PS>,
                    idCommit_0: Uint8Array,
                    newCtx_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>,
               idCommit_0: Uint8Array,
               ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  vetoRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeRecovery(context: __compactRuntime.CircuitContext<PS>,
                   rid_0: Uint8Array,
                   newIdCommit_0: Uint8Array,
                   newVetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveSuccession(context: __compactRuntime.CircuitContext<PS>,
                  idRoot_0: Uint8Array,
                  head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveHeadOwnership(context: __compactRuntime.CircuitContext<PS>,
                     idRoot_0: Uint8Array,
                     head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  hostGatedAction(context: __compactRuntime.CircuitContext<PS>,
                  rootIdCommit_0: Uint8Array,
                  currentIdCommit_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  idCommitOf(secret_0: bigint, salt_0: Uint8Array): Uint8Array;
  vetoCommitOf(secret_0: bigint, salt_0: Uint8Array): Uint8Array;
  guardianLeafOf(secret_0: Uint8Array, ctx_0: Uint8Array, salt_0: Uint8Array): Uint8Array;
  recoveryIdOf(idCommit_0: Uint8Array, ephemeralPk_0: Uint8Array): Uint8Array;
  approvalNullifierOf(secret_0: Uint8Array,
                      idCommit_0: Uint8Array,
                      rid_0: Uint8Array): Uint8Array;
  vetoNullifierOf(secret_0: bigint, rid_0: Uint8Array): Uint8Array;
  lineageLeafOf(idRoot_0: Uint8Array, member_0: Uint8Array): Uint8Array;
  ephemeralPkOf(sk_0: Uint8Array): Uint8Array;
  openSlackSeconds(): bigint;
  recoveryDelaySeconds(): bigint;
  gateNullifierOf(secret_0: bigint, nonce_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  idCommitOf(context: __compactRuntime.CircuitContext<PS>,
             secret_0: bigint,
             salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  vetoCommitOf(context: __compactRuntime.CircuitContext<PS>,
               secret_0: bigint,
               salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  guardianLeafOf(context: __compactRuntime.CircuitContext<PS>,
                 secret_0: Uint8Array,
                 ctx_0: Uint8Array,
                 salt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  recoveryIdOf(context: __compactRuntime.CircuitContext<PS>,
               idCommit_0: Uint8Array,
               ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approvalNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                      secret_0: Uint8Array,
                      idCommit_0: Uint8Array,
                      rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  vetoNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: bigint,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  lineageLeafOf(context: __compactRuntime.CircuitContext<PS>,
                idRoot_0: Uint8Array,
                member_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  ephemeralPkOf(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openSlackSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  recoveryDelaySeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array,
                 threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotateGuardianSet(context: __compactRuntime.CircuitContext<PS>,
                    idCommit_0: Uint8Array,
                    newCtx_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>,
               idCommit_0: Uint8Array,
               ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  vetoRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  finalizeRecovery(context: __compactRuntime.CircuitContext<PS>,
                   rid_0: Uint8Array,
                   newIdCommit_0: Uint8Array,
                   newVetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveSuccession(context: __compactRuntime.CircuitContext<PS>,
                  idRoot_0: Uint8Array,
                  head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveHeadOwnership(context: __compactRuntime.CircuitContext<PS>,
                     idRoot_0: Uint8Array,
                     head_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  gateNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                  secret_0: bigint,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  hostGatedAction(context: __compactRuntime.CircuitContext<PS>,
                  rootIdCommit_0: Uint8Array,
                  currentIdCommit_0: Uint8Array,
                  nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  enrolled: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  thresholds: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  vetoCommits: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  guardians: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  idRoots: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  guardianCtx: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  usedGuardianCtx: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  recoveries: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { idCommit: Uint8Array,
                                 idRoot: Uint8Array,
                                 ctx: Uint8Array,
                                 ephemeralPk: Uint8Array,
                                 openedAtLo: bigint,
                                 openedAtHi: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { idCommit: Uint8Array,
  idRoot: Uint8Array,
  ctx: Uint8Array,
  ephemeralPk: Uint8Array,
  openedAtLo: bigint,
  openedAtHi: bigint
}]>
  };
  approvals: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { read(): bigint }
  };
  approvedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  vetoNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  killed: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  retiredIdentities: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  lineage: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly gateActions: bigint;
  gateNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
