#!/usr/bin/env node
'use strict';

const { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname } = require('path');
const { homedir } = require('os');

const CLAUDE_DIR    = join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const TARGET_SCRIPT = join(CLAUDE_DIR, 'statusline.js');
const SOURCE_SCRIPT = join(__dirname, 'statusline.js');

// Absolute paths so the command works regardless of shell PATH
const NODE_BIN   = process.execPath;
const COMMAND    = `"${NODE_BIN}" "${TARGET_SCRIPT}"`;

function install() {
  // 1. Ensure ~/.claude exists
  mkdirSync(CLAUDE_DIR, { recursive: true });

  // 2. Copy statusline.js
  copyFileSync(SOURCE_SCRIPT, TARGET_SCRIPT);

  // 3. Patch settings.json
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch {}
  }

  settings.statusLine = { type: 'command', command: COMMAND };
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  console.log('\n  Claude Statusline installed\n');
  console.log(`  Script  → ${TARGET_SCRIPT}`);
  console.log(`  Command → ${COMMAND}\n`);
  console.log('  Restart Claude Code to activate.\n');
}

install();
