import type { Credentials } from './use-session';

export type FieldErrors = Partial<Record<keyof Credentials, string>>;

export function validateCredentials(mode: 'login' | 'register', fields: Credentials): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[a-zA-Z]{4}it\d{2}$/i.test(fields.userid.trim())) {
    errors.userid = 'Verwende 4 Buchstaben, „it“ und 2 Ziffern, z. B. abcdit01.';
  }
  if (!fields.password) errors.password = 'Bitte gib dein Passwort ein.';
  else if (mode === 'register' && fields.password.length < 6) errors.password = 'Verwende mindestens 6 Zeichen.';
  if (mode === 'register') {
    if (fields.nickname.trim().length < 2 || fields.nickname.trim().length > 30) errors.nickname = 'Verwende 2 bis 30 Zeichen für den Anzeigenamen.';
    if (fields.fullname.trim().length < 2 || fields.fullname.trim().length > 30) errors.fullname = 'Verwende 2 bis 30 Zeichen für Vor- und Nachname.';
  }
  return errors;
}
