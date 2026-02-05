import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const THUMBNAIL_WIDTH = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { src } = req.query;

  if (!src || typeof src !== 'string') {
    return res.status(400).json({ error: 'Missing src parameter' });
  }

  // Parse the src path: /images/with_reference/folder/file.jpg
  const match = src.match(/^\/images\/(with_reference|without_reference)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image path' });
  }

  const [, category, folder, filename] = match;

  // In Vercel serverless, we need to fetch the image from our own static URL
  // since the public folder isn't directly accessible from serverless functions
  const imageUrl = `https://${req.headers.host}${src}`;

  try {
    // Fetch the original image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Generate thumbnail
    const thumbnail = await sharp(imageBuffer)
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
