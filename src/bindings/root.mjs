// The ONE file in src/ that imports the repo root's runtime and the committed
// contract modules. Everything else in src/ receives them from here by
// injection, which keeps src/ free to run against a different runtime copy
// (the local-chain runner has its own) and in the browser.
// test/portable.test.js enforces the rule.
import * as rt from '@midnight-ntwrk/compact-runtime';
import * as schnorr from '@midnight-ntwrk/midnight-did-jubjub-schnorr';
import * as Lantern from '../../contracts/managed/contract/index.js';
import * as Host from '../../contracts/managed-host/contract/index.js';

export const rootBindings = Object.freeze({ rt, schnorr, Lantern, Host });
