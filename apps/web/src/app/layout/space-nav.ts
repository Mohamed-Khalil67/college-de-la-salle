import type { SessionUser } from '@cdls/shared';
import { isTeacherPlanner } from '../core/auth/planner';
import type { IconName } from '../shared/ui';

export interface SpaceNavItem {
  readonly label: string;
  /** Relative to the area (e.g. 'notes'); '' is the area's home. */
  readonly path: string;
  /** Shown in the phone's bottom bar (at most five items, « Plus » included). */
  readonly icon?: IconName;
  readonly short?: string;
  /**
   * `admin`: only the admin sees it; `planner`: only a teacher marked planificateur (the links between the teacher space
   * and the administration; an admin who is also planificateur already sees everything). No value: everyone in the area.
   */
  readonly access?: 'admin' | 'planner';
  /** An absolute address (a link to another area); `path` is then only an identity. */
  readonly href?: string;
  /**
   * The « Plus » entry: always in the phone's bottom bar, and in the top navigation only when its overflow
   * (the `secondary` items) has moved there.
   */
  readonly mobileOnly?: boolean;
  /** Moves to « Plus » in the top navigation when there are more than `TOP_NAV_MAX` items. */
  readonly secondary?: boolean;
}

/** The items this user may see: admin-only and planner-only entries are filtered by role. */
export function visibleNav(nav: readonly SpaceNavItem[], user: Pick<SessionUser, 'role' | 'isPlanner'> | null | undefined): SpaceNavItem[] {
  return nav.filter((item) => {
    if (item.access === 'admin') return user?.role === 'admin';
    if (item.access === 'planner') return isTeacherPlanner(user);
    return true;
  });
}

/** What the top navigation holds before the overflow goes to « Plus ». */
export const TOP_NAV_MAX = 8;

/**
 * The top navigation: every item while they fit (`TOP_NAV_MAX`); beyond that the `secondary` ones move to
 * « Plus », which then appears in the bar.
 */
export function desktopNav(visible: readonly SpaceNavItem[]): SpaceNavItem[] {
  const items = visible.filter((item) => !item.mobileOnly);
  if (items.length <= TOP_NAV_MAX) return items;
  return [...items.filter((item) => !item.secondary), ...visible.filter((item) => item.mobileOnly)];
}

/** At most five icons in the phone's bottom bar; if there are more, the last entry (« Plus ») keeps its place. */
export function mobileNav(visible: readonly SpaceNavItem[]): SpaceNavItem[] {
  const items = visible.filter((item) => item.icon);
  const last = items.at(-1);
  return items.length > 5 && last ? [...items.slice(0, 4), last] : items;
}
