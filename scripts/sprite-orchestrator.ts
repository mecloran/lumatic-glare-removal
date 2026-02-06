#!/usr/bin/env npx tsx
/**
 * Orchestrator: runs locally and manages sprites to process images in parallel.
 *
 * For each unprocessed image set:
 *   1. Restores the gemini-glare sprite from checkpoint v1 (logged-in state)
 *   2. Starts Xvfb on the sprite
 *   3. Kills the old Chrome, uploads image(s), runs the processor script
 *   4. Captures the base64-encoded result from stdout
 *   5. Saves gemini_result.jpg locally
 *
 * Because sprites.dev checkpoints restore the full VM, we reuse the single
 * "gemini-glare" sprite by restoring between each image (sequential processing).
 *
 * Usage:
 *   npx tsx scripts/sprite-orchestrator.ts                    # process all unprocessed
 *   npx tsx scripts/sprite-orchestrator.ts --dry-run          # list what would be processed
 *   npx tsx scripts/sprite-orchestrator.ts --set 001_Adams... # process a single set
 */

import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import fs from 'fs';
import path from 'path';

const SPRITE_NAME = 'gemini-glare';
const CHECKPOINT_ID = 'v3';
const TEST_SET_PATH = path.resolve(import.meta.dirname!, '../raw_examples/test_set');
const CHROME_PATH = '/home/sprite/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const PROCESS_SCRIPT = '/app/sprite-process-image.ts';

const execOpts: ExecSyncOptionsWithStringEncoding = {
  encoding: 'utf-8',
  timeout: 300000, // 5 min per command
  maxBuffer: 50 * 1024 * 1024, // 50MB for base64 output
};

function sprite(cmd: string, timeout = 300000): string {
  const fullCmd = `sprite exec -s ${SPRITE_NAME} bash -c "${cmd.replace(/"/g, '\\"')}"`;
  try {
    return execSync(fullCmd, { ...execOpts, timeout }).toString().trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    console.error(`  sprite exec failed: ${e.message}`);
    return e.stdout?.toString() || '';
  }
}

function spriteCmd(args: string, timeout = 60000): string {
  try {
    return execSync(`sprite ${args}`, { ...execOpts, timeout }).toString().trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    console.error(`  sprite command failed: ${e.message}`);
    return e.stdout?.toString() || '';
  }
}

interface ImageSet {
  folder: string;
  fullPath: string;
  category: 'with_reference' | 'without_reference';
  hasReference: boolean;
}

