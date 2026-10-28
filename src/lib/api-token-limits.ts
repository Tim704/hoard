// Public API token limits (spec 8.7), client-safe (src/lib/api-tokens.ts
// needs node:crypto, so the Settings card reads these from here).

/** Tokens per user. */
export const MAX_TOKENS = 10;
/** Characters in a token's name. */
export const MAX_TOKEN_NAME = 40;
