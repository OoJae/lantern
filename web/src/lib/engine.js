// Loaded only by /demo and /attacks, so the landing page never fetches the runtime's WASM.
// Everything here is the repo's own src/: the same story, witnesses, simulator, leak scanner
// and attack engine that `npm test` runs, against the same compiled contract modules.
import '../polyfills.js';
import { rootBindings } from '../../../src/bindings/root.mjs';
import { simExecutor } from '../../../src/demo/sim-executor.mjs';
import { createStory, createRunner, BEATS, publicRecord, fingerprint, duration } from '../../../src/demo/story.mjs';
import { storyRng } from '../../../src/demo/rng.mjs';
import { runEnumeration } from '../../../src/attack/run.mjs';

export { BEATS, publicRecord, fingerprint, duration, runEnumeration };
// "Try to break it" ships in this same chunk: the panel fetches nothing when a visitor uses it.
export { newWorld, runAttack, worldOf, flipByte, shareFingerprint } from './breakit.js';

/** A fresh story with real Web Crypto entropy: new secrets on every restart. */
export function newSession() {
  const x = simExecutor(rootBindings);
  const story = createStory({ pure: x.pure, rng: storyRng() });
  return { x, story, runner: createRunner(story, x), startedAt: x.now };
}
