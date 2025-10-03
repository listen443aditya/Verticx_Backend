import jwt from 'jsonwebtoken';
import { User } from './types/api'; // Ensure you have a User type defined

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "Lq9w1fe&hbA//=r5H%l=+WSG*^7@j@Ncw7+B!mp=m@t^Qi^CNaf@uKBf@vu2fiJv@$ih$oQRcpLlo%gJ2de7tT!C*/GY$Lp5yyfpDPyQAJnZkn/7zHNeTd16S6COSpMW";
const JWT_EXPIRES_IN = '7d';

/**
 * Generates a JWT for a given user.
 * @param user - The user object to encode in the token.
 * @returns The generated JSON Web Token.
 */
export const generateToken = (user: User): string => {
  const payload = {
    id: user.id,
    role: user.role,
    branchId: user.branchId,
    name: user.name,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * Verifies a JWT.
 * @param token - The token to verify.
 * @returns The decoded payload if the token is valid, otherwise throws an error.
 */
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error("Invalid token:", error);
    throw new Error('Invalid or expired token.');
  }
};
