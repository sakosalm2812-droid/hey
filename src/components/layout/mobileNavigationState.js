/**
 * Keep a visually closed mobile drawer out of both the tab order and the
 * accessibility tree. Desktop navigation stays available regardless of the
 * mobile drawer toggle state.
 */
export function getMobileNavigationAccessibility(isMobileViewport, isOpen) {
  const hidden = Boolean(isMobileViewport && !isOpen);
  return { ariaHidden: hidden, inert: hidden };
}
