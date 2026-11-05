import type { Page } from "@playwright/test";

/** Smallest touch target in CSS px (docs/MOBILE-MATRIX.md). */
export const MIN_TARGET = 44;

/**
 * Operable elements smaller than MIN_TARGET. Copied from `smallTargets` in
 * apps/app/e2e/mobile-matrix.spec.ts (#66): that spec stays untouched, so keep both in step when the
 * rules in docs/MOBILE-MATRIX.md change. Exceptions (each one is in docs/MOBILE-MATRIX.md):
 *  - `.react-flow__handle`: connection handles, the map has no connect action;
 *  - links inside running text;
 *  - an input in a `<label>` is measured by its label, which is what the finger hits;
 *  - elements another element covers (they cannot be operated right now).
 */
export async function smallTargets(page: Page): Promise<{ small: string[]; scanned: number }> {
  return page.evaluate((min) => {
    const selector = 'button, a[href], select, input:not([type="hidden"]), textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="combobox"], [contenteditable="true"]';
    const found: string[] = [];
    let scanned = 0;
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.closest(".react-flow__handle")) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const label = element.closest("label");
      const measured = label && label.contains(element) && element.tagName !== "BUTTON" ? label : element;
      const rect = measured.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (element.tagName === "A" && style.display === "inline") {
        const rest = (element.parentElement?.textContent ?? "").replace(element.textContent ?? "", "").trim();
        if (rest.length > 0) continue;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && !measured.contains(top) && !top.contains(measured)) continue;
      }
      scanned += 1;
      if (rect.width < min - 0.5 || rect.height < min - 0.5) {
        const name = element.dataset.testid ?? element.getAttribute("aria-label") ?? (element.textContent ?? "").trim().slice(0, 30);
        found.push(`${rect.width.toFixed(0)}x${rect.height.toFixed(0)} <${element.tagName.toLowerCase()}> ${name}`);
      }
    }
    return { small: found, scanned };
  }, MIN_TARGET);
}

/** Pixels the page is wider than the screen; 0 when it fits (a rounding pixel is tolerated by the caller). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
