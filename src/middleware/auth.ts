import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../lib/auth-server.ts';

export async function requireAuthenticatedSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }

    if (session.user.mustChangePassword) {
      res.status(428).json({ error: 'Kata sandi awal harus diganti sebelum menggunakan aplikasi.' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
  }
}
