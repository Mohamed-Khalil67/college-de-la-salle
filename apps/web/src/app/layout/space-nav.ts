import type { SessionUser } from '@cdls/shared';
import type { IconName } from '../ui';

export interface SpaceNavItem {
  readonly label: string;
  /** Relative to the area (e.g. 'notes'); '' is the area's home. */
  readonly path: string;
  /** Shown in the phone's bottom bar (at most five items, « Plus » included). */
  readonly icon?: IconName;
  readonly short?: string;
  /** `admin`: only the admin sees it; `coordinator`: only a teacher marked coordinateur. No value: everyone who is in the area. */
  readonly access?: 'admin' | 'coordinator';
  /** An absolute address (a link to another area); `path` is then only an identity. */
  readonly href?: string;
  /** Only in the phone's bottom bar (the « Plus » entry), not in the top navigation. */
  readonly mobileOnly?: boolean;
}

/** The items this user may see: admin-only and coordinator-only entries are filtered by role. */
export function visibleNav(nav: readonly SpaceNavItem[], user: Pick<SessionUser, 'role' | 'isCoordinator'> | null | undefined): SpaceNavItem[] {
  return nav.filter((item) => {
    if (item.access === 'admin') return user?.role === 'admin';
    if (item.access === 'coordinator') return user?.role === 'teacher' && !!user.isCoordinator;
    return true;
  });
}
