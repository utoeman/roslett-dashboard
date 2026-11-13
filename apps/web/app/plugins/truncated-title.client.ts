/**
 * Shows the full text as a tooltip wherever a label is cut off with "…":
 * the selected value of a dropdown and truncated table cells. Set on hover
 * only, because the width depends on the layout at that moment.
 */
export default defineNuxtPlugin(() => {
  document.addEventListener('mouseover', (event) => {
    const target = event.target as Element | null;
    // The dropdown value ignores the pointer, so the tooltip goes on its trigger.
    const trigger = target?.closest<HTMLElement>('[data-slot="base"]');
    const value = trigger?.querySelector<HTMLElement>('[data-slot="value"]');
    const text = value ?? target?.closest<HTMLElement>('.truncate');
    const holder = value ? trigger : text;
    if (!text || !holder) return;
    if (text.scrollWidth > text.clientWidth) {
      holder.title = text.textContent?.trim() ?? '';
      holder.dataset.autoTitle = '';
    } else if (holder.dataset.autoTitle !== undefined) {
      // Only remove titles this plugin set; others are intentional.
      holder.removeAttribute('title');
      delete holder.dataset.autoTitle;
    }
  });
});
