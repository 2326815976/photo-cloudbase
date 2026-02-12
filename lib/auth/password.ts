import 'server-only';

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

