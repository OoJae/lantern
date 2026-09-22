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
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             snapshotRoot_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateVote(context: __compactRuntime.CircuitContext<PS>,
             targetSlot_0: bigint,
             newPkX_0: bigint,
             newPkY_0: bigint,
             voterSlot_0: bigint,
             voterPk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  requireCurrentOwnerAttested(context: __compactRuntime.CircuitContext<PS>,
                              epoch_0: bigint,
                              rootIdCommit_0: Uint8Array,
                              currentIdCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  appendSnapshotLeaf(context: __compactRuntime.CircuitContext<PS>,
                     root_0: Uint8Array,
                     current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             snapshotRoot_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateVote(context: __compactRuntime.CircuitContext<PS>,
             targetSlot_0: bigint,
             newPkX_0: bigint,
             newPkY_0: bigint,
             voterSlot_0: bigint,
             voterPk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  requireCurrentOwnerAttested(context: __compactRuntime.CircuitContext<PS>,
                              epoch_0: bigint,
                              rootIdCommit_0: Uint8Array,
                              currentIdCommit_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  attestSlackSeconds(): bigint;
  maxStalenessSeconds(): bigint;
  attestDomain(): bigint;
  rotateDomain(): bigint;
  ownerLeafOf(root_0: Uint8Array, current_0: Uint8Array): Uint8Array;
  attestDigest(tag_0: bigint,
               gen_0: bigint,
               epoch_0: bigint,
               snapshotRoot_0: bigint): bigint[];
  rotateDigest(tag_0: bigint,
               gen_0: bigint,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): bigint[];
  epochProposalOf(gen_0: bigint, epoch_0: bigint, root_0: bigint): Uint8Array;
  rotationProposalOf(gen_0: bigint,
                     targetSlot_0: bigint,
                     newPkX_0: bigint,
                     newPkY_0: bigint): Uint8Array;
  epochVoteNullifierOf(gen_0: bigint, epoch_0: bigint, slot_0: bigint): Uint8Array;
  rotationVoteNullifierOf(gen_0: bigint,
                          targetSlot_0: bigint,
                          voterSlot_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  attestSlackSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  maxStalenessSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  attestDomain(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  rotateDomain(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  ownerLeafOf(context: __compactRuntime.CircuitContext<PS>,
              root_0: Uint8Array,
              current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  attestDigest(context: __compactRuntime.CircuitContext<PS>,
               tag_0: bigint,
               gen_0: bigint,
               epoch_0: bigint,
               snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, bigint[]>;
  rotateDigest(context: __compactRuntime.CircuitContext<PS>,
               tag_0: bigint,
               gen_0: bigint,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, bigint[]>;
  epochProposalOf(context: __compactRuntime.CircuitContext<PS>,
                  gen_0: bigint,
                  epoch_0: bigint,
                  root_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotationProposalOf(context: __compactRuntime.CircuitContext<PS>,
                     gen_0: bigint,
                     targetSlot_0: bigint,
                     newPkX_0: bigint,
                     newPkY_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  epochVoteNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                       gen_0: bigint,
                       epoch_0: bigint,
                       slot_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  rotationVoteNullifierOf(context: __compactRuntime.CircuitContext<PS>,
                          gen_0: bigint,
                          targetSlot_0: bigint,
                          voterSlot_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  appendSnapshotLeaf(context: __compactRuntime.CircuitContext<PS>,
                     root_0: Uint8Array,
                     current_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  openEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestVote(context: __compactRuntime.CircuitContext<PS>,
             epoch_0: bigint,
             snapshotRoot_0: bigint,
             slot_0: bigint,
             pk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealEpoch(context: __compactRuntime.CircuitContext<PS>,
            epoch_0: bigint,
            snapshotRoot_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  openRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rotateVote(context: __compactRuntime.CircuitContext<PS>,
             targetSlot_0: bigint,
             newPkX_0: bigint,
             newPkY_0: bigint,
             voterSlot_0: bigint,
             voterPk_0: __compactRuntime.JubjubPoint,
             sig_0: { announcement: __compactRuntime.JubjubPoint,
                      response: bigint
                    }): __compactRuntime.CircuitResults<PS, []>;
  sealRotation(context: __compactRuntime.CircuitContext<PS>,
               targetSlot_0: bigint,
               newPkX_0: bigint,
               newPkY_0: bigint): __compactRuntime.CircuitResults<PS, []>;
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
  epochVotes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { read(): bigint }
  };
  rotationVotes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { read(): bigint }
  };
  voteNullifiers: {
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
  attestedAtLo: {
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
               q_0: bigint,
               k0x_0: bigint,
               k0y_0: bigint,
               k1x_0: bigint,
               k1y_0: bigint,
               k2x_0: bigint,
               k2y_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
