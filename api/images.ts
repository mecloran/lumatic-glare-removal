import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

interface ImageSet {
  id: string;
  name: string;
  images: {
    clear: string | null;
    glare: string | null;
    humanEdited: string | null;
    geminiResult: string | null;
  };
}

interface ImagesResponse {
  withReference: ImageSet[];
  withoutReference: ImageSet[];
}

function extractName(folderId: string): string {
  const parts = folderId.split('_');
  if (parts.length >= 3) {
    const lastName = parts[1];
    const firstName = parts[2];
    return `${lastName}, ${firstName}`;
  }
  return folderId;
}

function getImageSets(imagesPath: string, category: 'with_reference' | 'without_reference'): ImageSet[] {
  const categoryPath = path.join(imagesPath, category);
  const sets: ImageSet[] = [];

  try {
    const folders = fs.readdirSync(categoryPath);

    for (const folder of folders.sort()) {
      const folderPath = path.join(categoryPath, folder);
      const stat = fs.statSync(folderPath);

      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(folderPath);
      const imagePrefix = `/images/${category}/${folder}`;

      const findImage = (patterns: string[]): string | null => {
        for (const pattern of patterns) {
          const match = files.find(f => f.toLowerCase().startsWith(pattern.toLowerCase()));
          if (match) return `${imagePrefix}/${match}`;
        }
        return null;
      };

      sets.push({
        id: folder,
        name: extractName(folder),
        images: {
          clear: findImage(['clear']),
          glare: findImage(['glare']),
          humanEdited: findImage(['human_edited']),
          geminiResult: findImage(['gemini_result'])
        }
      });
    }
  } catch (err) {
    console.error(`Error reading ${category}:`, err);
  }

  return sets;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // In Vercel, public folder is at the root after build
  const imagesPath = path.join(process.cwd(), 'public', 'images');

  const withReference = getImageSets(imagesPath, 'with_reference');
  const withoutReference = getImageSets(imagesPath, 'without_reference');

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json({ withReference, withoutReference } as ImagesResponse);
}