function findUnprocessedSets(): ImageSet[] {
  const sets: ImageSet[] = [];

  for (const category of ['with_reference', 'without_reference'] as const) {
    const catPath = path.join(TEST_SET_PATH, category);
    if (!fs.existsSync(catPath)) continue;

    const folders = fs.readdirSync(catPath).sort();
    for (const folder of folders) {
      const folderPath = path.join(catPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const files = fs.readdirSync(folderPath);
      const hasGlare = files.some((f) => f.startsWith('glare') && f.endsWith('.jpg'));
      const hasResult = files.some((f) => f.startsWith('gemini_result'));

      if (hasGlare && !hasResult) {
        sets.push({
          folder,
          fullPath: folderPath,
          category,
          hasReference: category === 'with_reference',
        });
      }
    }
  }

  return sets;
}

async function restoreCheckpoint(): Promise<void> {
  console.log(`  Restoring checkpoint ${CHECKPOINT_ID}...`);
  spriteCmd(`restore -s ${SPRITE_NAME} ${CHECKPOINT_ID}`, 60000);
  // Give the sprite a moment to fully restore
  await new Promise((r) => setTimeout(r, 3000));
}

async function prepareSprite(): Promise<void> {
  // Kill any existing Chrome from the checkpoint restore
  sprite('killall chrome 2>/dev/null; sleep 1; echo ready', 15000);

  // Ensure Xvfb is running
  const xvfbRunning = sprite('ps aux | grep Xvfb | grep -v grep | wc -l', 10000);
  if (xvfbRunning === '0') {
    sprite('Xvfb :99 -screen 0 1280x1024x24 & sleep 1 && echo xvfb_started', 15000);
  }

  // Ensure /tmp/input and /tmp/output exist
  sprite('mkdir -p /tmp/input /tmp/output', 10000);
  // Clean previous input/output
  sprite('rm -f /tmp/input/* /tmp/output/*', 10000);
}

function uploadFile(localPath: string, remoteName: string): void {
  const remoteDir = '/tmp/input';
  execSync(
    `sprite exec -s ${SPRITE_NAME} -file "${localPath}:${remoteDir}/${remoteName}" echo "uploaded ${remoteName}"`,
    execOpts
  );
}

async function processSet(set: ImageSet): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${set.folder} (${set.category})`);
  console.log('='.repeat(60));

  // 1. Restore checkpoint
  await restoreCheckpoint();

  // 2. Prepare sprite environment
  await prepareSprite();

  // 3. Upload images
  const files = fs.readdirSync(set.fullPath);
  const glareFile = files.find((f) => f.startsWith('glare') && f.endsWith('.jpg'));
  if (!glareFile) {
    console.error('  No glare image found, skipping');
    return false;
  }

  console.log(`  Uploading ${glareFile}...`);
  uploadFile(path.join(set.fullPath, glareFile), 'glare.jpg');

  if (set.hasReference) {
    const clearFile = files.find((f) => f.startsWith('clear') && f.endsWith('.jpg'));
    if (clearFile) {
      console.log(`  Uploading ${clearFile}...`);
      uploadFile(path.join(set.fullPath, clearFile), 'clear.jpg');
    }
  }

  // 4. Run the processor script
  console.log('  Running Gemini processing...');
  const refFlag = set.hasReference ? ' --with-reference' : '';
  const output = sprite(
    `export DISPLAY=:99 && cd /app && npx tsx ${PROCESS_SCRIPT}${refFlag} 2>&1`,
    240000 // 4 min timeout
  );

  console.log('  --- Script output ---');
  // Print output but skip the huge base64 line
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.startsWith('BASE64_RESULT:')) {
      console.log('  [base64 data captured]');
    } else {
      console.log(`  ${line}`);
    }
  }

  // 5. Extract base64 result
  const b64Line = lines.find((l) => l.startsWith('BASE64_RESULT:'));
  if (!b64Line) {
    console.error('  FAILED: No base64 result in output');
    return false;
  }

  const b64Data = b64Line.replace('BASE64_RESULT:', '');
  const buffer = Buffer.from(b64Data, 'base64');

  if (buffer.length < 30000) {
    console.error(`  FAILED: Result too small (${buffer.length} bytes)`);
    return false;
  }

  // 6. Save locally
  const outputPath = path.join(set.fullPath, 'gemini_result.jpg');
  fs.writeFileSync(outputPath, buffer);
  console.log(`  SUCCESS: Saved ${outputPath} (${Math.round(buffer.length / 1024)}KB)`);

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const singleSet = args.find((a, i) => args[i - 1] === '--set');

  console.log('Sprite Gemini Orchestrator');
  console.log('='.repeat(60));

  // Find unprocessed sets
  let sets = findUnprocessedSets();

  if (singleSet) {
    sets = sets.filter((s) => s.folder.includes(singleSet));
    if (sets.length === 0) {
      console.log(`No unprocessed set matching "${singleSet}" found.`);
      process.exit(0);
    }
  }

  console.log(`Found ${sets.length} unprocessed image set(s):`);
  for (const set of sets) {
    console.log(`  - ${set.category}/${set.folder}`);
  }

  if (dryRun) {
    console.log('\n(dry run — not processing)');
    process.exit(0);
  }

  if (sets.length === 0) {
    console.log('Nothing to process!');
    process.exit(0);
  }

  // Process sequentially (restoring checkpoint between each)
  let success = 0;
  let failed = 0;

  for (const set of sets) {
    const ok = await processSet(set);
    if (ok) success++;
    else failed++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! ${success} succeeded, ${failed} failed out of ${sets.length} total.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
