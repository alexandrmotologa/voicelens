import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalServer } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function capture() {
  console.log('Starting VoiceLens LocalServer for asset capture...');
  const server = new LocalServer({ port: 50095 });
  await server.start();
  console.log('LocalServer running on http://localhost:50095');

  const outDir = path.resolve(__dirname, '../docs/images');
  const tempFramesDir = path.resolve(__dirname, '../temp_frames');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(tempFramesDir)) fs.rmSync(tempFramesDir, { recursive: true, force: true });
  fs.mkdirSync(tempFramesDir, { recursive: true });

  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 920, deviceScaleFactor: 2 });

  await page.goto('http://localhost:50095', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  // 1. Capture initial clean dashboard
  console.log('Capturing docs/images/dashboard.png...');
  await page.screenshot({ path: path.join(outDir, 'dashboard.png') });

  // 2. Click "RUN BENCHMARK" and record frames for animated demo GIF
  console.log('Triggering benchmark and recording frames for demo GIF...');
  const buttons = await page.$$('button');
  let runBtn = null;
  for (const btn of buttons) {
    const text = await page.evaluate((el) => el.innerText, btn);
    if (text.includes('RUN BENCHMARK')) {
      runBtn = btn;
      break;
    }
  }

  if (runBtn) {
    await runBtn.click();
  }

  // Capture 30 frames (at ~120ms intervals = ~3.6s)
  for (let i = 0; i < 30; i++) {
    const framePath = path.join(tempFramesDir, `frame_${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: framePath });
    await new Promise((r) => setTimeout(r, 120));
  }

  // Wait for benchmark to finish
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Capture post-benchmark waterfall profiler
  console.log('Capturing docs/images/waterfall_profiler.png...');
  await page.screenshot({ path: path.join(outDir, 'waterfall_profiler.png') });

  // 4. Trigger Barge-In Interruption
  console.log('Triggering Barge-In test...');
  const interruptButtons = await page.$$('button');
  for (const btn of interruptButtons) {
    const text = await page.evaluate((el) => el.innerText, btn);
    if (text.includes('TRIGGER INTERRUPT')) {
      await btn.click();
      break;
    }
  }

  await new Promise((r) => setTimeout(r, 5000));
  console.log('Capturing docs/images/barge_in_lab.png...');
  await page.screenshot({ path: path.join(outDir, 'barge_in_lab.png') });

  await browser.close();
  await server.stop();

  // 5. Assemble animated GIF with FFmpeg
  console.log('Generating docs/images/voicelens_demo.gif via FFmpeg...');
  const gifPath = path.join(outDir, 'voicelens_demo.gif');
  const ffmpegCmd = `ffmpeg -y -framerate 8 -i "${path.join(tempFramesDir, 'frame_%03d.png')}" -vf "fps=8,scale=1080:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`;
  
  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
    console.log(`Animated demo GIF successfully generated: ${gifPath}`);
  } catch (err) {
    console.error('FFmpeg GIF generation failed:', err);
  }

  // Clean up temp frames
  fs.rmSync(tempFramesDir, { recursive: true, force: true });
  console.log('Asset generation completed.');
}

capture().catch((err) => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
