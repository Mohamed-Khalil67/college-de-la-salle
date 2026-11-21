import { hasSessionMarker } from './session-marker';

describe('hasSessionMarker', () => {
  it('finds the marker among other cookies', () => {
    expect(hasSessionMarker('cdls_session=1')).toBe(true);
    expect(hasSessionMarker('theme=dark; cdls_session=1; lang=fr')).toBe(true);
  });

  it('says no for no cookie, an emptied marker or a look-alike name', () => {
    expect(hasSessionMarker('')).toBe(false);
    expect(hasSessionMarker('cdls_session=')).toBe(false);
    expect(hasSessionMarker('xcdls_session=1; cdls_sessions=1')).toBe(false);
  });
});
