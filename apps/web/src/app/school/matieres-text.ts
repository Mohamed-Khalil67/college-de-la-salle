import { MATIERE_GROUPS, MATIERES } from '@cdls/shared';
import type { MatiereId, MatiereText, SchoolContent } from './school-content';

/**
 * The names, blurbs and picture descriptions of the platform's subject catalogue (`MATIERES` of @cdls/shared) in
 * French (the site is French only, docs/i18n.md), and the names of its groups. The catalogue is the platform's, not the
 * school's, so these texts are shared by every school pack.
 */
export type MatieresText = Pick<SchoolContent, 'matieres' | 'matiereGroups'>;

/** French: the catalogue itself. */
export const MATIERES_FR: MatieresText = {
  matieres: Object.fromEntries(MATIERES.map((m) => [m.id, { name: m.name, blurb: m.blurb, alt: m.alt }])) as Record<
    MatiereId,
    MatiereText
  >,
  matiereGroups: Object.fromEntries(MATIERE_GROUPS.map((g) => [g, g])) as SchoolContent['matiereGroups'],
};
