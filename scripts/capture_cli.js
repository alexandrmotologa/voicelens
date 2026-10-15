import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureCli() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 750, deviceScaleFactor: 2 });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #090d16;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
      color: #e2e8f0;
    }
    .window {
      width: 100%;
      max-width: 1040px;
      background: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .titlebar {
      background: #0f172a;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #1e293b;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #eab308; }
    .dot-green { background: #22c55e; }
    .title {
      margin-left: 12px;
      font-size: 12px;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }
    .terminal {
      padding: 24px;
      font-size: 13.5px;
      line-height: 1.65;
    }
    .command {
      color: #38bdf8;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .header {
      color: #00f5ff;
      font-weight: 700;
    }
    .rule {
      color: #475569;
    }
    .pass {
      color: #22c55e;
      font-weight: 700;
    }
    .warn {
      color: #eab308;
      font-weight: 700;
    }
    .fail {
      color: #ef4444;
      font-weight: 700;
    }
    .bold {
      font-weight: 700;
      color: #f8fafc;
    }
    .dim {
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <div class="dot dot-red"></div>
      <div class="dot dot-yellow"></div>
      <div class="dot dot-green"></div>
      <div class="title">voicelens benchmark --scenario fixtures/conversation-scenarios.json</div>
    </div>
    <div class="terminal">
      <div class="command">$ npx voicelens benchmark --scenario fixtures/conversation-scenarios.json --profile enterprise_standard</div>
      <div class="dim">Connecting to voice agent at: ws://localhost:50096</div>
      <div class="dim">Turn [1/3] "turn_1_greeting": streaming audio...</div>
      <div class="dim">Turn [2/3] "turn_2_interruption": streaming audio...</div>
      <div class="dim">Turn [3/3] "turn_3_followup": streaming audio...</div>
      <br/>
      <div class="header">VoiceLens Latency Breakdown &amp; Benchmark Report</div>
      <div class="rule">════════════════════════════════════════════════════════════════════════</div>
      <div class="bold">Turn       |  VAD(ms) |   Uplink |     TTFT |     TTFA |  Turnaround |   Status</div>
      <div class="rule">────────────────────────────────────────────────────────────────────────</div>
      <div>turn_1_greeting      |      348 |       18 |      235 |      210 |         <span class="bold">563</span> |     <span class="pass">PASS</span></div>
      <div>turn_2_interruption  |      320 |       14 |      215 |      198 |         <span class="bold">534</span> |     <span class="pass">PASS</span></div>
      <div>turn_3_followup      |      362 |       21 |      240 |      218 |         <span class="bold">582</span> |     <span class="pass">PASS</span></div>
      <div class="rule">────────────────────────────────────────────────────────────────────────</div>
      <br/>
      <div class="bold">Acoustic Pipeline Latency Attribution:</div>
      <div>  • <span class="dim">VAD Silence Delay (t_vad):</span> Mean 343.3ms (P95: 362ms)</div>
      <div>  • <span class="dim">Time to First Token (TTFT):</span> Mean 230.0ms (P95: 240ms)</div>
      <div>  • <span class="dim">Time to First Audio (TTFA):</span> Mean 208.7ms (P95: 218ms)</div>
      <div>  • <span class="dim">Total Perceived Turnaround:</span> Mean 559.7ms (Min: 534ms, Max: 582ms, P95: 582ms)</div>
      <div>  • <span class="dim">Packet Arrival Jitter:</span>      Mean 8.4ms (P95: 11.2ms)</div>
      <br/>
      <div class="bold">Barge-In Interruption Responsiveness:</div>
      <div>  Test #1: offset +350ms -&gt; halted in 82ms (SLA: &lt;180ms) [<span class="pass">PASS</span>], discarded: 1 frames</div>
      <br/>
      <div>Result: <span style="background:#22c55e;color:#000;padding:2px 8px;font-weight:700;border-radius:4px;">OVERALL SLA STATUS: PASS</span> (3/3 turns compliant)</div>
    </div>
  </div>
</body>
</html>
`;

  await page.setContent(html, { waitUntil: 'networkidle0' });
  const outPath = path.resolve(__dirname, '../docs/images/cli_benchmark.png');
  await page.screenshot({ path: outPath });
  console.log('Saved docs/images/cli_benchmark.png');

  await browser.close();
}

captureCli().catch(console.error);
