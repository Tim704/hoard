// What a phone user would trip over on the screen as it stands (visible
// elements only), for e2e/smoke.mjs: run with `page.evaluate(PHONE_CHECKS)`
// in a touch context (isMobile + hasTouch), so `.tap-area` grows hit areas.
//   zoomy    text boxes under 16px (iPhones zoom the page in when one is tapped)
//   small    controls under 40px to tap; a link inside running text is exempt
//   tiny     text under 12px ([data-small-text-ok] marks a deliberate exception)
//   clipped  text cut off without an ellipsis (reported by the audit, not enforced)
export const PHONE_CHECKS = () => {
  const visible = (el) => {
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    return true;
  };
  const name = (el) =>
    (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const where = (el) => {
    const id = el.closest('[id]')?.id;
    return `${el.tagName.toLowerCase()}${id ? `@#${id}` : ''} "${name(el)}"`;
  };

  // 1. Text boxes under 16px make iPhones zoom in.
  const fields = [...document.querySelectorAll('input, textarea, select')].filter((el) => {
    if (el.tagName === 'INPUT' && /^(checkbox|radio|range|color|file|hidden|submit|button|image|reset)$/.test(el.type)) return false;
    return visible(el);
  });
  const zoomy = fields.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map(where);

  // 2. Tap targets under 40px (counting a tap-area ::after).
  const targets = [
    ...document.querySelectorAll(
      'a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="link"], select, summary, input[type="checkbox"], input[type="radio"]',
    ),
  ].filter((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const small = [];
  for (const el of targets) {
    // A link inside running text is fine (it isn't a control on its own).
    if (el.tagName === 'A') {
      const block = el.parentElement;
      const own = (el.textContent || '').trim().length;
      const around = (block?.textContent || '').trim().length;
      if (block && around > own + 12 && getComputedStyle(el).display === 'inline') continue;
    }
    // A checkbox or radio drawn small inside a label: the label is the target.
    if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) continue;
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    let w = r.width;
    let h = r.height;
    if (after.content && after.content !== 'none' && after.position === 'absolute') {
      w = Math.max(w, parseFloat(after.width) || 0);
      h = Math.max(h, parseFloat(after.height) || 0);
    }
    if (w < 39.5 || h < 39.5) small.push(`${where(el)} ${Math.round(w)}×${Math.round(h)}`);
  }

  // 3. Text under 12px.
  const tiny = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || el.closest('.sr-only, script, style, noscript, svg, [data-small-text-ok]')) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) tiny.add(where(el));
  }

  // 4. Cut-off text that isn't an intended ellipsis.
  const clipped = [];
  for (const el of document.querySelectorAll('main *')) {
    if (!visible(el) || el.children.length > 0 || el.closest('.sr-only')) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') continue;
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) {
      clipped.push(where(el));
    }
  }

  return { zoomy, small, tiny: [...tiny], clipped };
};
