import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(4294967295n, 4);

const _descriptor_1 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_2 = __compactRuntime.CompactTypeField;

const _descriptor_3 = __compactRuntime.CompactTypeBoolean;

const _descriptor_4 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_5 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_6 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_7 = __compactRuntime.CompactTypeJubjubPoint;

class _SchnorrSignature_0 {
  alignment() {
    return _descriptor_7.alignment().concat(_descriptor_2.alignment());
  }
  fromValue(value_0) {
    return {
      announcement: _descriptor_7.fromValue(value_0),
      response: _descriptor_2.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_7.toValue(value_0.announcement).concat(_descriptor_2.toValue(value_0.response));
  }
}

const _descriptor_8 = new _SchnorrSignature_0();

class _CommitteeSlot_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_0.alignment()));
  }
  fromValue(value_0) {
    return {
      pkX: _descriptor_2.fromValue(value_0),
      pkY: _descriptor_2.fromValue(value_0),
      addedAtGen: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.pkX).concat(_descriptor_2.toValue(value_0.pkY).concat(_descriptor_0.toValue(value_0.addedAtGen)));
  }
}

const _descriptor_9 = new _CommitteeSlot_0();

const _descriptor_10 = new __compactRuntime.CompactTypeVector(4, _descriptor_2);

class _MerkleTreeDigest_0 {
  alignment() {
    return _descriptor_2.alignment();
  }
  fromValue(value_0) {
    return {
      field: _descriptor_2.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.field);
  }
}

const _descriptor_11 = new _MerkleTreeDigest_0();

class _MerkleTreePathEntry_0 {
  alignment() {
    return _descriptor_11.alignment().concat(_descriptor_3.alignment());
  }
  fromValue(value_0) {
    return {
      sibling: _descriptor_11.fromValue(value_0),
      goes_left: _descriptor_3.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_11.toValue(value_0.sibling).concat(_descriptor_3.toValue(value_0.goes_left));
  }
}

const _descriptor_12 = new _MerkleTreePathEntry_0();

const _descriptor_13 = new __compactRuntime.CompactTypeVector(20, _descriptor_12);

class _MerkleTreePath_0 {
  alignment() {
    return _descriptor_5.alignment().concat(_descriptor_13.alignment());
  }
  fromValue(value_0) {
    return {
      leaf: _descriptor_5.fromValue(value_0),
      path: _descriptor_13.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_5.toValue(value_0.leaf).concat(_descriptor_13.toValue(value_0.path));
  }
}

const _descriptor_14 = new _MerkleTreePath_0();

const _descriptor_15 = new __compactRuntime.CompactTypeUnsignedInteger(127n, 1);

const _descriptor_16 = new __compactRuntime.CompactTypeUnsignedInteger(452312848583266388373324160190187140051835877600158453279131187530910662655n, 31);

class _tuple_0 {
  alignment() {
    return _descriptor_15.alignment().concat(_descriptor_16.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_15.fromValue(value_0),
      _descriptor_16.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_15.toValue(value_0[0]).concat(_descriptor_16.toValue(value_0[1]));
  }
}

const _descriptor_17 = new _tuple_0();

const _descriptor_18 = new __compactRuntime.CompactTypeBytes(6);

class _LeafPreimage_0 {
  alignment() {
    return _descriptor_18.alignment().concat(_descriptor_5.alignment());
  }
  fromValue(value_0) {
    return {
      domain_sep: _descriptor_18.fromValue(value_0),
      data: _descriptor_5.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_18.toValue(value_0.domain_sep).concat(_descriptor_5.toValue(value_0.data));
  }
}

const _descriptor_19 = new _LeafPreimage_0();

class _SchnorrHashInput_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_10.alignment()))));
  }
  fromValue(value_0) {
    return {
      ann_x: _descriptor_2.fromValue(value_0),
      ann_y: _descriptor_2.fromValue(value_0),
      pk_x: _descriptor_2.fromValue(value_0),
      pk_y: _descriptor_2.fromValue(value_0),
      msg: _descriptor_10.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.ann_x).concat(_descriptor_2.toValue(value_0.ann_y).concat(_descriptor_2.toValue(value_0.pk_x).concat(_descriptor_2.toValue(value_0.pk_y).concat(_descriptor_10.toValue(value_0.msg)))));
  }
}

const _descriptor_20 = new _SchnorrHashInput_0();

const _descriptor_21 = new __compactRuntime.CompactTypeVector(2, _descriptor_2);

const _descriptor_22 = new __compactRuntime.CompactTypeBytes(16);

class _OwnerPreimage_0 {
  alignment() {
    return _descriptor_22.alignment().concat(_descriptor_5.alignment().concat(_descriptor_5.alignment()));
  }
  fromValue(value_0) {
    return {
      domain: _descriptor_22.fromValue(value_0),
      root: _descriptor_5.fromValue(value_0),
      current: _descriptor_5.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_22.toValue(value_0.domain).concat(_descriptor_5.toValue(value_0.root).concat(_descriptor_5.toValue(value_0.current)));
  }
}

const _descriptor_23 = new _OwnerPreimage_0();

class _Either_0 {
  alignment() {
    return _descriptor_3.alignment().concat(_descriptor_5.alignment().concat(_descriptor_5.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_3.fromValue(value_0),
      left: _descriptor_5.fromValue(value_0),
      right: _descriptor_5.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.is_left).concat(_descriptor_5.toValue(value_0.left).concat(_descriptor_5.toValue(value_0.right)));
  }
}

const _descriptor_24 = new _Either_0();

const _descriptor_25 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_5.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_5.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_5.toValue(value_0.bytes);
  }
}

