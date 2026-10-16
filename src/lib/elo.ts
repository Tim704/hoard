// ───────────────────────────────────────────────────────────────────────────
//  Elo rating math — pure, dependency-free, deterministic.
//
//  Drives the hidden Arena ranking: every duel a user resolves nudges the two
//  contenders' ratings toward/away from each other based on the surprise of the
//  outcome. No I/O, no side effects — easy to unit-test and reason about.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Expected score (win probability) of player `a` against player `b` given their
 * current Elo ratings. Returns a value in (0, 1).
 */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * Resolve a single head-to-head where `winner` beat `loser`. Returns the two
 * updated ratings. `k` is the maximum swing per match (default 32).
 */
export function updateElo(
  winner: number,
  loser: number,
  k = 32,
): { winner: number; loser: number } {
  const expectedWinner = expectedScore(winner, loser);
  const expectedLoser = expectedScore(loser, winner);

  return {
    // Actual score is 1 for the winner, 0 for the loser.
    winner: winner + k * (1 - expectedWinner),
    loser: loser + k * (0 - expectedLoser),
  };
}
