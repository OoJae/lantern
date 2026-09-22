import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              owner_0: Uint8Array,
              guardian_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>,
          owner_0: Uint8Array,
          guardian_0: Uint8Array,
          rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              owner_0: Uint8Array,
              guardian_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>,
          owner_0: Uint8Array,
          guardian_0: Uint8Array,
          rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  THIS_CONTRACT_IS_DELIBERATELY_INSECURE(): bigint;
}

export type Circuits<PS> = {
  THIS_CONTRACT_IS_DELIBERATELY_INSECURE(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  enroll(context: __compactRuntime.CircuitContext<PS>,
         owner_0: Uint8Array,
         threshold_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  addGuardian(context: __compactRuntime.CircuitContext<PS>,
              owner_0: Uint8Array,
              guardian_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>,
          owner_0: Uint8Array,
          guardian_0: Uint8Array,
          rid_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  owners: {
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
  guardianList: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { owner: Uint8Array, guardian: Uint8Array };
    [Symbol.iterator](): Iterator<[bigint, { owner: Uint8Array, guardian: Uint8Array }]>
  };
  readonly guardianCount: bigint;
  voteList: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { owner: Uint8Array,
                             guardian: Uint8Array,
                             rid: Uint8Array
                           };
    [Symbol.iterator](): Iterator<[bigint, { owner: Uint8Array, guardian: Uint8Array, rid: Uint8Array }]>
  };
  readonly voteCount: bigint;
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
