import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getSchnorrReduction(context: __compactRuntime.WitnessContext<Ledger, PS>,
                      challengeHash_0: bigint): [PS, [bigint, bigint]];
  claimedNow(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  snapshotPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                             path: { sibling: { field: bigint
                                                                                              },
                                                                                     goes_left: boolean
                                                                                   }[]
                                                                           }];
}

export type ImpureCircuits<PS> = {
  appendSnapshotLeaf(context: __compactRuntime.CircuitContext<PS>,
                     root_0: Uint8Array,
                     current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addCommitteeSlot(context: __compactRuntime.CircuitContext<PS>,
                   slot_0: bigint,
                   pkX_0: bigint,
                   pkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateCommittee(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requireCurrentOwnerAttested(context: __compactRuntime.CircuitContext<PS>,
                              epoch_0: bigint,
                              rootIdCommit_0: Uint8Array,
                              currentIdCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  appendSnapshotLeaf(context: __compactRuntime.CircuitContext<PS>,
                     root_0: Uint8Array,
                     current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addCommitteeSlot(context: __compactRuntime.CircuitContext<PS>,
                   slot_0: bigint,
                   pkX_0: bigint,
                   pkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateCommittee(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requireCurrentOwnerAttested(context: __compactRuntime.CircuitContext<PS>,
                              epoch_0: bigint,
                              rootIdCommit_0: Uint8Array,
                              currentIdCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  attestSlackSeconds(): bigint;
  maxStalenessSeconds(): bigint;
  attestDomain(): bigint;
  ownerLeafOf(root_0: Uint8Array, current_0: Uint8Array): Uint8Array;
  attestDigest(tag_0: bigint,
               gen_0: bigint,
               epoch_0: bigint,
               snapshotRoot_0: bigint): bigint[];
  attestNulOf(gen_0: bigint, epoch_0: bigint, slot_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  attestSlackSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  maxStalenessSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  attestDomain(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  ownerLeafOf(context: __compactRuntime.CircuitContext<PS>,
              root_0: Uint8Array,
              current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  attestDigest(context: __compactRuntime.CircuitContext<PS>,
               tag_0: bigint,
               gen_0: bigint,
               epoch_0: bigint,
               snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, bigint[]>;
  attestNulOf(context: __compactRuntime.CircuitContext<PS>,
              gen_0: bigint,
              epoch_0: bigint,
              slot_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  appendSnapshotLeaf(context: __compactRuntime.CircuitContext<PS>,
                     root_0: Uint8Array,
                     current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addCommitteeSlot(context: __compactRuntime.CircuitContext<PS>,
                   slot_0: bigint,
                   pkX_0: bigint,
                   pkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>, epoch_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateCommittee(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  requireCurrentOwnerAttested(context: __compactRuntime.CircuitContext<PS>,
                              epoch_0: bigint,
                              rootIdCommit_0: Uint8Array,
                              currentIdCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  committee: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { pkX: bigint, pkY: bigint, addedAtGen: bigint };
    [Symbol.iterator](): Iterator<[bigint, { pkX: bigint, pkY: bigint, addedAtGen: bigint }]>
  };
  readonly committeeGen: bigint;
  readonly slotCount: bigint;
  readonly quorum: bigint;
  readonly lanternTag: bigint;
  claimedRoot: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  attestVotes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { read(): bigint }
  };
  attestNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  attestedRoots: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  attestedAtHi: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  readonly latestEpoch: bigint;
  readonly gateActions: bigint;
  snapshot: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
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
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               tag_0: bigint,
               slots_0: bigint,
               q_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
