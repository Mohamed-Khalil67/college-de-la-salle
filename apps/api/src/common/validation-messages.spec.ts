import { describe, expect, it } from 'vitest';
import { validationMessages } from './validation-messages.js';

describe('validationMessages', () => {
  it('replaces class-validator English defaults with French sentences naming the field', () => {
    expect(
      validationMessages([
        { property: 'email', constraints: { isEmail: 'email must be an email' } },
        { property: 'extra', constraints: { whitelistValidation: 'property extra should not exist' } },
        { property: 'title', constraints: { maxLength: 'title must be shorter than or equal to 120 characters' } },
        { property: 'count', constraints: { min: 'count must not be less than 1' } },
      ]),
    ).toEqual([
      '« email » doit être une adresse e-mail valide.',
      'Le champ « extra » n’est pas accepté.',
      '« title » doit contenir au plus 120 caractères.',
      '« count » doit valoir au moins 1.',
    ]);
  });

  it('keeps a message written in French by the DTO', () => {
    expect(
      validationMessages([{ property: 'password', constraints: { minLength: 'Mot de passe trop court.' } }]),
    ).toEqual(['Mot de passe trop court.']);
  });

  it('walks nested errors with a dotted path and has a French fallback for unknown constraints', () => {
    expect(
      validationMessages([
        {
          property: 'items',
          children: [{ property: '0', children: [{ property: 'name', constraints: { isFancy: 'name must be fancy' } }] }],
        },
      ]),
    ).toEqual(['« items.0.name » n’est pas valide.']);
  });
});
