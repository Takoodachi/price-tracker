import type { User } from '@pricetracker/shared';
import type { CookieOptions, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { HttpError } from './errors';

declare global {
  namespace Express {
    interface Request {
      user: User | null;
    }
  }
}

/**
 * Sessions are a signed JWT in an httpOnly cookie: JavaScript on the page
 * (including any injected script) can't read it, unlike localStorage.
 * SameSite=Lax stops other sites from sending it with forged POSTs.
 */
const COOKIE = 'pt_session';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.COOKIE_SECURE,
  path: '/',
};

export function startSession(res: Response, user: User): void {
  const token = jwt.sign({ email: user.email }, config.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: MAX_AGE_MS / 1000,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: MAX_AGE_MS });
}

export function endSession(res: Response): void {
  res.clearCookie(COOKIE, cookieOptions);
}

/** Sets req.user from the session cookie (null when logged out or expired). */
export const attachUser: RequestHandler = (req, _res, next) => {
  req.user = null;
  const token: unknown = req.cookies?.[COOKIE];
  if (typeof token === 'string') {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (payload.sub && typeof payload.email === 'string') req.user = { id: Number(payload.sub), email: payload.email };
    } catch {
      // expired or tampered: treat as logged out
    }
  }
  next();
};

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.', 'unauthenticated'));
  next();
};
