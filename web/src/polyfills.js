// Node globals the Midnight runtime expects at module load. Imported first.
import { Buffer } from 'buffer';

globalThis.Buffer ??= Buffer;
globalThis.process ??= { env: {}, browser: true };
