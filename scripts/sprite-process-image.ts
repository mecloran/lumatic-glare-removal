#!/usr/bin/env npx tsx
/**
 * Runs INSIDE a sprite to process a single image through Gemini.
 *
 * Expects:
 *   /tmp/input/glare.jpg        (required)
 *   /tmp/input/clear.jpg        (optional — reference image)
 *
 * Produces:
 *   /tmp/output/gemini_result.jpg
 *
 * Outputs base64-encoded result to stdout prefixed with "BASE64_RESULT:"
 * so the orchestrator can capture it without needing file download.
 *
 * Usage: DISPLAY=:99 npx tsx /app/sprite-process-image.ts [--with-reference]
 */

import { chromium, BrowserContext, Page } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const INPUT_DIR = '/tmp/input';
const OUTPUT_DIR = '/tmp/output';
const CHROME_PATH = '/home/sprite/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

const PROMPT_WITH_REFERENCE =
  'Edit the first image to remove the glare from the glasses. Use the second image as reference for the eyes. Keep everything else exactly the same.';

const PROMPT_WITHOUT_REFERENCE =
  'Edit this image to remove the glare from the glasses. Keep everything else exactly the same.';

const PROCESS_TIMEOUT = 180000; // 3 minutes

async function main() {
  const hasReference = process.argv.includes('--with-reference');
  const glarePath = path.join(INPUT_DIR, 'glare.jpg');
  const clearPath = path.join(INPUT_DIR, 'clear.jpg');
  const outputPath = path.join(OUTPUT_DIR, 'gemini_result.jpg');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Verify input exists
  try {
    await fs.access(glarePath);
  } catch {
    console.error('ERROR: /tmp/input/glare.jpg not found');
    process.exit(1);
  }

  const imagePaths = [glarePath];
  let prompt = PROMPT_WITHOUT_REFERENCE;

  if (hasReference) {
    try {
      await fs.access(clearPath);
      imagePaths.push(clearPath);
      prompt = PROMPT_WITH_REFERENCE;
      console.log('Mode: with reference image');
    } catch {
      console.log('Reference image not found, proceeding without');
    }
  } else {
    console.log('Mode: without reference image');
  }

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT: Process exceeded 3 minutes')), PROCESS_TIMEOUT);
  });

  const processPromise = (async () => {
    // Launch Chromium with persistent context to reuse the saved Google login.
    // The checkpoint preserves /home/sprite/chrome-profile with cookies & session data.
    context = await chromium.launchPersistentContext('/home/sprite/chrome-profile', {
      executablePath: CHROME_PATH,
      headless: false, // needs DISPLAY for Gemini's UI
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-features=VizDisplayCompositor',
        '--window-size=1280,1024',
      ],
    });

    page = await context.newPage();

    // Navigate to Gemini
    console.log('Navigating to Gemini...');
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Click "Create image" if visible
    const createImageBtn = page.locator('button:has-text("Create image"), button[aria-label*="Create image"]');
    if (await createImageBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createImageBtn.click();
      await page.waitForTimeout(2000);
      console.log('Clicked Create image');
    }

    // Upload image(s)
    console.log('Uploading images...');
    const uploadBtn = page.locator(
      'button[aria-label="Open upload file menu"], button[aria-label*="upload"], button[aria-label*="Add"]'
    );
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadBtn.click();
      await page.waitForTimeout(500);

      const uploadFileOpt = page.locator(
        'button:has-text("Upload file"), [role="menuitem"]:has-text("Upload")'
      );
      if (await uploadFileOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          uploadFileOpt.click(),
        ]);
        await fileChooser.setFiles(imagePaths);
        console.log(`Uploaded ${imagePaths.length} file(s)`);
        await page.waitForTimeout(3000);
      }
    }

    // Enter prompt
    console.log('Entering prompt...');
    const inputArea = page
      .locator('[aria-label="Enter a prompt here"], [contenteditable="true"], textarea')
      .first();

    if (await inputArea.isVisible({ timeout: 5000 })) {
      await inputArea.click();
      await page.waitForTimeout(300);
      await inputArea.pressSequentially(prompt, { delay: 10 });
      await page.waitForTimeout(500);
      console.log('Entered prompt');
    } else {
      throw new Error('Input area not found');
    }

    // Submit
    console.log('Submitting...');
    const sendBtn = page.locator('button[aria-label="Send message"]');
    try {
      await sendBtn.waitFor({ state: 'visible', timeout: 5000 });
      await sendBtn.click();
      console.log('Submitted');
    } catch {
      await inputArea.press('Enter');
      console.log('Submitted via Enter');
    }

    await page.waitForTimeout(2000);

    // Wait for response
    console.log('Waiting for response...');
    const initialImageCount = await page.locator('img').count();
    await page.waitForTimeout(5000);

    const startTime = Date.now();
    const responseTimeout = 90000;

    while (Date.now() - startTime < responseTimeout) {
      const isGenerating =
        (await page
          .locator('[aria-label*="Stop"], .loading-indicator, [class*="loading"], [class*="generating"]')
          .count()) > 0;

      const currentImageCount = await page.locator('img').count();
      const newImages = currentImageCount - initialImageCount;

      const responseImages = await page
        .locator('.model-response-text img, .response-container img, [data-message-author-role="model"] img')
        .count();

      const promptInput = page
        .locator('[aria-label="Enter a prompt here"], [placeholder*="prompt"], [contenteditable="true"]')
        .first();
      const inputReady = await promptInput.isVisible().catch(() => false);

      if (!isGenerating && (newImages > 0 || responseImages > 0) && inputReady) {
        console.log('Response complete');
        await page.waitForTimeout(3000);
        break;
      }

      console.log(`Waiting... images: ${currentImageCount} (${newImages} new), generating: ${isGenerating}`);
      await page.waitForTimeout(5000);
    }

    // Download generated image — try all methods
    let downloaded = false;

    // Method 1: Hover to reveal download icon
    const allImages = page.locator('img');
    const imgCount = await allImages.count();

    for (let i = imgCount - 1; i >= 0 && !downloaded; i--) {
      const img = allImages.nth(i);
      const box = await img.boundingBox().catch(() => null);
      if (!box || box.width < 150 || box.height < 150) continue;

      await img.hover();
      await page.waitForTimeout(1000);

      const downloadBtn = page.locator(
        'button[aria-label*="ownload"], button[data-tooltip*="ownload"], [aria-label*="ownload"]'
      );
      if ((await downloadBtn.count()) > 0) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            downloadBtn.first().click(),
          ]);
          const dlPath = await download.path();
          if (dlPath) {
            await fs.copyFile(dlPath, outputPath);
            downloaded = true;
            console.log('Downloaded via hover icon');
          }
        } catch {
          // try next method
        }
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Method 2: Direct download button
    if (!downloaded) {
      const downloadBtn = page.locator(
        'button[aria-label*="Download"], button[aria-label*="download"], button:has-text("Download")'
      );
      if ((await downloadBtn.count()) > 0) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }),
            downloadBtn.first().click(),
          ]);
          const dlPath = await download.path();
          if (dlPath) {
            await fs.copyFile(dlPath, outputPath);
            downloaded = true;
            console.log('Downloaded via button');
          }
        } catch {
          // try next
        }
      }
    }

    // Method 3: Fetch image src
    if (!downloaded) {
      for (let i = imgCount - 1; i >= 0 && !downloaded; i--) {
        const img = allImages.nth(i);
        const box = await img.boundingBox().catch(() => null);
        if (!box || box.width < 150 || box.height < 150) continue;

        const imgData = await page.evaluate(async (index: number) => {
          const images = document.querySelectorAll('img');
          const img = images[index] as HTMLImageElement;
          if (!img || img.naturalWidth < 150) return null;
          const src = img.src;
          if (!src || src.startsWith('data:')) return null;
          try {
            const response = await fetch(src, { credentials: 'include' });
            if (!response.ok) return null;
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise<string | null>((resolve) => {
              reader.onload = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl.split(',')[1]);
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          } catch {
            return null;
          }
        }, i);

        if (imgData) {
          const buffer = Buffer.from(imgData, 'base64');
          if (buffer.length > 30000) {
            await fs.writeFile(outputPath, buffer);
            downloaded = true;
            console.log(`Downloaded via fetch (${Math.round(buffer.length / 1024)}KB)`);
          }
        }
      }
    }

    // Method 4: Canvas extraction
    if (!downloaded) {
      for (let i = imgCount - 1; i >= 0 && !downloaded; i--) {
        const img = allImages.nth(i);
        const box = await img.boundingBox().catch(() => null);
        if (!box || box.width < 150 || box.height < 150) continue;

        const data = await page.evaluate(async (index: number) => {
          const images = document.querySelectorAll('img');
          const img = images[index] as HTMLImageElement;
          if (!img || img.naturalWidth < 150) return null;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          try {
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
          } catch {
            return null;
          }
        }, i);

        if (data) {
          const buffer = Buffer.from(data, 'base64');
          if (buffer.length > 30000) {
            await fs.writeFile(outputPath, buffer);
            downloaded = true;
            console.log(`Downloaded via canvas (${Math.round(buffer.length / 1024)}KB)`);
          }
        }
      }
    }

    if (!downloaded) {
      throw new Error('Could not download generated image');
    }

    // Remove Gemini visible watermark (sparkle icon in bottom-right)
    console.log('Removing Gemini watermark...');
    try {
      const wmResult = execSync(
        `GeminiWatermarkTool -i "${outputPath}" -o "${outputPath}" -v 2>&1`,
        { encoding: 'utf-8', timeout: 15000 }
      );
      console.log(wmResult.replace(/\x1b\[[0-9;]*m/g, '').trim()); // strip ANSI colors
    } catch (err) {
      console.log('Watermark removal skipped (tool not found or no watermark detected)');
    }

    // Output the result as base64 so orchestrator can capture it
    const resultBuffer = await fs.readFile(outputPath);
    console.log(`\nBASE64_RESULT:${resultBuffer.toString('base64')}`);
    console.log('SUCCESS');
  })();

  try {
    await Promise.race([processPromise, timeoutPromise]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

main();
