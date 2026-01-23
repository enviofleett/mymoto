#!/usr/bin/env node

/**
 * Script to start dev server and open browser
 * Usage: node scripts/open-localhost.js [url_path]
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;
const URL_PATH = process.argv[2] || '/';
const FULL_URL = `${BASE_URL}${URL_PATH}`;

// Detect OS for opening browser
const openBrowser = (url) => {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = 'open';
  } else if (platform === 'linux') {
    command = 'xdg-open';
  } else if (platform === 'win32') {
    command = 'start';
  } else {
    console.log(`⚠️  Could not auto-open browser. Please manually open: ${FULL_URL}`);
    return;
  }

  spawn(command, [url], { stdio: 'ignore', detached: true });
};

// Check if server is already running
const checkServer = () => {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, { timeout: 1000 }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
};

// Wait for server to be ready
const waitForServer = async (maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServer()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
};

// Main function
(async () => {
  console.log('🚀 Starting development server...');

  // Check if server is already running
  if (await checkServer()) {
    console.log(`✅ Server is already running on ${BASE_URL}`);
    console.log(`📖 Opening browser to: ${FULL_URL}`);
    openBrowser(FULL_URL);
    process.exit(0);
  }

  // Start dev server
  console.log('⏳ Starting server...');
  const devProcess = spawn('npm', ['run', 'dev'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  // Wait for server to be ready
  console.log('⏳ Waiting for server to start...');
  const serverReady = await waitForServer();

  if (serverReady) {
    console.log(`✅ Server is ready on ${BASE_URL}`);
    console.log(`📖 Opening browser to: ${FULL_URL}`);
    openBrowser(FULL_URL);
    console.log(`\n🛑 To stop server: Press Ctrl+C\n`);
  } else {
    console.error('❌ Server did not start within 30 seconds');
    devProcess.kill();
    process.exit(1);
  }

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    devProcess.kill();
    process.exit(0);
  });
})();