const _descriptor_26 = new _ContractAddress_0();

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    if (typeof(witnesses_0.getSchnorrReduction) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getSchnorrReduction');
    }
    if (typeof(witnesses_0.claimedNow) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named claimedNow');
    }
    if (typeof(witnesses_0.snapshotPath) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named snapshotPath');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      attestSlackSeconds(context, ...args_1) {
        return { result: pureCircuits.attestSlackSeconds(...args_1), context };
      },
      maxStalenessSeconds(context, ...args_1) {
        return { result: pureCircuits.maxStalenessSeconds(...args_1), context };
      },
      attestDomain(context, ...args_1) {
        return { result: pureCircuits.attestDomain(...args_1), context };
      },
      rotateDomain(context, ...args_1) {
        return { result: pureCircuits.rotateDomain(...args_1), context };
      },
      ownerLeafOf(context, ...args_1) {
        return { result: pureCircuits.ownerLeafOf(...args_1), context };
      },
      attestDigest(context, ...args_1) {
        return { result: pureCircuits.attestDigest(...args_1), context };
      },
      rotateDigest(context, ...args_1) {
        return { result: pureCircuits.rotateDigest(...args_1), context };
      },
      epochProposalOf(context, ...args_1) {
        return { result: pureCircuits.epochProposalOf(...args_1), context };
      },
      rotationProposalOf(context, ...args_1) {
        return { result: pureCircuits.rotationProposalOf(...args_1), context };
      },
      epochVoteNullifierOf(context, ...args_1) {
        return { result: pureCircuits.epochVoteNullifierOf(...args_1), context };
      },
      rotationVoteNullifierOf(context, ...args_1) {
        return { result: pureCircuits.rotationVoteNullifierOf(...args_1), context };
      },
      appendSnapshotLeaf: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`appendSnapshotLeaf: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const root_0 = args_1[1];
        const current_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('appendSnapshotLeaf',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 163 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(root_0.buffer instanceof ArrayBuffer && root_0.BYTES_PER_ELEMENT === 1 && root_0.length === 32)) {
          __compactRuntime.typeError('appendSnapshotLeaf',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 163 char 1',
                                     'Bytes<32>',
                                     root_0)
        }
        if (!(current_0.buffer instanceof ArrayBuffer && current_0.BYTES_PER_ELEMENT === 1 && current_0.length === 32)) {
          __compactRuntime.typeError('appendSnapshotLeaf',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 163 char 1',
                                     'Bytes<32>',
                                     current_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_5.toValue(root_0).concat(_descriptor_5.toValue(current_0)),
            alignment: _descriptor_5.alignment().concat(_descriptor_5.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._appendSnapshotLeaf_0(context,
                                                    partialProofData,
                                                    root_0,
                                                    current_0);
        partialProofData.output = { value: _descriptor_5.toValue(result_0), alignment: _descriptor_5.alignment() };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      openEpoch: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`openEpoch: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const epoch_0 = args_1[1];
        const snapshotRoot_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('openEpoch',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 186 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
          __compactRuntime.typeError('openEpoch',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 186 char 1',
                                     'Uint<0..4294967296>',
                                     epoch_0)
        }
        if (!(typeof(snapshotRoot_0) === 'bigint' && snapshotRoot_0 >= 0 && snapshotRoot_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('openEpoch',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 186 char 1',
                                     'Field',
                                     snapshotRoot_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(epoch_0).concat(_descriptor_2.toValue(snapshotRoot_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_2.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._openEpoch_0(context,
                                           partialProofData,
                                           epoch_0,
                                           snapshotRoot_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      attestVote: (...args_1) => {
        if (args_1.length !== 6) {
          throw new __compactRuntime.CompactError(`attestVote: expected 6 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const epoch_0 = args_1[1];
        const snapshotRoot_0 = args_1[2];
        const slot_0 = args_1[3];
        const pk_0 = args_1[4];
        const sig_0 = args_1[5];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('attestVote',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 194 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
          __compactRuntime.typeError('attestVote',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 194 char 1',
                                     'Uint<0..4294967296>',
                                     epoch_0)
        }
        if (!(typeof(snapshotRoot_0) === 'bigint' && snapshotRoot_0 >= 0 && snapshotRoot_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('attestVote',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 194 char 1',
                                     'Field',
                                     snapshotRoot_0)
        }
        if (!(typeof(slot_0) === 'bigint' && slot_0 >= 0n && slot_0 <= 255n)) {
          __compactRuntime.typeError('attestVote',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'host.compact line 194 char 1',
                                     'Uint<0..256>',
                                     slot_0)
        }
        if (!(typeof(sig_0) === 'object' && true && typeof(sig_0.response) === 'bigint' && sig_0.response >= 0 && sig_0.response <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('attestVote',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'host.compact line 194 char 1',
                                     'struct SchnorrSignature<announcement: Opaque<"JubjubPoint">, response: Field>',
                                     sig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(epoch_0).concat(_descriptor_2.toValue(snapshotRoot_0).concat(_descriptor_6.toValue(slot_0).concat(_descriptor_7.toValue(pk_0).concat(_descriptor_8.toValue(sig_0))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_2.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment()))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._attestVote_0(context,
                                            partialProofData,
                                            epoch_0,
                                            snapshotRoot_0,
                                            slot_0,
                                            pk_0,
                                            sig_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      sealEpoch: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`sealEpoch: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const epoch_0 = args_1[1];
        const snapshotRoot_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('sealEpoch',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 215 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
          __compactRuntime.typeError('sealEpoch',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 215 char 1',
                                     'Uint<0..4294967296>',
                                     epoch_0)
        }
        if (!(typeof(snapshotRoot_0) === 'bigint' && snapshotRoot_0 >= 0 && snapshotRoot_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('sealEpoch',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 215 char 1',
                                     'Field',
                                     snapshotRoot_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(epoch_0).concat(_descriptor_2.toValue(snapshotRoot_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_2.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._sealEpoch_0(context,
                                           partialProofData,
                                           epoch_0,
                                           snapshotRoot_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      openRotation: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`openRotation: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const targetSlot_0 = args_1[1];
        const newPkX_0 = args_1[2];
        const newPkY_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('openRotation',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 246 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
          __compactRuntime.typeError('openRotation',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 246 char 1',
                                     'Uint<0..256>',
                                     targetSlot_0)
        }
        if (!(typeof(newPkX_0) === 'bigint' && newPkX_0 >= 0 && newPkX_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('openRotation',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 246 char 1',
                                     'Field',
                                     newPkX_0)
        }
        if (!(typeof(newPkY_0) === 'bigint' && newPkY_0 >= 0 && newPkY_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('openRotation',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'host.compact line 246 char 1',
                                     'Field',
                                     newPkY_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(targetSlot_0).concat(_descriptor_2.toValue(newPkX_0).concat(_descriptor_2.toValue(newPkY_0))),
            alignment: _descriptor_6.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._openRotation_0(context,
                                              partialProofData,
                                              targetSlot_0,
                                              newPkX_0,
                                              newPkY_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      rotateVote: (...args_1) => {
        if (args_1.length !== 7) {
          throw new __compactRuntime.CompactError(`rotateVote: expected 7 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const targetSlot_0 = args_1[1];
        const newPkX_0 = args_1[2];
        const newPkY_0 = args_1[3];
        const voterSlot_0 = args_1[4];
        const voterPk_0 = args_1[5];
        const sig_0 = args_1[6];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'Uint<0..256>',
                                     targetSlot_0)
        }
        if (!(typeof(newPkX_0) === 'bigint' && newPkX_0 >= 0 && newPkX_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'Field',
                                     newPkX_0)
        }
        if (!(typeof(newPkY_0) === 'bigint' && newPkY_0 >= 0 && newPkY_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'Field',
                                     newPkY_0)
        }
        if (!(typeof(voterSlot_0) === 'bigint' && voterSlot_0 >= 0n && voterSlot_0 <= 255n)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'Uint<0..256>',
                                     voterSlot_0)
        }
        if (!(typeof(sig_0) === 'object' && true && typeof(sig_0.response) === 'bigint' && sig_0.response >= 0 && sig_0.response <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('rotateVote',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'host.compact line 253 char 1',
                                     'struct SchnorrSignature<announcement: Opaque<"JubjubPoint">, response: Field>',
                                     sig_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(targetSlot_0).concat(_descriptor_2.toValue(newPkX_0).concat(_descriptor_2.toValue(newPkY_0).concat(_descriptor_6.toValue(voterSlot_0).concat(_descriptor_7.toValue(voterPk_0).concat(_descriptor_8.toValue(sig_0)))))),
            alignment: _descriptor_6.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment())))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._rotateVote_0(context,
                                            partialProofData,
                                            targetSlot_0,
                                            newPkX_0,
                                            newPkY_0,
                                            voterSlot_0,
                                            voterPk_0,
                                            sig_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      sealRotation: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`sealRotation: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const targetSlot_0 = args_1[1];
        const newPkX_0 = args_1[2];
        const newPkY_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('sealRotation',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 274 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
          __compactRuntime.typeError('sealRotation',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 274 char 1',
                                     'Uint<0..256>',
                                     targetSlot_0)
        }
        if (!(typeof(newPkX_0) === 'bigint' && newPkX_0 >= 0 && newPkX_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('sealRotation',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 274 char 1',
                                     'Field',
                                     newPkX_0)
        }
        if (!(typeof(newPkY_0) === 'bigint' && newPkY_0 >= 0 && newPkY_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('sealRotation',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'host.compact line 274 char 1',
                                     'Field',
                                     newPkY_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(targetSlot_0).concat(_descriptor_2.toValue(newPkX_0).concat(_descriptor_2.toValue(newPkY_0))),
            alignment: _descriptor_6.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._sealRotation_0(context,
                                              partialProofData,
                                              targetSlot_0,
                                              newPkX_0,
                                              newPkY_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requireCurrentOwnerAttested: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`requireCurrentOwnerAttested: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const epoch_0 = args_1[1];
        const rootIdCommit_0 = args_1[2];
        const currentIdCommit_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requireCurrentOwnerAttested',
                                     'argument 1 (as invoked from Typescript)',
                                     'host.compact line 291 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
          __compactRuntime.typeError('requireCurrentOwnerAttested',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'host.compact line 291 char 1',
                                     'Uint<0..4294967296>',
                                     epoch_0)
        }
        if (!(rootIdCommit_0.buffer instanceof ArrayBuffer && rootIdCommit_0.BYTES_PER_ELEMENT === 1 && rootIdCommit_0.length === 32)) {
          __compactRuntime.typeError('requireCurrentOwnerAttested',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'host.compact line 291 char 1',
                                     'Bytes<32>',
                                     rootIdCommit_0)
        }
        if (!(currentIdCommit_0.buffer instanceof ArrayBuffer && currentIdCommit_0.BYTES_PER_ELEMENT === 1 && currentIdCommit_0.length === 32)) {
          __compactRuntime.typeError('requireCurrentOwnerAttested',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'host.compact line 291 char 1',
                                     'Bytes<32>',
                                     currentIdCommit_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(epoch_0).concat(_descriptor_5.toValue(rootIdCommit_0).concat(_descriptor_5.toValue(currentIdCommit_0))),
            alignment: _descriptor_0.alignment().concat(_descriptor_5.alignment().concat(_descriptor_5.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requireCurrentOwnerAttested_0(context,
                                                             partialProofData,
                                                             epoch_0,
                                                             rootIdCommit_0,
                                                             currentIdCommit_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      appendSnapshotLeaf: this.circuits.appendSnapshotLeaf,
      openEpoch: this.circuits.openEpoch,
      attestVote: this.circuits.attestVote,
      sealEpoch: this.circuits.sealEpoch,
      openRotation: this.circuits.openRotation,
      rotateVote: this.circuits.rotateVote,
      sealRotation: this.circuits.sealRotation,
      requireCurrentOwnerAttested: this.circuits.requireCurrentOwnerAttested
    };
    this.provableCircuits = {
      appendSnapshotLeaf: this.circuits.appendSnapshotLeaf,
      openEpoch: this.circuits.openEpoch,
      attestVote: this.circuits.attestVote,
      sealEpoch: this.circuits.sealEpoch,
      openRotation: this.circuits.openRotation,
      rotateVote: this.circuits.rotateVote,
      sealRotation: this.circuits.sealRotation,
      requireCurrentOwnerAttested: this.circuits.requireCurrentOwnerAttested
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 9) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 9 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    const tag_0 = args_0[1];
    const q_0 = args_0[2];
    const k0x_0 = args_0[3];
    const k0y_0 = args_0[4];
    const k1x_0 = args_0[5];
    const k1y_0 = args_0[6];
    const k2x_0 = args_0[7];
    const k2y_0 = args_0[8];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!(typeof(tag_0) === 'bigint' && tag_0 >= 0 && tag_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 1 (argument 2 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 tag_0)
    }
    if (!(typeof(q_0) === 'bigint' && q_0 >= 0n && q_0 <= 255n)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 2 (argument 3 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Uint<0..256>',
                                 q_0)
    }
    if (!(typeof(k0x_0) === 'bigint' && k0x_0 >= 0 && k0x_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 3 (argument 4 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k0x_0)
    }
    if (!(typeof(k0y_0) === 'bigint' && k0y_0 >= 0 && k0y_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 4 (argument 5 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k0y_0)
    }
    if (!(typeof(k1x_0) === 'bigint' && k1x_0 >= 0 && k1x_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 5 (argument 6 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k1x_0)
    }
    if (!(typeof(k1y_0) === 'bigint' && k1y_0 >= 0 && k1y_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 6 (argument 7 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k1y_0)
    }
    if (!(typeof(k2x_0) === 'bigint' && k2x_0 >= 0 && k2x_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 7 (argument 8 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k2x_0)
    }
    if (!(typeof(k2y_0) === 'bigint' && k2y_0 >= 0 && k2y_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 8 (argument 9 as invoked from Typescript)',
                                 'host.compact line 81 char 1',
                                 'Field',
                                 k2y_0)
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('appendSnapshotLeaf', new __compactRuntime.ContractOperation());
    state_0.setOperation('openEpoch', new __compactRuntime.ContractOperation());
    state_0.setOperation('attestVote', new __compactRuntime.ContractOperation());
    state_0.setOperation('sealEpoch', new __compactRuntime.ContractOperation());
    state_0.setOperation('openRotation', new __compactRuntime.ContractOperation());
    state_0.setOperation('rotateVote', new __compactRuntime.ContractOperation());
    state_0.setOperation('sealRotation', new __compactRuntime.ContractOperation());
    state_0.setOperation('requireCurrentOwnerAttested', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(1n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(0n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(0n),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(5n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(6n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(7n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(8n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(9n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(10n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(11n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(12n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newBoundedMerkleTree(
                                                                       new __compactRuntime.StateBoundedMerkleTree(20)
                                                                     )).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                        alignment: _descriptor_1.alignment() })).arrayPush(__compactRuntime.StateValue.newMap(
                                                                                                                                                                             new __compactRuntime.StateMap()
                                                                                                                                                                           ))
                                                          .encode() } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(2n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: true, n: 2 } },
                                       { ins: { cached: false, n: 1 } }]);
    let t_0, t_1;
    __compactRuntime.assert((t_1 = q_0, t_1 >= 2n) && (t_0 = q_0, t_0 <= 3n),
                            'quorum must be 2 or 3 of 3');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(4n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(tag_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = 3n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(2n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(tmp_0),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(3n),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(q_0),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_1 = 0n;
    const tmp_2 = { pkX: k0x_0, pkY: k0y_0, addedAtGen: 0n };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(tmp_1),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_9.toValue(tmp_2),
                                                                                              alignment: _descriptor_9.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_3 = 1n;
    const tmp_4 = { pkX: k1x_0, pkY: k1y_0, addedAtGen: 0n };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(tmp_3),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_9.toValue(tmp_4),
                                                                                              alignment: _descriptor_9.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_5 = 2n;
    const tmp_6 = { pkX: k2x_0, pkY: k2y_0, addedAtGen: 0n };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(tmp_5),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_9.toValue(tmp_6),
                                                                                              alignment: _descriptor_9.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _merkleTreePathRoot_0(path_0) {
    return { field:
               this._folder_0((...args_0) =>
                                this._merkleTreePathEntryRoot_0(...args_0),
                              this._degradeToTransient_0(this._persistentHash_0({ domain_sep:
                                                                                    new Uint8Array([109, 100, 110, 58, 108, 104]),
                                                                                  data:
                                                                                    path_0.leaf })),
                              path_0.path) };
  }
  _merkleTreePathEntryRoot_0(recursiveDigest_0, entry_0) {
    const left_0 = entry_0.goes_left ? recursiveDigest_0 : entry_0.sibling.field;
    const right_0 = entry_0.goes_left ?
                    entry_0.sibling.field :
                    recursiveDigest_0;
    return this._transientHash_3([left_0, right_0]);
  }
  _blockTimeLt_0(context, partialProofData, time_0) {
    return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                     partialProofData,
                                                                     [
                                                                      { dup: { n: 2 } },
                                                                      { idx: { cached: true,
                                                                               pushPath: false,
                                                                               path: [
                                                                                      { tag: 'value',
                                                                                        value: { value: _descriptor_6.toValue(2n),
                                                                                                 alignment: _descriptor_6.alignment() } }] } },
                                                                      { push: { storage: false,
                                                                                value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(time_0),
                                                                                                                             alignment: _descriptor_1.alignment() }).encode() } },
                                                                      'lt',
                                                                      { popeq: { cached: true,
                                                                                 result: undefined } }]).value);
  }
  _blockTimeGte_0(context, partialProofData, time_0) {
    return !this._blockTimeLt_0(context, partialProofData, time_0);
  }
  _transientHash_0(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_23, value_0);
    return result_0;
  }
  _transientHash_1(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_10, value_0);
    return result_0;
  }
  _transientHash_2(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_20, value_0);
    return result_0;
  }
  _transientHash_3(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_21, value_0);
    return result_0;
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_19, value_0);
    return result_0;
  }
  _degradeToTransient_0(x_0) {
    const result_0 = __compactRuntime.degradeToTransient(x_0);
    return result_0;
  }
  _upgradeFromTransient_0(x_0) {
    const result_0 = __compactRuntime.upgradeFromTransient(x_0);
    return result_0;
  }
  _jubjubPointX_0(np_0) {
    const result_0 = __compactRuntime.jubjubPointX(np_0);
    return result_0;
  }
  _jubjubPointY_0(np_0) {
    const result_0 = __compactRuntime.jubjubPointY(np_0);
    return result_0;
  }
  _ecAdd_0(a_0, b_0) {
    const result_0 = __compactRuntime.ecAdd(a_0, b_0);
    return result_0;
  }
  _ecMul_0(a_0, b_0) {
    const result_0 = __compactRuntime.ecMul(a_0, b_0);
    return result_0;
  }
  _ecMulGenerator_0(b_0) {
    const result_0 = __compactRuntime.ecMulGenerator(b_0);
    return result_0;
  }
  _getSchnorrReduction_0(context, partialProofData, challengeHash_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getSchnorrReduction(witnessContext_0,
                                                                              challengeHash_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 2  && typeof(result_0[0]) === 'bigint' && result_0[0] >= 0n && result_0[0] <= 127n && typeof(result_0[1]) === 'bigint' && result_0[1] >= 0n && result_0[1] <= 452312848583266388373324160190187140051835877600158453279131187530910662655n)) {
      __compactRuntime.typeError('getSchnorrReduction',
                                 'return value',
                                 'schnorr.compact line 32 char 3',
                                 '[Uint<0..128>, Uint<0..452312848583266388373324160190187140051835877600158453279131187530910662656>]',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_17.toValue(result_0),
      alignment: _descriptor_17.alignment()
    });
    return result_0;
  }
  _schnorrVerify_0(context, partialProofData, msg_0, signature_0, pk_0) {
    const __compact_pattern_tmp2_0 = signature_0;
    const announcement_0 = __compact_pattern_tmp2_0.announcement;
    const response_0 = __compact_pattern_tmp2_0.response;
    const cFull_0 = this._transientHash_2({ ann_x:
                                              this._jubjubPointX_0(announcement_0),
                                            ann_y:
                                              this._jubjubPointY_0(announcement_0),
                                            pk_x: this._jubjubPointX_0(pk_0),
                                            pk_y: this._jubjubPointY_0(pk_0),
                                            msg: msg_0 });
    const TWO_248_0 = 452312848583266388373324160190187140051835877600158453279131187530910662656n;
    const __compact_pattern_tmp1_0 = this._getSchnorrReduction_0(context,
                                                                 partialProofData,
                                                                 cFull_0);
    const q_0 = __compact_pattern_tmp1_0[0];
    const cTruncated_0 = __compact_pattern_tmp1_0[1];
    let t_0;
    __compactRuntime.assert((t_0 = q_0, t_0 < 116n),
                            'Schnorr quotient out of range');
    __compactRuntime.assert(__compactRuntime.addField(__compactRuntime.mulField(q_0,
                                                                                TWO_248_0),
                                                      cTruncated_0)
                            ===
                            cFull_0,
                            'Invalid challenge reduction');
    const c_0 = cTruncated_0;
    const lhs_0 = this._ecMulGenerator_0(response_0);
    const rhs_0 = this._ecAdd_0(announcement_0, this._ecMul_0(pk_0, c_0));
    __compactRuntime.assert(this._jubjubPointX_0(lhs_0)
                            ===
                            this._jubjubPointX_0(rhs_0)
                            &&
                            this._jubjubPointY_0(lhs_0)
                            ===
                            this._jubjubPointY_0(rhs_0),
                            'Invalid Jubjub Schnorr signature');
    return [];
  }
  _schnorrVerifyDigest_0(context, partialProofData, digest_0, signature_0, pk_0)
  {
    this._schnorrVerify_0(context, partialProofData, digest_0, signature_0, pk_0);
    return [];
  }
  _claimedNow_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.claimedNow(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'bigint' && result_0 >= 0n && result_0 <= 18446744073709551615n)) {
      __compactRuntime.typeError('claimedNow',
                                 'return value',
                                 'host.compact line 94 char 1',
                                 'Uint<0..18446744073709551616>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_1.toValue(result_0),
      alignment: _descriptor_1.alignment()
    });
    return result_0;
  }
  _snapshotPath_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.snapshotPath(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(typeof(result_0) === 'object' && result_0.leaf.buffer instanceof ArrayBuffer && result_0.leaf.BYTES_PER_ELEMENT === 1 && result_0.leaf.length === 32 && Array.isArray(result_0.path) && result_0.path.length === 20 && result_0.path.every((t) => typeof(t) === 'object' && typeof(t.sibling) === 'object' && typeof(t.sibling.field) === 'bigint' && t.sibling.field >= 0 && t.sibling.field <= __compactRuntime.MAX_FIELD && typeof(t.goes_left) === 'boolean'))) {
      __compactRuntime.typeError('snapshotPath',
                                 'return value',
                                 'host.compact line 95 char 1',
                                 'struct MerkleTreePath<leaf: Bytes<32>, path: Vector<20, struct MerkleTreePathEntry<sibling: struct MerkleTreeDigest<field: Field>, goes_left: Boolean>>>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_14.toValue(result_0),
      alignment: _descriptor_14.alignment()
    });
    return result_0;
  }
  _attestSlackSeconds_0() { return 600n; }
  _maxStalenessSeconds_0() { return 86400n; }
  _attestDomain_0() { return 36880004256503902710944505089088797963825n; }
  _rotateDomain_0() { return 36880004256503902711257739445977667499569n; }
  _epochPropDomain_0() { return 144062516626968369964914071974161577521n; }
  _epochVoteDomain_0() { return 144062516626968369964915760896985953841n; }
  _rotPropDomain_0() { return 144062516626968369965850824046863349297n; }
  _rotVoteDomain_0() { return 144062516626968369965852509619479017009n; }
  _pack_0(hi_0, lo_0) {
    return __compactRuntime.addField(__compactRuntime.mulField(hi_0, 4294967296n),
                                     lo_0);
  }
  _idOf_0(v_0) {
    return this._upgradeFromTransient_0(this._transientHash_1(v_0));
  }
  _ownerLeafOf_0(root_0, current_0) {
    return this._upgradeFromTransient_0(this._transientHash_0({ domain:
                                                                  new Uint8Array([108, 97, 110, 116, 101, 114, 110, 58, 111, 119, 110, 101, 114, 58, 118, 49]),
                                                                root: root_0,
                                                                current:
                                                                  current_0 }));
  }
  _attestDigest_0(tag_0, gen_0, epoch_0, snapshotRoot_0) {
    return [this._attestDomain_0(),
            tag_0,
            this._pack_0(gen_0, epoch_0),
            snapshotRoot_0];
  }
  _rotateDigest_0(tag_0, gen_0, targetSlot_0, newPkX_0, newPkY_0) {
    return [this._rotateDomain_0(),
            tag_0,
            this._pack_0(gen_0, targetSlot_0),
            this._transientHash_3([newPkX_0, newPkY_0])];
  }
  _epochProposalOf_0(gen_0, epoch_0, root_0) {
    return this._idOf_0([this._epochPropDomain_0(), gen_0, epoch_0, root_0]);
  }
  _rotationProposalOf_0(gen_0, targetSlot_0, newPkX_0, newPkY_0) {
    return this._idOf_0([this._rotPropDomain_0(),
                         this._pack_0(gen_0, targetSlot_0),
                         newPkX_0,
                         newPkY_0]);
  }
  _epochVoteNullifierOf_0(gen_0, epoch_0, slot_0) {
    return this._idOf_0([this._epochVoteDomain_0(), gen_0, epoch_0, slot_0]);
  }
  _rotationVoteNullifierOf_0(gen_0, targetSlot_0, voterSlot_0) {
    return this._idOf_0([this._rotVoteDomain_0(),
                         gen_0,
                         targetSlot_0,
                         voterSlot_0]);
  }
  _appendSnapshotLeaf_0(context, partialProofData, root_0, current_0) {
    const leaf_0 = this._ownerLeafOf_0(root_0, current_0);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(12n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell(__compactRuntime.leafHash(
                                                                                              { value: _descriptor_5.toValue(leaf_0),
                                                                                                alignment: _descriptor_5.alignment() }
                                                                                            )).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: 1 } },
                                       { ins: { cached: true, n: 1 } },
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(2n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { dup: { n: 2 } },
                                       { idx: { cached: false,
                                                pushPath: false,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       'root',
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 2 } }]);
    return leaf_0;
  }
  _requireCommitteeKey_0(context, partialProofData, slot_0, pk_0) {
    let t_0;
    __compactRuntime.assert((t_0 = slot_0,
                             t_0
                             <
                             _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { popeq: { cached: false,
                                                                                                   result: undefined } }]).value)),
                            'slot out of range');
    const c_0 = _descriptor_9.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_6.toValue(0n),
                                                                                                      alignment: _descriptor_6.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_6.toValue(slot_0),
                                                                                                      alignment: _descriptor_6.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value);
    __compactRuntime.assert(this._jubjubPointX_0(pk_0) === c_0.pkX
                            &&
                            this._jubjubPointY_0(pk_0) === c_0.pkY,
                            'public key does not match this committee slot');
    return [];
  }
  _openEpoch_0(context, partialProofData, epoch_0, snapshotRoot_0) {
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(8n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'epoch already sealed');
    const prop_0 = this._epochProposalOf_0(((t1) => {
                                             if (t1 > 4294967295n) {
                                               throw new __compactRuntime.CompactError('host.compact line 188 char 32: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                                             }
                                             return t1;
                                           })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                        partialProofData,
                                                                                                        [
                                                                                                         { dup: { n: 0 } },
                                                                                                         { idx: { cached: false,
                                                                                                                  pushPath: false,
                                                                                                                  path: [
                                                                                                                         { tag: 'value',
                                                                                                                           value: { value: _descriptor_6.toValue(1n),
                                                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                                                         { popeq: { cached: true,
                                                                                                                    result: undefined } }]).value)),
                                           epoch_0,
                                           snapshotRoot_0);
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(5n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                               alignment: _descriptor_5.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'proposal already open');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(5n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _attestVote_0(context,
                partialProofData,
                epoch_0,
                snapshotRoot_0,
                slot_0,
                pk_0,
                sig_0)
  {
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(8n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'epoch already sealed');
    const gen_0 = ((t1) => {
                    if (t1 > 4294967295n) {
                      throw new __compactRuntime.CompactError('host.compact line 202 char 15: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                    }
                    return t1;
                  })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_6.toValue(1n),
                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                { popeq: { cached: true,
                                                                                           result: undefined } }]).value));
    const prop_0 = this._epochProposalOf_0(gen_0, epoch_0, snapshotRoot_0);
    __compactRuntime.assert(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(5n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'proposal not open');
    this._requireCommitteeKey_0(context, partialProofData, slot_0, pk_0);
    this._schnorrVerifyDigest_0(context,
                                partialProofData,
                                this._attestDigest_0(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                               partialProofData,
                                                                                                               [
                                                                                                                { dup: { n: 0 } },
                                                                                                                { idx: { cached: false,
                                                                                                                         pushPath: false,
                                                                                                                         path: [
                                                                                                                                { tag: 'value',
                                                                                                                                  value: { value: _descriptor_6.toValue(4n),
                                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                                { popeq: { cached: false,
                                                                                                                           result: undefined } }]).value),
                                                     gen_0,
                                                     epoch_0,
                                                     snapshotRoot_0),
                                sig_0,
                                pk_0);
    const nul_0 = this._epochVoteNullifierOf_0(gen_0, epoch_0, slot_0);
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(7n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(nul_0),
                                                                                                                                               alignment: _descriptor_5.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'slot already voted this epoch');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(7n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(nul_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(5n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_5.toValue(prop_0),
                                                                  alignment: _descriptor_5.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_0),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _sealEpoch_0(context, partialProofData, epoch_0, snapshotRoot_0) {
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(8n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'epoch already sealed');
    __compactRuntime.assert(this._equal_0(epoch_0,
                                          ((t1) => {
                                            if (t1 > 4294967295n) {
                                              throw new __compactRuntime.CompactError('host.compact line 220 char 29: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                                            }
                                            return t1;
                                          })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                       partialProofData,
                                                                                                       [
                                                                                                        { dup: { n: 0 } },
                                                                                                        { idx: { cached: false,
                                                                                                                 pushPath: false,
                                                                                                                 path: [
                                                                                                                        { tag: 'value',
                                                                                                                          value: { value: _descriptor_6.toValue(10n),
                                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                                        { popeq: { cached: true,
                                                                                                                   result: undefined } }]).value))),
                            'epochs must be sealed in order');
    const prop_0 = this._epochProposalOf_0(((t1) => {
                                             if (t1 > 4294967295n) {
                                               throw new __compactRuntime.CompactError('host.compact line 222 char 32: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                                             }
                                             return t1;
                                           })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                        partialProofData,
                                                                                                        [
                                                                                                         { dup: { n: 0 } },
                                                                                                         { idx: { cached: false,
                                                                                                                  pushPath: false,
                                                                                                                  path: [
                                                                                                                         { tag: 'value',
                                                                                                                           value: { value: _descriptor_6.toValue(1n),
                                                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                                                         { popeq: { cached: true,
                                                                                                                    result: undefined } }]).value)),
                                           epoch_0,
                                           snapshotRoot_0);
    __compactRuntime.assert(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(5n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'proposal not open');
    let tmp_0;
    __compactRuntime.assert(!(tmp_0 = _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                partialProofData,
                                                                                                [
                                                                                                 { dup: { n: 0 } },
                                                                                                 { idx: { cached: false,
                                                                                                          pushPath: false,
                                                                                                          path: [
                                                                                                                 { tag: 'value',
                                                                                                                   value: { value: _descriptor_6.toValue(3n),
                                                                                                                            alignment: _descriptor_6.alignment() } }] } },
                                                                                                 { popeq: { cached: false,
                                                                                                            result: undefined } }]).value),
                              _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_6.toValue(5n),
                                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_5.toValue(prop_0),
                                                                                                                    alignment: _descriptor_5.alignment() } }] } },
                                                                                         { push: { storage: false,
                                                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                                                                         'lt',
                                                                                         { popeq: { cached: true,
                                                                                                    result: undefined } }]).value)),
                            'quorum not reached');
    const lo_0 = this._claimedNow_0(context, partialProofData);
    const hi_0 = ((t1) => {
                   if (t1 > 18446744073709551615n) {
                     throw new __compactRuntime.CompactError('host.compact line 229 char 14: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                   }
                   return t1;
                 })(lo_0 + this._attestSlackSeconds_0());
    __compactRuntime.assert(this._blockTimeGte_0(context, partialProofData, lo_0),
                            'claimed time is in the future');
    __compactRuntime.assert(this._blockTimeLt_0(context, partialProofData, hi_0),
                            'claimed time is too far in the past');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(8n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(snapshotRoot_0),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(9n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(lo_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(10n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_1),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _openRotation_0(context, partialProofData, targetSlot_0, newPkX_0, newPkY_0) {
    let t_0;
    __compactRuntime.assert((t_0 = targetSlot_0,
                             t_0
                             <
                             _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { popeq: { cached: false,
                                                                                                   result: undefined } }]).value)),
                            'slot out of range');
    const prop_0 = this._rotationProposalOf_0(((t1) => {
                                                if (t1 > 4294967295n) {
                                                  throw new __compactRuntime.CompactError('host.compact line 248 char 35: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                                                }
                                                return t1;
                                              })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                           partialProofData,
                                                                                                           [
                                                                                                            { dup: { n: 0 } },
                                                                                                            { idx: { cached: false,
                                                                                                                     pushPath: false,
                                                                                                                     path: [
                                                                                                                            { tag: 'value',
                                                                                                                              value: { value: _descriptor_6.toValue(1n),
                                                                                                                                       alignment: _descriptor_6.alignment() } }] } },
                                                                                                            { popeq: { cached: true,
                                                                                                                       result: undefined } }]).value)),
                                              targetSlot_0,
                                              newPkX_0,
                                              newPkY_0);
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(6n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                               alignment: _descriptor_5.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'rotation already proposed');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(6n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _rotateVote_0(context,
                partialProofData,
                targetSlot_0,
                newPkX_0,
                newPkY_0,
                voterSlot_0,
                voterPk_0,
                sig_0)
  {
    const gen_0 = ((t1) => {
                    if (t1 > 4294967295n) {
                      throw new __compactRuntime.CompactError('host.compact line 261 char 15: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                    }
                    return t1;
                  })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_6.toValue(1n),
                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                { popeq: { cached: true,
                                                                                           result: undefined } }]).value));
    const prop_0 = this._rotationProposalOf_0(gen_0,
                                              targetSlot_0,
                                              newPkX_0,
                                              newPkY_0);
    __compactRuntime.assert(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'rotation not proposed');
    this._requireCommitteeKey_0(context,
                                partialProofData,
                                voterSlot_0,
                                voterPk_0);
    this._schnorrVerifyDigest_0(context,
                                partialProofData,
                                this._rotateDigest_0(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                               partialProofData,
                                                                                                               [
                                                                                                                { dup: { n: 0 } },
                                                                                                                { idx: { cached: false,
                                                                                                                         pushPath: false,
                                                                                                                         path: [
                                                                                                                                { tag: 'value',
                                                                                                                                  value: { value: _descriptor_6.toValue(4n),
                                                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                                                { popeq: { cached: false,
                                                                                                                           result: undefined } }]).value),
                                                     gen_0,
                                                     targetSlot_0,
                                                     newPkX_0,
                                                     newPkY_0),
                                sig_0,
                                voterPk_0);
    const nul_0 = this._rotationVoteNullifierOf_0(gen_0,
                                                  targetSlot_0,
                                                  voterSlot_0);
    __compactRuntime.assert(!_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_6.toValue(7n),
                                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(nul_0),
                                                                                                                                               alignment: _descriptor_5.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'slot already voted on this rotation');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(7n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(nul_0),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(6n),
                                                                  alignment: _descriptor_6.alignment() } },
                                                       { tag: 'value',
                                                         value: { value: _descriptor_5.toValue(prop_0),
                                                                  alignment: _descriptor_5.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_0),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 2 } }]);
    return [];
  }
  _sealRotation_0(context, partialProofData, targetSlot_0, newPkX_0, newPkY_0) {
    const gen_0 = ((t1) => {
                    if (t1 > 4294967295n) {
                      throw new __compactRuntime.CompactError('host.compact line 275 char 15: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                    }
                    return t1;
                  })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                               partialProofData,
                                                                               [
                                                                                { dup: { n: 0 } },
                                                                                { idx: { cached: false,
                                                                                         pushPath: false,
                                                                                         path: [
                                                                                                { tag: 'value',
                                                                                                  value: { value: _descriptor_6.toValue(1n),
                                                                                                           alignment: _descriptor_6.alignment() } }] } },
                                                                                { popeq: { cached: true,
                                                                                           result: undefined } }]).value));
    const prop_0 = this._rotationProposalOf_0(gen_0,
                                              targetSlot_0,
                                              newPkX_0,
                                              newPkY_0);
    __compactRuntime.assert(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(6n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(prop_0),
                                                                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'rotation not proposed');
    let tmp_0;
    __compactRuntime.assert(!(tmp_0 = _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                partialProofData,
                                                                                                [
                                                                                                 { dup: { n: 0 } },
                                                                                                 { idx: { cached: false,
                                                                                                          pushPath: false,
                                                                                                          path: [
                                                                                                                 { tag: 'value',
                                                                                                                   value: { value: _descriptor_6.toValue(3n),
                                                                                                                            alignment: _descriptor_6.alignment() } }] } },
                                                                                                 { popeq: { cached: false,
                                                                                                            result: undefined } }]).value),
                              _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_6.toValue(6n),
                                                                                                                    alignment: _descriptor_6.alignment() } },
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_5.toValue(prop_0),
                                                                                                                    alignment: _descriptor_5.alignment() } }] } },
                                                                                         { push: { storage: false,
                                                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                                                                                alignment: _descriptor_1.alignment() }).encode() } },
                                                                                         'lt',
                                                                                         { popeq: { cached: true,
                                                                                                    result: undefined } }]).value)),
                            'quorum not reached');
    const tmp_1 = { pkX: newPkX_0,
                    pkY: newPkY_0,
                    addedAtGen:
                      ((t1) => {
                        if (t1 > 4294967295n) {
                          throw new __compactRuntime.CompactError('host.compact line 281 char 63: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                        }
                        return t1;
                      })(gen_0 + 1n) };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(0n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(targetSlot_0),
                                                                                              alignment: _descriptor_6.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_9.toValue(tmp_1),
                                                                                              alignment: _descriptor_9.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_2 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(1n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_2),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _requireCurrentOwnerAttested_0(context,
                                 partialProofData,
                                 epoch_0,
                                 rootIdCommit_0,
                                 currentIdCommit_0)
  {
    __compactRuntime.assert(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(8n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(epoch_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'epoch not attested');
    let tmp_0;
    __compactRuntime.assert(!(tmp_0 = ((t1) => {
                                        if (t1 > 4294967295n) {
                                          throw new __compactRuntime.CompactError('host.compact line 299 char 32: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 4294967295');
                                        }
                                        return t1;
                                      })(epoch_0 + 1n),
                              _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_6.toValue(8n),
                                                                                                                    alignment: _descriptor_6.alignment() } }] } },
                                                                                         { push: { storage: false,
                                                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                                                                         'member',
                                                                                         { popeq: { cached: true,
                                                                                                    result: undefined } }]).value)),
                            'not the latest epoch');
    __compactRuntime.assert(this._blockTimeLt_0(context,
                                                partialProofData,
                                                ((t1) => {
                                                  if (t1 > 18446744073709551615n) {
                                                    throw new __compactRuntime.CompactError('host.compact line 300 char 22: cast from Field or Uint value to smaller Uint value failed: ' + t1 + ' is greater than 18446744073709551615');
                                                  }
                                                  return t1;
                                                })(_descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                             partialProofData,
                                                                                                             [
                                                                                                              { dup: { n: 0 } },
                                                                                                              { idx: { cached: false,
                                                                                                                       pushPath: false,
                                                                                                                       path: [
                                                                                                                              { tag: 'value',
                                                                                                                                value: { value: _descriptor_6.toValue(9n),
                                                                                                                                         alignment: _descriptor_6.alignment() } }] } },
                                                                                                              { idx: { cached: false,
                                                                                                                       pushPath: false,
                                                                                                                       path: [
                                                                                                                              { tag: 'value',
                                                                                                                                value: { value: _descriptor_0.toValue(epoch_0),
                                                                                                                                         alignment: _descriptor_0.alignment() } }] } },
                                                                                                              { popeq: { cached: false,
                                                                                                                         result: undefined } }]).value)
                                                   +
                                                   this._maxStalenessSeconds_0())),
                            'attestation is stale');
    const path_0 = this._snapshotPath_0(context, partialProofData);
    __compactRuntime.assert(this._equal_1(path_0.leaf,
                                          this._ownerLeafOf_0(rootIdCommit_0,
                                                              currentIdCommit_0)),
                            'path does not bind to this ownership leaf');
    __compactRuntime.assert(this._merkleTreePathRoot_0(path_0).field
                            ===
                            _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_6.toValue(8n),
                                                                                                                  alignment: _descriptor_6.alignment() } }] } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_0.toValue(epoch_0),
                                                                                                                  alignment: _descriptor_0.alignment() } }] } },
                                                                                       { popeq: { cached: false,
                                                                                                  result: undefined } }]).value),
                            'ownership leaf is not in the attested snapshot');
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_6.toValue(11n),
                                                                  alignment: _descriptor_6.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_1),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 20; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_0(x0, y0) {
    if (x0 !== y0) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    committee: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(0n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(0n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 255n)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 46 char 1',
                                     'Uint<0..256>',
                                     key_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(0n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(key_0),
                                                                                                                                 alignment: _descriptor_6.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 255n)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'host.compact line 46 char 1',
                                     'Uint<0..256>',
                                     key_0)
        }
        return _descriptor_9.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(0n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(key_0),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[0];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_6.fromValue(key.value),      _descriptor_9.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    get committeeGen() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(1n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    },
    get slotCount() {
      return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(2n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get quorum() {
      return _descriptor_6.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(3n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get lanternTag() {
      return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(4n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    epochVotes: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(5n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(5n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 53 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(5n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(key_0),
                                                                                                                                 alignment: _descriptor_5.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'host.compact line 53 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (state.asArray()[5].asMap().get({ value: _descriptor_5.toValue(key_0),
                                             alignment: _descriptor_5.alignment() }) === undefined) {
          throw new __compactRuntime.CompactError(`Map value undefined for ${key_0}`);
        }
        return {
          read(...args_1) {
            if (args_1.length !== 0) {
              throw new __compactRuntime.CompactError(`read: expected 0 arguments, received ${args_1.length}`);
            }
            return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_6.toValue(5n),
                                                                                                         alignment: _descriptor_6.alignment() } },
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_5.toValue(key_0),
                                                                                                         alignment: _descriptor_5.alignment() } }] } },
                                                                              { popeq: { cached: true,
                                                                                         result: undefined } }]).value);
          }
        }
      }
    },
    rotationVotes: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(6n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(6n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 54 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(6n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(key_0),
                                                                                                                                 alignment: _descriptor_5.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'host.compact line 54 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (state.asArray()[6].asMap().get({ value: _descriptor_5.toValue(key_0),
                                             alignment: _descriptor_5.alignment() }) === undefined) {
          throw new __compactRuntime.CompactError(`Map value undefined for ${key_0}`);
        }
        return {
          read(...args_1) {
            if (args_1.length !== 0) {
              throw new __compactRuntime.CompactError(`read: expected 0 arguments, received ${args_1.length}`);
            }
            return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                             partialProofData,
                                                                             [
                                                                              { dup: { n: 0 } },
                                                                              { idx: { cached: false,
                                                                                       pushPath: false,
                                                                                       path: [
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_6.toValue(6n),
                                                                                                         alignment: _descriptor_6.alignment() } },
                                                                                              { tag: 'value',
                                                                                                value: { value: _descriptor_5.toValue(key_0),
                                                                                                         alignment: _descriptor_5.alignment() } }] } },
                                                                              { popeq: { cached: true,
                                                                                         result: undefined } }]).value);
          }
        }
      }
    },
    voteNullifiers: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(7n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(7n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 55 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(7n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_5.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[7];
        return self_0.asMap().keys().map((elem) => _descriptor_5.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    attestedRoots: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(8n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(8n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 4294967295n)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 58 char 1',
                                     'Uint<0..4294967296>',
                                     key_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(8n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 4294967295n)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'host.compact line 58 char 1',
                                     'Uint<0..4294967296>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(8n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[8];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_2.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    attestedAtLo: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(9n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(9n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 4294967295n)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'host.compact line 64 char 1',
                                     'Uint<0..4294967296>',
                                     key_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(9n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0n && key_0 <= 4294967295n)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'host.compact line 64 char 1',
                                     'Uint<0..4294967296>',
                                     key_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(9n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[9];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_1.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    get latestEpoch() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(10n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    },
    get gateActions() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_6.toValue(11n),
                                                                                                   alignment: _descriptor_6.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    },
    snapshot: {
      isFull(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isFull: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(12n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(1n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(1048576n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'lt',
                                                                          'neg',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      checkRoot(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`checkRoot: expected 1 argument, received ${args_0.length}`);
        }
        const rt_0 = args_0[0];
        if (!(typeof(rt_0) === 'object' && typeof(rt_0.field) === 'bigint' && rt_0.field >= 0 && rt_0.field <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('checkRoot',
                                     'argument 1',
                                     'host.compact line 77 char 1',
                                     'struct MerkleTreeDigest<field: Field>',
                                     rt_0)
        }
        return _descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(12n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_6.toValue(2n),
                                                                                                     alignment: _descriptor_6.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_11.toValue(rt_0),
                                                                                                                                 alignment: _descriptor_11.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      root(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`root: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[12];
        return ((result) => result             ? __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(result)             : undefined)(self_0.asArray()[0].asBoundedMerkleTree().rehash().root()?.value);
      },
      firstFree(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`first_free: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[12];
        return __compactRuntime.CompactTypeField.fromValue(self_0.asArray()[1].asCell().value);
      },
      pathForLeaf(...args_0) {
        if (args_0.length !== 2) {
          throw new __compactRuntime.CompactError(`path_for_leaf: expected 2 arguments, received ${args_0.length}`);
        }
        const index_0 = args_0[0];
        const leaf_0 = args_0[1];
        if (!(typeof(index_0) === 'bigint' && index_0 >= 0 && index_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 1',
                                     'host.compact line 77 char 1',
                                     'Field',
                                     index_0)
        }
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('path_for_leaf',
                                     'argument 2',
                                     'host.compact line 77 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[12];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(20, _descriptor_5).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().pathForLeaf(    index_0,    {      value: _descriptor_5.toValue(leaf_0),      alignment: _descriptor_5.alignment()    }  )?.value);
      },
      findPathForLeaf(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`find_path_for_leaf: expected 1 argument, received ${args_0.length}`);
        }
        const leaf_0 = args_0[0];
        if (!(leaf_0.buffer instanceof ArrayBuffer && leaf_0.BYTES_PER_ELEMENT === 1 && leaf_0.length === 32)) {
          __compactRuntime.typeError('find_path_for_leaf',
                                     'argument 1',
                                     'host.compact line 77 char 1',
                                     'Bytes<32>',
                                     leaf_0)
        }
        const self_0 = state.asArray()[12];
        return ((result) => result             ? new __compactRuntime.CompactTypeMerkleTreePath(20, _descriptor_5).fromValue(result)             : undefined)(  self_0.asArray()[0].asBoundedMerkleTree().rehash().findPathForLeaf(    {      value: _descriptor_5.toValue(leaf_0),      alignment: _descriptor_5.alignment()    }  )?.value);
      },
      history(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`history: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[12];
        return self_0.asArray()[2].asMap().keys().map(  (elem) => __compactRuntime.CompactTypeMerkleTreeDigest.fromValue(elem.value))[Symbol.iterator]();
      }
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({
  getSchnorrReduction: (...args) => undefined,
  claimedNow: (...args) => undefined,
  snapshotPath: (...args) => undefined
});
export const pureCircuits = {
  attestSlackSeconds: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`attestSlackSeconds: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._attestSlackSeconds_0();
  },
  maxStalenessSeconds: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`maxStalenessSeconds: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._maxStalenessSeconds_0();
  },
  attestDomain: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`attestDomain: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._attestDomain_0();
  },
  rotateDomain: (...args_0) => {
    if (args_0.length !== 0) {
      throw new __compactRuntime.CompactError(`rotateDomain: expected 0 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    return _dummyContract._rotateDomain_0();
  },
  ownerLeafOf: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`ownerLeafOf: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const root_0 = args_0[0];
    const current_0 = args_0[1];
    if (!(root_0.buffer instanceof ArrayBuffer && root_0.BYTES_PER_ELEMENT === 1 && root_0.length === 32)) {
      __compactRuntime.typeError('ownerLeafOf',
                                 'argument 1',
                                 'host.compact line 119 char 1',
                                 'Bytes<32>',
                                 root_0)
    }
    if (!(current_0.buffer instanceof ArrayBuffer && current_0.BYTES_PER_ELEMENT === 1 && current_0.length === 32)) {
      __compactRuntime.typeError('ownerLeafOf',
                                 'argument 2',
                                 'host.compact line 119 char 1',
                                 'Bytes<32>',
                                 current_0)
    }
    return _dummyContract._ownerLeafOf_0(root_0, current_0);
  },
  attestDigest: (...args_0) => {
    if (args_0.length !== 4) {
      throw new __compactRuntime.CompactError(`attestDigest: expected 4 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const tag_0 = args_0[0];
    const gen_0 = args_0[1];
    const epoch_0 = args_0[2];
    const snapshotRoot_0 = args_0[3];
    if (!(typeof(tag_0) === 'bigint' && tag_0 >= 0 && tag_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('attestDigest',
                                 'argument 1',
                                 'host.compact line 127 char 1',
                                 'Field',
                                 tag_0)
    }
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('attestDigest',
                                 'argument 2',
                                 'host.compact line 127 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
      __compactRuntime.typeError('attestDigest',
                                 'argument 3',
                                 'host.compact line 127 char 1',
                                 'Uint<0..4294967296>',
                                 epoch_0)
    }
    if (!(typeof(snapshotRoot_0) === 'bigint' && snapshotRoot_0 >= 0 && snapshotRoot_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('attestDigest',
                                 'argument 4',
                                 'host.compact line 127 char 1',
                                 'Field',
                                 snapshotRoot_0)
    }
    return _dummyContract._attestDigest_0(tag_0, gen_0, epoch_0, snapshotRoot_0);
  },
  rotateDigest: (...args_0) => {
    if (args_0.length !== 5) {
      throw new __compactRuntime.CompactError(`rotateDigest: expected 5 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const tag_0 = args_0[0];
    const gen_0 = args_0[1];
    const targetSlot_0 = args_0[2];
    const newPkX_0 = args_0[3];
    const newPkY_0 = args_0[4];
    if (!(typeof(tag_0) === 'bigint' && tag_0 >= 0 && tag_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('rotateDigest',
                                 'argument 1',
                                 'host.compact line 133 char 1',
                                 'Field',
                                 tag_0)
    }
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('rotateDigest',
                                 'argument 2',
                                 'host.compact line 133 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
      __compactRuntime.typeError('rotateDigest',
                                 'argument 3',
                                 'host.compact line 133 char 1',
                                 'Uint<0..256>',
                                 targetSlot_0)
    }
    if (!(typeof(newPkX_0) === 'bigint' && newPkX_0 >= 0 && newPkX_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('rotateDigest',
                                 'argument 4',
                                 'host.compact line 133 char 1',
                                 'Field',
                                 newPkX_0)
    }
    if (!(typeof(newPkY_0) === 'bigint' && newPkY_0 >= 0 && newPkY_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('rotateDigest',
                                 'argument 5',
                                 'host.compact line 133 char 1',
                                 'Field',
                                 newPkY_0)
    }
    return _dummyContract._rotateDigest_0(tag_0,
                                          gen_0,
                                          targetSlot_0,
                                          newPkX_0,
                                          newPkY_0);
  },
  epochProposalOf: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`epochProposalOf: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const gen_0 = args_0[0];
    const epoch_0 = args_0[1];
    const root_0 = args_0[2];
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('epochProposalOf',
                                 'argument 1',
                                 'host.compact line 140 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
      __compactRuntime.typeError('epochProposalOf',
                                 'argument 2',
                                 'host.compact line 140 char 1',
                                 'Uint<0..4294967296>',
                                 epoch_0)
    }
    if (!(typeof(root_0) === 'bigint' && root_0 >= 0 && root_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('epochProposalOf',
                                 'argument 3',
                                 'host.compact line 140 char 1',
                                 'Field',
                                 root_0)
    }
    return _dummyContract._epochProposalOf_0(gen_0, epoch_0, root_0);
  },
  rotationProposalOf: (...args_0) => {
    if (args_0.length !== 4) {
      throw new __compactRuntime.CompactError(`rotationProposalOf: expected 4 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const gen_0 = args_0[0];
    const targetSlot_0 = args_0[1];
    const newPkX_0 = args_0[2];
    const newPkY_0 = args_0[3];
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('rotationProposalOf',
                                 'argument 1',
                                 'host.compact line 144 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
      __compactRuntime.typeError('rotationProposalOf',
                                 'argument 2',
                                 'host.compact line 144 char 1',
                                 'Uint<0..256>',
                                 targetSlot_0)
    }
    if (!(typeof(newPkX_0) === 'bigint' && newPkX_0 >= 0 && newPkX_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('rotationProposalOf',
                                 'argument 3',
                                 'host.compact line 144 char 1',
                                 'Field',
                                 newPkX_0)
    }
    if (!(typeof(newPkY_0) === 'bigint' && newPkY_0 >= 0 && newPkY_0 <= __compactRuntime.MAX_FIELD)) {
      __compactRuntime.typeError('rotationProposalOf',
                                 'argument 4',
                                 'host.compact line 144 char 1',
                                 'Field',
                                 newPkY_0)
    }
    return _dummyContract._rotationProposalOf_0(gen_0,
                                                targetSlot_0,
                                                newPkX_0,
                                                newPkY_0);
  },
  epochVoteNullifierOf: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`epochVoteNullifierOf: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const gen_0 = args_0[0];
    const epoch_0 = args_0[1];
    const slot_0 = args_0[2];
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('epochVoteNullifierOf',
                                 'argument 1',
                                 'host.compact line 152 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(epoch_0) === 'bigint' && epoch_0 >= 0n && epoch_0 <= 4294967295n)) {
      __compactRuntime.typeError('epochVoteNullifierOf',
                                 'argument 2',
                                 'host.compact line 152 char 1',
                                 'Uint<0..4294967296>',
                                 epoch_0)
    }
    if (!(typeof(slot_0) === 'bigint' && slot_0 >= 0n && slot_0 <= 255n)) {
      __compactRuntime.typeError('epochVoteNullifierOf',
                                 'argument 3',
                                 'host.compact line 152 char 1',
                                 'Uint<0..256>',
                                 slot_0)
    }
    return _dummyContract._epochVoteNullifierOf_0(gen_0, epoch_0, slot_0);
  },
  rotationVoteNullifierOf: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`rotationVoteNullifierOf: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const gen_0 = args_0[0];
    const targetSlot_0 = args_0[1];
    const voterSlot_0 = args_0[2];
    if (!(typeof(gen_0) === 'bigint' && gen_0 >= 0n && gen_0 <= 4294967295n)) {
      __compactRuntime.typeError('rotationVoteNullifierOf',
                                 'argument 1',
                                 'host.compact line 158 char 1',
                                 'Uint<0..4294967296>',
                                 gen_0)
    }
    if (!(typeof(targetSlot_0) === 'bigint' && targetSlot_0 >= 0n && targetSlot_0 <= 255n)) {
      __compactRuntime.typeError('rotationVoteNullifierOf',
                                 'argument 2',
                                 'host.compact line 158 char 1',
                                 'Uint<0..256>',
                                 targetSlot_0)
    }
    if (!(typeof(voterSlot_0) === 'bigint' && voterSlot_0 >= 0n && voterSlot_0 <= 255n)) {
      __compactRuntime.typeError('rotationVoteNullifierOf',
                                 'argument 3',
                                 'host.compact line 158 char 1',
                                 'Uint<0..256>',
                                 voterSlot_0)
    }
    return _dummyContract._rotationVoteNullifierOf_0(gen_0,
                                                     targetSlot_0,
                                                     voterSlot_0);
  }
};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
