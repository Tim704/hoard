// ───────────────────────────────────────────────────────────────────────────
//  The franchise ranking's save plan. The client sends its order and the ids
//  it took out; franchises ranked elsewhere (another tab or device) that it
//  didn't know about stay ranked, after the ones it sent. Pure.
// ───────────────────────────────────────────────────────────────────────────

const STEP = 1000;

/** The rows to write (only those whose rank changes); `rankOrder: null` takes one out. */
export function planFranchiseRanking(
  orderedIds: readonly string[],
  removedIds: readonly string[],
  owned: readonly { id: string; rankOrder: number | null }[],
): { id: string; rankOrder: number | null }[] {
  const byId = new Map(owned.map((o) => [o.id, o.rankOrder]));
  const removed = new Set(removedIds.filter((id) => byId.has(id)));
  const sent = [...new Set(orderedIds)].filter((id) => byId.has(id) && !removed.has(id));
  const sentSet = new Set(sent);
  const others = owned
    .filter((o) => o.rankOrder != null && !sentSet.has(o.id) && !removed.has(o.id))
    .sort((a, b) => (a.rankOrder as number) - (b.rankOrder as number))
    .map((o) => o.id);
  const plan: { id: string; rankOrder: number | null }[] = [];
  [...sent, ...others].forEach((id, i) => {
    const rankOrder = (i + 1) * STEP;
    if (byId.get(id) !== rankOrder) plan.push({ id, rankOrder });
  });
  for (const id of removed) if (byId.get(id) != null) plan.push({ id, rankOrder: null });
  return plan.sort((a, b) => (a.rankOrder ?? Infinity) - (b.rankOrder ?? Infinity));
}
