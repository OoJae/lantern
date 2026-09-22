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
}

export type ImpureCircuits<PS> = {
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  enrollIdentity(context: __compactRuntime.CircuitContext<PS>,
                 idCommit_0: Uint8Array,
                 vetoCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              idCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  approveRecovery(context: __compactRuntime.CircuitContext<PS>,
                  idCommit_0: Uint8Array,
                  ephemeralPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  guardians: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  approvedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  approvals: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { read(): bigint }
  };
  vetoCommits: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  enrolled: {
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
