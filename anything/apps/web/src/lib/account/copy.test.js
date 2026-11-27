import { describe, expect, it } from 'vitest';
import { passwordStrength, validatePassword } from '@/app/api/utils/passwordStrength';
import { ACCOUNT_COPY, SERVER_MESSAGES_ES, keepLang, legalUrlFor, serverMessage } from './copy';

const shape = (value) =>
  typeof value === 'string'
    ? 'string'
    : Array.isArray(value)
      ? value.map(shape)
      : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));

describe('account page copy', () => {
  it('has the same keys in English and Spanish, none of them empty', () => {
    expect(shape(ACCOUNT_COPY.es)).toEqual(shape(ACCOUNT_COPY.en));
    expect(JSON.stringify(ACCOUNT_COPY)).not.toContain('""');
  });

  it('names every password strength the meter can show', () => {
    expect(ACCOUNT_COPY.en.password.strength).toHaveLength(5);
    expect(ACCOUNT_COPY.en.password.strength[passwordStrength('Str0ng!Pass99').score]).toBe(passwordStrength('Str0ng!Pass99').label);
  });

  it('has Spanish for every sentence the password rule can return', () => {
    for (const password of ['', 'a', 'password']) {
      for (const error of validatePassword(password).errors) expect(SERVER_MESSAGES_ES[error], error).toBeTruthy();
    }
  });

  it('shows the server sentence in English, its Spanish in Spanish, and never English on a Spanish page', () => {
    const known = { error: 'Please enter your email address' };
    expect(serverMessage('en', known)).toBe(known.error);
    expect(serverMessage('es', known)).toBe('Ingresá tu email');
    expect(serverMessage('es', { error: 'Some new sentence' })).toBe(ACCOUNT_COPY.es.genericError);
    expect(serverMessage('es', {})).toBe(ACCOUNT_COPY.es.genericError);
    const limited = { error: 'slow down', message_en: 'slow down', message_es: 'más despacio' };
    expect(serverMessage('es', limited)).toBe('más despacio');
  });

  it('keeps an explicit language choice on account links and legal pages', () => {
    expect(keepLang('/account/signin', '')).toBe('/account/signin');
    expect(keepLang('/account/signin', '?lang=fr')).toBe('/account/signin');
    expect(keepLang('/account/signin', '?callbackUrl=%2Fx&lang=en')).toBe('/account/signin?lang=en');
    expect(legalUrlFor('https://x.test/terms', 'es')).toBe('https://x.test/terms');
    expect(legalUrlFor('https://x.test/terms', 'en')).toBe('https://x.test/terms?lang=en');
    expect(legalUrlFor('', 'en')).toBe('');
  });
});
