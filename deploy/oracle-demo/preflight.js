#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function parseEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function dirSizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      }
    }
  }
  return total;
}

function mb(bytes) {
  return bytes / 1024 / 1024;
}

function pushIf(condition, list, message) {
  if (condition) list.push(message);
}

const envPath = argValue('--env', 'deploy/oracle-demo/basechain-demo.env.example');
const frontendEnvPath = argValue('--frontend-env', 'Proje/.env.example');
const distPath = argValue('--dist', 'Proje/dist');
const maxDistMb = Number(argValue('--max-dist-mb', '80'));

const errors = [];
const warnings = [];

if (!fs.existsSync(envPath)) {
  errors.push(`Backend env file not found: ${envPath}`);
} else {
  const env = parseEnv(envPath);
  pushIf(env.FABRIC_MODE !== 'mock', errors, 'FABRIC_MODE must be mock for Oracle demo.');
  pushIf(env.TOSS_MODE !== 'mock', errors, 'TOSS_MODE must be mock for Oracle demo.');
  pushIf(String(env.ENABLE_ONCHAIN_MINTING).toLowerCase() !== 'false', errors, 'ENABLE_ONCHAIN_MINTING must be false for Oracle demo.');
  pushIf(!env.QR_SECRET || env.QR_SECRET.includes('YOUR_'), warnings, 'QR_SECRET is still placeholder. Replace it before a shared demo.');
  pushIf(!env.JWT_SECRET || env.JWT_SECRET.includes('YOUR_'), warnings, 'JWT_SECRET is still placeholder. Replace it before a shared demo.');
  pushIf(!String(env.PUBLIC_WEB_URL || '').startsWith('https://'), warnings, 'PUBLIC_WEB_URL should be HTTPS for mobile QR camera access.');
  pushIf(!String(env.PUBLIC_API_URL || '').startsWith('https://'), warnings, 'PUBLIC_API_URL should be HTTPS for mobile QR camera access.');
}

if (!fs.existsSync(frontendEnvPath)) {
  warnings.push(`Frontend env file not found: ${frontendEnvPath}`);
} else {
  const frontendEnv = parseEnv(frontendEnvPath);
  pushIf(!String(frontendEnv.VITE_API_URL || '').startsWith('https://') && !String(frontendEnv.VITE_API_URL || '').includes('localhost'), warnings, 'VITE_API_URL should be HTTPS on Oracle demo.');
}

if (!fs.existsSync(distPath)) {
  warnings.push(`Frontend dist not found: ${distPath}. Run cd Proje && npm run build first.`);
} else {
  const sizeMb = mb(dirSizeBytes(distPath));
  pushIf(sizeMb > maxDistMb, warnings, `Frontend dist is ${sizeMb.toFixed(1)}MB, over ${maxDistMb}MB target.`);
}

const result = {
  ok: errors.length === 0,
  envPath,
  frontendEnvPath,
  distPath,
  maxDistMb,
  errors,
  warnings,
};

console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
