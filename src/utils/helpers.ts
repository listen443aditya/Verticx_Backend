// src/utils/helpers.ts

/**
 * Generates a simple random string to be used as a temporary password.
 * @param length The desired length of the password.
 * @returns A random string.
 */
export const generatePassword = (length = 8): string => {
  return Math.random().toString(36).slice(-length);
};
