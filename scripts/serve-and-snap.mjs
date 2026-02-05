#!/usr/bin/env node
/**
 * serve-and-snap.mjs — Start a dev server and capture a screenshot
 *
 * Usage:
 *   node scripts/serve-and-snap.mjs [OPTIONS]
 *
 * Options:
 *   --port PORT     Port to use (default: from .claude/port or 3000)
 *   --url URL       URL to screenshot (default: http://localhost:PORT)
 *   --cmd CMD       Command to start the dev server (optional)
 *   --timeout MS    Timeout in milliseconds (default: 180000)
 *   --output DIR    Output directory (default: .claude/screenshots)
 *   --fullpage      Capture full page (default: true)
 *   --width NUM     Viewport width (default: 1280)
 *   --height NUM    Viewport height (default: 800)
 *   --help          Show help
 *
 * Examples:
 *   node scripts/serve-and-snap.mjs --cmd "npm run dev"
 *   node scripts/serve-and-snap.mjs --port 3000 --url http://localhost:3000
 *   node scripts/serve-and-snap.mjs --url http://localhost:3000/dashboard
 *
 * Requirements:
 *   npm install wait-on @playwright/test
 *   npx playwright install chromium
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Dynamic imports for optional dependencies
let waitOn, chromium

const args = process.argv.slice(2)

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
serve-and-snap.mjs — Start a dev server and capture a screenshot

Usage:
  node scripts/serve-and-snap.mjs [OPTIONS]

Options:
  --port PORT     Port to use (default: from .claude/port or 3000)
  --url URL       URL to screenshot (default: http://localhost:PORT)
  --cmd CMD       Command to start the dev server (optional)
  --timeout MS    Timeout in milliseconds (default: 180000)
  --output DIR    Output directory (default: .claude/screenshots)
  --fullpage      Capture full page (default: true)
  --width NUM     Viewport width (default: 1280)
  --height NUM    Viewport height (default: 800)

Examples:
  node scripts/serve-and-snap.mjs --cmd "npm run dev"
  node scripts/serve-and-snap.mjs --port 3000 --url http://localhost:3000
`)
  process.exit(0)
}

// Helper to get argument value
const getArg = (key, defaultValue = '') => {
  const index = args.indexOf(`--${key}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : defaultValue
}

// Helper to check for flag
const hasFlag = (key) => args.includes(`--${key}`)

// Determine port: CLI --port > .claude/port > .claude/ports.json.app > env PORT > 3000
let port = getArg('port', '')
if (!port && fs.existsSync('.claude/port')) {
  try {
    port = String(parseInt(fs.readFileSync('.claude/port', 'utf8').trim(), 10))
  } catch { /* ignore */ }
}
if (!port && fs.existsSync('.claude/ports.json')) {
  try {
    const ports = JSON.parse(fs.readFileSync('.claude/ports.json', 'utf8'))
    port = String(ports.app || '')
  } catch { /* ignore */ }
}
if (!port && process.env.PORT) port = process.env.PORT
if (!port) port = '3000'

// Configuration
let url = getArg('url', '')
if (!url) url = `http://localhost:${port}`

const cmd = getArg('cmd', '')
const timeoutMs = Number(getArg('timeout', '180000'))
const outDir = getArg('output', '.claude/screenshots')
const fullPage = !hasFlag('nofullpage')
const viewportWidth = Number(getArg('width', '1280'))
const viewportHeight = Number(getArg('height', '800'))

const logDir = '.claude/logs'
const pidDir = '.claude/pids'

// Create directories
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(logDir, { recursive: true })
fs.mkdirSync(pidDir, { recursive: true })

// Check dependencies
async function checkDependencies() {
  try {
    waitOn = (await import('wait-on')).default
  } catch {
    console.error('Error: wait-on not installed. Run: npm install wait-on')
    process.exit(1)
  }

  try {
    const playwright = await import('@playwright/test')
    chromium = playwright.chromium
  } catch {
    console.error('Error: @playwright/test not installed. Run: npm install @playwright/test && npx playwright install chromium')
    process.exit(1)
  }
}

async function main() {
  await checkDependencies()

  let child = null
  let logFile = null

  // Start dev server if command provided
  if (cmd) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    logFile = path.join(logDir, `dev-${ts}.log`)
    const logStream = fs.createWriteStream(logFile, { flags: 'a' })

    // Write header to log
    logStream.write(`\n${'='.repeat(50)}\n`)
    logStream.write(`Started at: ${new Date().toISOString()}\n`)
    logStream.write(`Command: ${cmd}\n`)
    logStream.write(`Port: ${port}\n`)
    logStream.write(`${'='.repeat(50)}\n\n`)

    const isWin = process.platform === 'win32'
    const runner = isWin ? 'cmd.exe' : 'bash'
    const runnerArgs = isWin ? ['/d', '/s', '/c', cmd] : ['-lc', cmd]
    const env = { ...process.env, PORT: String(port) }

    console.log(`Starting: ${cmd}`)
    console.log(`Log file: ${logFile}`)

    child = spawn(runner, runnerArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })

    child.stdout.on('data', (chunk) => logStream.write(chunk))
    child.stderr.on('data', (chunk) => logStream.write(chunk))

    child.on('error', (err) => {
      console.error(`Failed to start server: ${err.message}`)
    })

    fs.writeFileSync(path.join(pidDir, 'dev.pid'), String(child.pid))
    console.log(`Server started with PID: ${child.pid}`)
  }

  try {
    // Wait for server to be ready
    console.log(`Waiting for ${url} to be ready...`)
    await waitOn({
      resources: [url],
      timeout: timeoutMs,
      interval: 500,
      validateStatus: (status) => status >= 200 && status < 500
    })
    console.log('Server is ready!')

    // Add a small delay for the page to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Launch browser and take screenshot
    console.log('Launching browser...')
    const browser = await chromium.launch()
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight }
    })

    console.log(`Navigating to ${url}...`)
    await page.goto(url, { waitUntil: 'networkidle' })

    // Additional wait for any animations/transitions
    await page.waitForTimeout(500)

    const timestamp = Date.now()
    const screenshotPath = path.join(outDir, `snap-${timestamp}.png`)

    console.log(`Taking screenshot...`)
    await page.screenshot({
      path: screenshotPath,
      fullPage: fullPage
    })

    await browser.close()
    console.log(`Screenshot saved: ${screenshotPath}`)

    // Output result as JSON for easy parsing
    const result = {
      url,
      port,
      screenshot: screenshotPath,
      log: logFile,
      timestamp: new Date().toISOString()
    }
    console.log('\nResult:')
    console.log(JSON.stringify(result, null, 2))

  } finally {
    // Clean up: stop the server if we started it
    if (child && child.pid) {
      console.log('\nStopping dev server...')
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'])
        } else {
          // Kill the process group
          process.kill(-child.pid, 'SIGTERM')
          // Give it a moment to shut down gracefully
          await new Promise((resolve) => setTimeout(resolve, 2000))
          // Force kill if still running
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch { /* already dead */ }
        }
        // Clean up PID file
        const pidFile = path.join(pidDir, 'dev.pid')
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile)
        }
        console.log('Server stopped.')
      } catch (err) {
        // Process may have already exited
        console.log(`Note: ${err.message}`)
      }
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
