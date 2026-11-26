// The name of the send-out streams (#66). rom:shots and wasm:run take it on the command line in
// plain Node, which cannot load the battles of scripts/wasm-sendouts.ts: their lines come from the
// phrase module in src/gen3/, which imports without file extensions.

/** The name of the streams for rom:shots and wasm:run; each battle adds its number. */
export const SEND_OUTS = 'send-outs'
