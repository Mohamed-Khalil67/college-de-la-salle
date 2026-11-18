import { PROFILE } from '../core/school/school-profile';
import { PHOTOS } from './active/archive';
import type { ContactLine, Photo, PhotoArchive, PhotoId, PhotoText } from './content.model';

/** The school's identity as the public pages use it, read from the profile (`schools/<SCHOOL>/profile.json`). */
export const SCHOOL = {
  /** The name, in the language it is always written in (`PROFILE.nameLang`). */
  name: PROFILE.names[PROFILE.nameLang].full,
  nameLang: PROFILE.nameLang,
  email: PROFILE.contacts.email,
  switchboard: PROFILE.contacts.switchboard,
  mapQuery: PROFILE.contacts.mapQuery,
} as const;

/** Telephone numbers by department. */
export const CONTACTS: readonly ContactLine[] = PROFILE.contacts.departments.map((d) => ({ id: d.id, phones: d.phones }));

/** A photo with its alt text, caption and credit in another language. */
export function localizedPhoto(
  id: PhotoId,
  texts: Readonly<Record<PhotoId, PhotoText>>,
  credits: Readonly<Record<PhotoArchive, string>>,
): Photo {
  const photo = PHOTOS[id];
  const text = texts[id];
  if (!photo || !text) throw new Error(`Photo « ${id} » is missing from the school pack (archive.ts and every language's content).`);
  const credit = credits[photo.archive];
  if (credit === undefined) throw new Error(`Photo credit « ${photo.archive} » is missing from the school pack's content.`);
  return { ...photo, ...text, credit };
}
