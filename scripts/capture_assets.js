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

  // 5. Open and capture Turn Inspector
  console.log('Opening Turn Inspector...');
  await page.evaluate(() => {
    const turnCard = document.querySelector('div.group.cursor-pointer');
    if (turnCard) {
      turnCard.click();
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('Capturing docs/images/turn_inspector.png...');
  await page.screenshot({ path: path.join(outDir, 'turn_inspector.png') });

  // Close turn inspector
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const closeBtn = btns.find((b) => b.textContent && (b.textContent.includes('Close') || b.textContent.includes('✕')));
    if (closeBtn) closeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // 6. Open and capture Network Chaos Simulator
  console.log('Opening Network Chaos Lab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const chaosBtn = btns.find((b) => b.textContent && b.textContent.includes('Chaos'));
    if (chaosBtn) chaosBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('Capturing docs/images/chaos_lab.png...');
  await page.screenshot({ path: path.join(outDir, 'chaos_lab.png') });

  // Close chaos lab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const doneBtn = btns.find((b) => b.textContent && (b.textContent.includes('Done') || b.textContent.includes('✕')));
    if (doneBtn) doneBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // 7. Open and capture Scenario Builder
  console.log('Opening Scenario Builder...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const scBtn = btns.find((b) => b.textContent && b.textContent.includes('Scenarios'));
    if (scBtn) scBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log('Capturing docs/images/scenario_builder.png...');
  await page.screenshot({ path: path.join(outDir, 'scenario_builder.png') });

  // Close scenario builder
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find((b) => b.textContent && (b.textContent.includes('Cancel') || b.textContent.includes('✕')));
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // 8. Capture Mobile Responsive Studio View (iPhone / Smartphone 390x844)
  console.log('Setting viewport to mobile (390x844)...');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 800));
  console.log('Capturing docs/images/mobile_studio.png...');
  await page.screenshot({ path: path.join(outDir, 'mobile_studio.png') });

  // 9. Render crisp 1024x1024 logo.png from logo.svg
  console.log('Rendering 1024x1024 logo.png from logo.svg...');
  const logoSvgPath = path.join(outDir, 'logo.svg');
  if (fs.existsSync(logoSvgPath)) {
    const logoPage = await browser.newPage();
    await logoPage.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
    const svgContent = fs.readFileSync(logoSvgPath, 'utf8');
    await logoPage.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;">${svgContent}</body></html>`);
    await logoPage.screenshot({ path: path.join(outDir, 'logo.png'), omitBackground: true });
    await logoPage.close();
    console.log('High-res logo.png rendered successfully.');
  }

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
