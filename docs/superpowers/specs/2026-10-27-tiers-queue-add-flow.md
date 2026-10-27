# Tiers, Up next, smoother adding, decimal scores — spec

Agreed with the owner in a grilling session on 2026-10-27. Applies per user and per category.

## 1. Adding media
- Search runs as you type (no Search button needed; Enter still works). ↑/↓ moves a highlight through results; Enter acts on the highlighted row.
- Each result row offers two choices, worded per category: the COMPLETED label ("Watched", "Read", "Beaten", "Listened") and a "Want to …" label ("Want to watch", "Want to read", "Want to play", "Want to listen").
  - **Done choice** → saved as COMPLETED, then an inline rating step on the same row with a **Skip** button (unrated is allowed).
  - **Want choice** → saved as PLANNED and appended to the bottom of Up next.
- The dialog stays open to add several titles, and fully resets (query, results, row state) when closed.
- Results already in the library show "In library · <status label> <score>" instead of the choices.
- CONSUMING, ON_HOLD and DROPPED are not offered while adding; they stay settable in the detail view.

## 2. Decimal scores
- Scores are 0.0–10.0 with one decimal. Existing whole scores carry over unchanged (8 → 8.0) and display with one decimal.
- Input: tap one of 10 pips to set the whole number, then nudge with −0.1 / +0.1, or type the number.
- The server rejects scores outside 0–10 and rounds to one decimal. Franchise scores follow the same rules.

## 3. Tier list (replaces "My ranking")
- Fixed tiers S / A / B / C / D / F, one tier list per category.
- Placement is by hand and persistent: nothing (scores, Arena) ever moves an item to another tier.
- Items are drag-ranked within a tier.
- Shown in the tier list: items whose status is COMPLETED or DROPPED.
- Newly eligible items wait in an **Unranked tray** below the tiers, each showing its score-suggested tier ("A?") with a one-tap accept. Unrated items show no suggestion.
- Existing rankings: everything starts in the tray, in its current "My ranking" order, with suggestions; an **Accept all suggestions** button places every rated tray item into its suggested tier, keeping tray order within each tier.
- If a placed item's status changes away from COMPLETED/DROPPED (e.g. a rewatch), it keeps its tier and position but is hidden until it is COMPLETED or DROPPED again.
- The Arena only duels neighbours **within the same tier** and only reorders within that tier.

## 4. Up next
- One drag-to-reorder queue per category containing the PLANNED items. New PLANNED items join at the bottom.
- Marking a queued item as done removes it from the queue and runs the same rating step as adding (with Skip).

## 5. Deployment
- Deploy with the `pi-deploy` skill. The Pi's `~/hoard` is a copied folder, not a git checkout; the first deploy converts it to a clone of `Tim704/hoard`, keeping its `.env`, its directory name (`hoard`, so the compose project and Postgres volume stay the same) and the database.

## Decided during planning (not discussed; easy to change)
- Suggested tier from score: S ≥ 9.0, A ≥ 8.0, B ≥ 7.0, C ≥ 6.0, D ≥ 5.0, F below 5.0.
- "Want to …" labels: movies/tv/anime "Want to watch", books/manga "Want to read", games "Want to play", music "Want to listen".
- Search-as-you-type waits 350 ms after the last keystroke and needs at least 2 characters.
- Up next lives as a tab beside Tiers and Arena on the category's ranking page; the category page's PLANNED section is shown in queue order.
- When no tier holds two items yet, the Arena falls back to pairing items with the same whole-number score.
