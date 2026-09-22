import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  guardianId(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  guardianPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                             path: { sibling: { field: bigint
                                                                                              },
                                                                                     goes_left: boolean
                                                                                   }[]
                                                                           }];
}

export type ImpureCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardianUnsalted(context: __compactRuntime.CircuitContext<PS>,
                      owner_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addGuardianDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                         owner_0: Uint8Array,
                         slot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveUnsalted(context: __compactRuntime.CircuitContext<PS>,
                  owner_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                     owner_0: Uint8Array,
                     slot_0: Uint8Array,
                     rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardianUnsalted(context: __compactRuntime.CircuitContext<PS>,
                      owner_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addGuardianDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                         owner_0: Uint8Array,
                         slot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveUnsalted(context: __compactRuntime.CircuitContext<PS>,
                  owner_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                     owner_0: Uint8Array,
                     slot_0: Uint8Array,
                     rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  THIS_CONTRACT_IS_DELIBERATELY_INSECURE(): bigint;
  unsaltedLeafOf(guardian_0: Uint8Array, owner_0: Uint8Array): Uint8Array;
  derivedSaltOf(owner_0: Uint8Array, slot_0: Uint8Array): Uint8Array;
  saltedLeafOf(guardian_0: Uint8Array, owner_0: Uint8Array, slot_0: Uint8Array): Uint8Array;
  approvalNullifierOf(guardian_0: Uint8Array,
                      owner_0: Uint8Array,
                      rid_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  THIS_CONTRACT_IS_DELIBERATELY_INSECURE(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  unsaltedLeafOf(context: __compactRuntime.CircuitContext<PS>,
                 guardian_0: Uint8Array,
                 owner_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  derivedSaltOf(context: __compactRuntime.CircuitContext<PS>,
                owner_0: Uint8Array,
                slot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  saltedLeafOf(context: __compactRuntime.CircuitContext<PS>,
               guardian_0: Uint8Array,
               owner_0: Uint8Array,
               slot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approvalNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                      guardian_0: Uint8Array,
                      owner_0: Uint8Array,
                      rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardianUnsalted(context: __compactRuntime.CircuitContext<PS>,
                      owner_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addGuardianDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                         owner_0: Uint8Array,
                         slot_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openRecovery(context: __compactRuntime.CircuitContext<PS>, rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveUnsalted(context: __compactRuntime.CircuitContext<PS>,
                  owner_0: Uint8Array,
                  rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approveDerivedSalt(context: __compactRuntime.CircuitContext<PS>,
                     owner_0: Uint8Array,
                     slot_0: Uint8Array,
                     rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
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
  guardians: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
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
