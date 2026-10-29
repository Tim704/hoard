// ───────────────────────────────────────────────────────────────────────────
//  Fresh's tab strip (src/components/shell/top-bar.tsx): keeping the open
//  tab in view and fading the edges with more to scroll to. syncStrip runs
//  after hydration; STRIP_SCRIPT is the same logic as an inline script for
//  the first paint. Hand-written ES5 can't share code with syncStrip, so
//  tab-strip.test.ts runs both on the same strips and expects the same
//  scroll position and attributes.
//
//  No React and no globals: only the element it is handed.
// ───────────────────────────────────────────────────────────────────────────

/** How far a clipped edge of the tab strip fades out: px, as in globals.css .edge-fade. */
export const FADE_PX = 32;

/**
 * The tab strip's scroll state: with `reveal`, the open tab is scrolled to the
 * middle when it isn't clear of the faded edges, and `data-reveal` keeps the
 * scroll position that reveal left; then `data-fade` names the edges with
 * more to scroll to. STRIP_SCRIPT is the same for the first paint.
 */
export function syncStrip(ul: HTMLElement, reveal: boolean) {
  const max = ul.scrollWidth - ul.clientWidth;
  const on = ul.querySelector('[aria-current="page"]');
  if (reveal && on && max > 0) {
    const u = ul.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    if (r.left < u.left + FADE_PX || r.right > u.right - FADE_PX) {
      ul.scrollLeft += r.left - u.left - (u.width - r.width) / 2;
    }
  }
  if (reveal) ul.dataset.reveal = String(ul.scrollLeft);
  const fade = [];
  if (ul.scrollLeft > 1) fade.push('start');
  if (ul.scrollLeft < max - 1) fade.push('end');
  ul.dataset.fade = fade.join(' ');
}

/**
 * Whether the strip still sits where the last automatic reveal left it (or
 * where the browser clamped that to, when the strip got narrower): false
 * once the user has scrolled it.
 */
export function untouchedSinceReveal(ul: HTMLElement): boolean {
  const at = Number(ul.dataset.reveal);
  if (!Number.isFinite(at)) return false;
  const max = Math.max(0, ul.scrollWidth - ul.clientWidth);
  return Math.abs(ul.scrollLeft - Math.min(at, max)) <= 1;
}

/**
 * syncStrip(previous sibling, true) as an inline script right after the
 * server-rendered strip: it runs while the page is parsed, so the open tab is
 * in view (and the fades are on) in the first paint, not after hydration.
 * Hand-written ES5, kept in step with syncStrip by tab-strip.test.ts.
 */
export const STRIP_SCRIPT = `(function(){var s=document.currentScript,u=s&&s.previousElementSibling;if(!u)return;var m=u.scrollWidth-u.clientWidth,a=u.querySelector('[aria-current="page"]');if(a&&m>0){var b=u.getBoundingClientRect(),r=a.getBoundingClientRect();if(r.left<b.left+${FADE_PX}||r.right>b.right-${FADE_PX})u.scrollLeft+=r.left-b.left-(b.width-r.width)/2}u.setAttribute('data-reveal',String(u.scrollLeft));var f=[];if(u.scrollLeft>1)f.push('start');if(u.scrollLeft<m-1)f.push('end');u.setAttribute('data-fade',f.join(' '))})()`;
