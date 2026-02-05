import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query.path;

  // Debug: log the request
  console.log('Thumbnail request:', { pathParam, cwd: process.cwd() });

  if (!pathParam || !Array.isArray(pathParam) || pathParam.length < 3) {
    return res.status(400).json({ error: 'Invalid path', received: pathParam });
  }

  const [category, folder, filename] = pathParam;

  // Security: validate category
  if (!['with_reference', 'without_reference'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  // Try multiple possible paths for the image
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'images', category, folder, filename),
    path.join(process.cwd(), '.vercel', 'output', 'static', 'images', category, folder, filename),
    path.join('/var/task', 'public', 'images', category, folder, filename),
    path.join('/var/task', 'images', category, folder, filename),
  ];

  let sourcePath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    // List directories to debug
    const debugInfo = {
      cwd: process.cwd(),
      cwdContents: fs.existsSync(process.cwd()) ? fs.readdirSync(process.cwd()) : 'not found',
      varTask: fs.existsSync('/var/task') ? fs.readdirSync('/var/task') : 'not found',
      triedPaths: possiblePaths
    };
    return res.status(404).json({ error: 'Image not found', debug: debugInfo });
  }

  try {
    const thumbnail = await sharp(sourcePath)
      .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(thumbnail);
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    res.status(500).json({ error: 'Failed to generate thumbnail', details: String(err) });
  }
}
