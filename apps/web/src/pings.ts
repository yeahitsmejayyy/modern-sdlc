// Tells the Recent pings list that a ping just happened somewhere else on the page
// (Edith's ping tool), so it refreshes right away instead of on its next poll.
export const PINGS_CHANGED = 'pings:changed'

export function pingsChanged() {
  window.dispatchEvent(new Event(PINGS_CHANGED))
}
