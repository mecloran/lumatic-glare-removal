import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query.path;

  if (!pathParam || !Array.isArray(pathParam) || pathParam.length < 3) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const [category, folder, filename] = pathParam;

  // Security: validate category
  if (!['with_reference', 'without_reference'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const publicDir = path.join(process.cwd(), 'public');
  const sourcePath = path.join(publicDir, 'images', category, folder, filename);

  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  try {
    // Generate thumbnail on-the-fly
    const thumbnail = await sharp(sourcePath)
      .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(thumbnail);
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
}
