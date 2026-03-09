#!/usr/bin/env node
'use strict';

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const { get } = require('https');
const { tmpdir, homedir, platform } = require('os');
const { join } = require('path');

// ── ANSI ────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';

function colorForPct(pct) {
  if (pct >= 90) return RED;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

function makeBar(pct) {
  const filled = Math.min(10, Math.floor(pct * 10 / 100));
  return '●'.repeat(filled) + '○'.repeat(10 - filled);
}

function formatResetTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'am' : 'pm';
  if (isToday) return `↻ ${h}:${m}${ampm}`;
  const mon = d.toLocaleString('en', { month: 'short' }).toLowerCase();
  return `↻ ${mon} ${d.getDate()}, ${h}:${m}${ampm}`;
}

function fmtTokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── Credential resolution ────────────────────────────────
// 1. ~/.claude/.credentials.json  (all platforms — universal fallback)
// 2. macOS Keychain
// 3. Linux secret-tool
function getOAuthToken() {
  const credsFile = join(homedir(), '.claude', '.credentials.json');
  if (existsSync(credsFile)) {
    try {
      const token = JSON.parse(readFileSync(credsFile, 'utf8'))?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  if (platform() === 'darwin') {
    try {
      const blob = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      const token = JSON.parse(blob)?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  if (platform() === 'linux') {
    try {
      const blob = execSync(
        'secret-tool lookup service "Claude Code-credentials"',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 }
      ).trim();
      const token = JSON.parse(blob)?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  return null;
}

// ── Usage API (cached 60s) ───────────────────────────────
function fetchUsage(token) {
  return new Promise((resolve) => {
    const cacheFile = join(tmpdir(), 'claude_usage_cache.json');
    const now = Date.now();

    if (existsSync(cacheFile)) {
      try {
        const { ts, data } = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (now - ts < 60_000) { resolve(data); return; }
      } catch {}
    }

    const req = get({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1.71',
      },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.five_hour) {
            try { writeFileSync(cacheFile, JSON.stringify({ ts: now, data })); } catch {}
          }
          resolve(data.five_hour ? data : null);
        } catch { resolve(null); }
      });
    });

    req.on('error', () => {
      // Serve stale cache rather than showing nothing
      try {
        const { data } = JSON.parse(readFileSync(cacheFile, 'utf8'));
        resolve(data);
      } catch { resolve(null); }
    });

    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const input = await new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => raw += chunk);
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });

  // Line 1: model + context
  const model     = input.model?.display_name ?? 'Claude';
  const usedPct   = input.context_window?.used_percentage;
  const remainPct = input.context_window?.remaining_percentage;
  const totalIn   = input.context_window?.total_input_tokens ?? 0;
  const totalOut  = input.context_window?.total_output_tokens ?? 0;

  if (usedPct != null) {
    const c = colorForPct(usedPct);
    process.stdout.write(
      `${c}${model}${RESET}  in:${fmtTokens(totalIn)} out:${fmtTokens(totalOut)}  ctx:${usedPct}% used / ${remainPct}% left`
    );
  } else {
    process.stdout.write(`${model}  in:${fmtTokens(totalIn)} out:${fmtTokens(totalOut)}  ctx:--`);
  }

  // Lines 2 & 3: plan usage
  const token = getOAuthToken();
  if (!token) return;

  const usage = await fetchUsage(token);
  if (!usage) return;

  const curPct   = Math.round(usage.five_hour?.utilization ?? 0);
  const curReset = usage.five_hour?.resets_at;
  const wklyPct  = Math.round(usage.seven_day?.utilization ?? 0);
  const wklyReset = usage.seven_day?.resets_at;

  process.stdout.write('\n');

  const curBar  = makeBar(curPct);
  const curCol  = colorForPct(curPct);
  const curTime = curReset ? ` ${formatResetTime(curReset)}` : '';
  process.stdout.write(`current ${curCol}${curBar}${RESET} ${curCol}${curPct}%${RESET}${curTime}`);

  const wklyBar  = makeBar(wklyPct);
  const wklyCol  = colorForPct(wklyPct);
  const wklyTime = wklyReset ? ` ${formatResetTime(wklyReset)}` : '';
  process.stdout.write(`\nweekly  ${wklyCol}${wklyBar}${RESET} ${wklyCol}${wklyPct}%${RESET}${wklyTime}`);
}

main().catch(() => {});
