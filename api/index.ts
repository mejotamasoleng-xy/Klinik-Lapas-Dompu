import type { Request, Response } from 'express';
import app from '../server.ts';

export default function handler(req: Request, res: Response) {
  const requestUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const originalPath = requestUrl.searchParams.get('__v0_path');

  if (originalPath?.startsWith('/api/')) {
    requestUrl.searchParams.delete('__v0_path');
    req.url = `${originalPath}${requestUrl.search}`;
  }

  return app(req, res);
}
