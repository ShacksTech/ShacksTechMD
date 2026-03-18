// ============================================================
//            ShacksTech MD - Server Launcher
//        Created by Shacks | github.com/ShacksTech
// ============================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const moment = require('moment-timezone');

const BOT_NAME = 'ShacksTech MD';
const BOT_ZIP = 'bot.zip';
const MAIN_FILE = 'cypher.js';
const TIMEZONE = 'Africa/Kampala';
const BOT_DIR = path.join(__dirname);

// Download sources - primary is your qu.ax link
const DOWNLOAD_SOURCES = [
  { name: 'primary', url: 'https://qu.ax/nddeD' },
  { name: 'github',  url: 'https://github.com/ShacksTech/ShacksTechMD/releases/latest/download/bot.zip' },
];

// Files/folders to keep on update (not overwritten)
const KEEP_ON_UPDATE = [
  './src/Database',
  './src/Session',
  './node_modules',
  './index.js',
  './tmp',
  './.env',
  './app.json',
];

function getTime() {
  return moment().tz(TIMEZONE).format('HH:mm:ss DD/MM/YYYY');
}

function log(msg) {
  console.log(`[${getTime()}] [${BOT_NAME}] ${msg}`);
}

function detectPlatform() {
  const env = process.env;
  if (env.DYNO) return 'Heroku';
  if (env.RENDER) return 'Render';
  if (env.RAILWAY_ENVIRONMENT) return 'Railway';
  if (env.KOYEB_APP_ID) return 'Koyeb';
  const hostname = require('os').hostname().toLowerCase();
  if (hostname.includes('termux') || process.platform === 'android') return 'Termux';
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'darwin') return 'macOS';
  if (env.PANEL) return 'Panel';
  return 'Linux VPS';
}

async function downloadBot() {
  const zipPath = path.join(BOT_DIR, BOT_ZIP);
  
  for (const source of DOWNLOAD_SOURCES) {
    try {
      log(`Downloading from ${source.name}: ${source.url}`);
      const response = await axios.get(source.url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': 'ShacksTechMD/1.0' }
      });
      
      if (response.status === 200 && response.data.length > 1000) {
        fs.writeFileSync(zipPath, Buffer.from(response.data));
        log(`✅ Downloaded successfully from ${source.name} (${(response.data.length / 1024).toFixed(1)} KB)`);
        return zipPath;
      }
    } catch (err) {
      log(`❌ Failed from ${source.name}: ${err.message}`);
    }
  }
  throw new Error('All download sources failed');
}

async function extractBot(zipPath) {
  log('Extracting bot files...');
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  
  let extracted = 0;
  for (const entry of entries) {
    const entryName = entry.entryName;
    const fullPath = path.join(BOT_DIR, entryName);
    
    // Skip protected folders/files
    const shouldSkip = KEEP_ON_UPDATE.some(keep => {
      const normalized = keep.replace('./', '');
      return entryName.startsWith(normalized + '/') || entryName === normalized;
    });
    
    if (shouldSkip) continue;
    
    if (entry.isDirectory) {
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    } else {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, entry.getData());
      extracted++;
    }
  }
  
  // Clean up zip
  fs.unlinkSync(zipPath);
  log(`✅ Extracted ${extracted} files`);
}

function installDeps() {
  return new Promise((resolve, reject) => {
    log('Installing dependencies...');
    const npm = spawn('npm', ['install', '--prefer-offline'], {
      cwd: BOT_DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    npm.on('close', code => {
      if (code === 0) {
        log('✅ Dependencies installed');
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

function startBot() {
  const mainFile = path.join(BOT_DIR, MAIN_FILE);
  if (!fs.existsSync(mainFile)) {
    throw new Error(`Main file not found: ${MAIN_FILE}`);
  }
  
  log(`🚀 Starting ${BOT_NAME}...`);
  const bot = spawn('node', [mainFile], {
    cwd: BOT_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  
  bot.on('close', async (code) => {
    log(`Bot exited with code ${code}. Restarting in 5 seconds...`);
    await new Promise(r => setTimeout(r, 5000));
    startBot();
  });
  
  bot.on('error', (err) => {
    log(`Bot error: ${err.message}`);
  });
}

async function init() {
  const platform = detectPlatform();
  const mainFile = path.join(BOT_DIR, MAIN_FILE);
  
  console.log(`
╔══════════════════════════════════════╗
║         ShacksTech MD Launcher       ║
║      Created by Shacks - Uganda 🇺🇬   ║
║         Platform: ${platform.padEnd(18)}║
╚══════════════════════════════════════╝
`);

  try {
    // If main bot file doesn't exist, download it
    if (!fs.existsSync(mainFile)) {
      log('Bot files not found. Downloading...');
      const zipPath = await downloadBot();
      await extractBot(zipPath);
      await installDeps();
    } else {
      log(`✅ Bot files found. Launching...`);
    }
    
    startBot();
    
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    log('Retrying in 10 seconds...');
    await new Promise(r => setTimeout(r, 10000));
    init();
  }
}

init();
