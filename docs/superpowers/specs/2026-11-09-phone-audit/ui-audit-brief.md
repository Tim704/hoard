# Phone UI audit brief (Hoard)

You are auditing how Hoard looks and feels **on a phone**. The owner, Tim, asked for a phone UI that
is "intuitive and looks good", for the whole app, and chose a proper job: redesign what's awkward,
not only fix what's broken. You write findings; someone else makes the changes. **Read-only:** don't
edit any repo file, commit, or start servers.

App: `/Users/timhufnagel/Desktop/BucketFillers/hoard`, a Next.js 14 + Tailwind/shadcn media tracker
(books, movies, TV, anime, manga, games, music) for Tim and one friend. It has four layouts (Classic,
Minimal, Organised, Fresh), chosen in Settings → Themes, plus light and dark themes. FEATURES.md
describes every feature. Keep Hoard's existing look: no new visual language, just make it work and
read well at phone size.

## Screenshots (375px wide, 2× scale, demo data, covers missing on purpose)

- Pages: `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad/audit/run2/shots/<page>-<variant>.png`.
  `light` and `dark` are full-page Classic; `minimal`, `organised` and `fresh` are the first screen in
  that layout (for shell differences).
- States: `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad/audit/states1/*.png`:
  - menus and dialogs;
  - `empty_*`, a brand-new account;
  - `long-*`, pages where a few titles were replaced by an 85-character title to stress layouts.
- Covers show a placeholder icon because the test data has no images; don't report that.

Already handled; don't report these:
- sideways scrolling (none at 360 or 375);
- text boxes under 16px;
- text under 12px;
- axe contrast and names;
- tap targets under 40px, except the reorderable rows (drag handle, up/down arrows and remove ×
  in Up next, custom lists and franchise ranking), which are known and yours to redesign if in your
  area.

## What to look for (on a phone, one hand, thumb)

- **Hard to understand:** an unclear control or label, jargon, an icon with no label, a state you
  can't tell apart (selected vs not), or an empty state that doesn't say what to do next.
- **Hard to use:** the main action is far away or hidden; controls are crowded together; it takes
  too many taps; nothing confirms an action or lets you undo it; important things sit below a long
  scroll.
- **Looks wrong:** misalignment; uneven spacing; text cut off where it matters (titles truncated to a
  few letters); a cramped row; something that overflows its box; dark mode looking off; one layout
  breaking where others don't; inconsistent with sibling pages.
- **Content that wastes space on a small screen:** a desktop layout squeezed down instead of adapted.

For each finding, look at the code behind it (component and line) so the fix is concrete.

## Output

Write `/Users/timhufnagel/Desktop/BucketFillers/hoard/.superpowers/sdd/2026-11-09-phone-and-bugs/ui-<your letter>.md`. Group by page and rank inside each page. Each finding gets:

- **Grade:** Broken (wrong or unusable), Confusing (works, but people will get it wrong), or Rough
  (looks or feels off).
- The screenshot file(s).
- What's wrong, in one or two sentences, from the user's point of view.
- **Fix:** concrete and in Hoard's style. Name the file:line and what changes (layout, copy, which
  element moves). Prefer small changes; propose a redesign only where the current layout can't work
  on a phone, and then sketch it in a few lines.

Finish with the 5 changes that would most improve your area on a phone. Return only a 5-line
summary: counts by grade and the top 3.
