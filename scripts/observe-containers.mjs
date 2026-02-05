#!/usr/bin/env node
/**
 * observe-containers.mjs — Periodically capture screenshots of running containers
 *
 * This script monitors containers via an API and captures screenshots of their
 * viewer URLs. It's useful for visual monitoring of containerized applications.
 *
 * Usage:
 *   node scripts/observe-containers.mjs [OPTIONS]
 *
 * Options:
 *   --api URL       API endpoint for container listing (default: http://localhost:3128)
 *   --out DIR       Output directory for screenshots (default: data/observer)
 *   --interval MS   Polling interval in milliseconds (default: 10000)
 *   --timeout MS    Page load timeout in milliseconds (default: 12000)
 *   --limit N       Max containers to process per cycle (0 = unlimited)
 *   --watch         Run continuously (default: single capture)
 *   --help          Show help
 *
 * Requirements:
 *   npm install @playwright/test
 *   npx playwright install chromium
 *
 * API Response Format (expected):
 *   { "containers": [{ "id": "...", "state": "running", "viewer_url": "http://...", "viewer_kind": "web" }] }
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

// Dynamic import for playwright
let chromium

const args = process.argv.slice(2)

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
observe-containers.mjs — Periodically capture screenshots of running containers

Usage:
  node scripts/observe-containers.mjs [OPTIONS]

Options:
  --api URL       API endpoint for container listing (default: http://localhost:3128)
  --out DIR       Output directory for screenshots (default: data/observer)
  --interval MS   Polling interval in milliseconds (default: 10000)
  --timeout MS    Page load timeout in milliseconds (default: 12000)
  --limit N       Max containers to process per cycle (0 = unlimited)
  --watch         Run continuously (default: single capture)

Examples:
  node scripts/observe-containers.mjs --watch
  node scripts/observe-containers.mjs --api http://localhost:8080/api --out ./screenshots
`)
  process.exit(0)
}

// Helper to get argument value
const getArg = (key, fallback) => {
  const index = args.indexOf(`--${key}`)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

// Helper to check for flag
const hasFlag = (key) => args.includes(`--${key}`)

// Configuration
const apiBase = getArg('api', 'http://localhost:3128')
const outputRoot = getArg('out', 'data/observer')
const intervalMs = Number(getArg('interval', '10000'))
const timeoutMs = Number(getArg('timeout', '12000'))
const limit = Number(getArg('limit', '0'))
const watch = hasFlag('watch')
const minIntervalMs = 10000

// State tracking to avoid duplicate screenshots
const stateByContainer = new Map()

// Check if value is a valid HTTP URL
const isHttpUrl = (value) =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))

// Find VNC frame in page (for VNC viewers embedded in HTML)
const findVncFrame = (page) => {
  return page
    .frames()
    .find((frame) => frame.name() === 'vncFrame' || frame.url().includes('vnc.html'))
}

// Wait for VNC canvas to have content
const waitForVncReady = async (page) => {
  const frame = findVncFrame(page)
  const scope = frame || page
  const deadline = Date.now() + Math.min(timeoutMs, 8000)

  try {
    await scope.waitForSelector('#noVNC_status', { timeout: 2000 })
  } catch {
    // No-op: some viewers may not use the status element
  }

  while (Date.now() < deadline) {
    let ready = true
    try {
      ready = await scope.evaluate(() => {
        const statusEl = document.querySelector('#noVNC_status')
        const statusText = (statusEl?.textContent || '').toLowerCase()
        if (statusText.includes('connecting')) return false

        const canvas = document.querySelector('#noVNC_canvas')
        if (!canvas) return true

        const ctx = canvas.getContext('2d')
        if (!ctx || !canvas.width || !canvas.height) return false

        // Sample a few points to check if canvas has content
        const points = [
          [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
          [10, 10],
          [canvas.width - 10, canvas.height - 10],
        ]

        for (const [x, y] of points) {
          const data = ctx.getImageData(x, y, 1, 1).data
          const brightness = data[0] + data[1] + data[2]
          if (brightness > 20) return true
        }
        return false
      })
    } catch {
      ready = true
    }

    if (ready) return
    await page.waitForTimeout(500)
  }
}

// Fetch container list from API
const fetchContainers = async () => {
  const response = await fetch(`${apiBase}/containers?all=1`)
  if (!response.ok) {
    throw new Error(`api_${response.status}`)
  }
  const data = await response.json()
  return Array.isArray(data.containers) ? data.containers : []
}

// Capture screenshot for a single container
const captureForContainer = async (browser, container) => {
  // Skip non-running containers
  if (container.state !== 'running') return false

  // Skip containers without valid viewer URL
  if (!isHttpUrl(container.viewer_url)) return false

  // Skip VNC viewers (they require special handling)
  if (container.viewer_kind === 'vnc') return false

  const now = Date.now()
  const state = stateByContainer.get(container.id) || { lastHash: null, lastSavedAt: 0 }

  // Rate limit: don't capture too frequently
  if (state.lastSavedAt && now - state.lastSavedAt < minIntervalMs) {
    return false
  }

  const targetDir = path.join(outputRoot, container.id)
  fs.mkdirSync(targetDir, { recursive: true })
  const filePath = path.join(targetDir, 'latest.jpg')

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  try {
    await page.goto(container.viewer_url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })

    // Wait for page to settle
    await page.waitForTimeout(1200)
    await waitForVncReady(page)

    // Capture screenshot
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70 })

    // Check if content has changed
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    if (state.lastHash && state.lastHash === hash) {
      return false
    }

    // Double-check rate limit
    if (state.lastSavedAt && now - state.lastSavedAt < minIntervalMs) {
      return false
    }

    // Save screenshot
    fs.writeFileSync(filePath, buffer)
    stateByContainer.set(container.id, { lastHash: hash, lastSavedAt: now })

    console.log(`Captured: ${container.id} -> ${filePath}`)
    return true

  } catch (error) {
    console.error(`snapshot_failed ${container.id}: ${error.message}`)
    return false
  } finally {
    await page.close()
  }
}

// Single capture cycle
const captureOnce = async () => {
  const containers = await fetchContainers()
  const candidates = limit > 0 ? containers.slice(0, limit) : containers

  if (!candidates.length) {
    console.log('No containers found')
    return
  }

  const browser = await chromium.launch()
  let captured = 0

  try {
    for (const container of candidates) {
      if (await captureForContainer(browser, container)) {
        captured += 1
      }
    }
  } finally {
    await browser.close()
  }

  if (captured) {
    console.log(`Cycle complete: ${captured} screenshots updated`)
  } else {
    console.log('Cycle complete: no changes detected')
  }
}

// Main run loop
const run = async () => {
  // Check playwright dependency
  try {
    const playwright = await import('@playwright/test')
    chromium = playwright.chromium
  } catch {
    console.error('Error: @playwright/test not installed.')
    console.error('Run: npm install @playwright/test && npx playwright install chromium')
    process.exit(1)
  }

  console.log(`Observer starting...`)
  console.log(`  API: ${apiBase}`)
  console.log(`  Output: ${outputRoot}`)
  console.log(`  Mode: ${watch ? 'continuous' : 'single'}`)
  if (watch) console.log(`  Interval: ${intervalMs}ms`)
  console.log('')

  // Create output directory
  fs.mkdirSync(outputRoot, { recursive: true })

  let running = false

  while (true) {
    if (!running) {
      running = true
      try {
        await captureOnce()
      } catch (error) {
        console.error(`Observer error: ${error.message}`)
      } finally {
        running = false
      }
    }

    if (!watch) break
    await delay(intervalMs)
  }
}

run().catch((err) => {
  console.error(`Fatal error: ${err.message}`)
  process.exit(1)
})
