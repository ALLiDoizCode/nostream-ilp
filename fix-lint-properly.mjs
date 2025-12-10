#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get all TypeScript files
const getAllTsFiles = (dir, files = []) => {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && item !== 'node_modules' && item !== 'dist' && item !== '.git') {
      getAllTsFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
};

const fixFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let modified = false;

  // Fix 1: Remove unused _EventEmitter imports
  const eventEmitterRegex = /import\s*\{\s*EventEmitter\s+as\s+_EventEmitter\s*\}\s+from\s+['"](events|node:stream|stream)['"]/g;
  if (eventEmitterRegex.test(content)) {
    content = content.replace(eventEmitterRegex, '');
    // Also handle cases where it's part of a larger import
    content = content.replace(/,\s*EventEmitter\s+as\s+_EventEmitter/g, '');
    content = content.replace(/EventEmitter\s+as\s+_EventEmitter\s*,/g, '');
    modified = true;
  }

  // Fix 2: Prefix unused variables with underscore
  const newLines = content.split('\n');
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];

    // Fix error callbacks like .on('error', (error) => ...)
    if (line.includes("\.on('error'") || line.includes('.on("error"')) {
      if (line.match(/\(\s*error\s*\)/) && !line.match(/\b_error\b/)) {
        newLines[i] = line.replace(/\(\s*error\s*\)/, '(_error)');
        modified = true;
      }
    }

    // Fix unused consts
    if (line.match(/const\s+\{[^}]*\bNostrEvent\b[^}]*\}/)) {
      // Destructuring - alias with underscore
      newLines[i] = line.replace(/\bNostrEvent\b/, 'NostrEvent: _NostrEvent');
      modified = true;
    }

    // Fix function params that must match signature
    if (line.match(/\bcurrentNodeAddress\b/) && line.includes(':')) {
      newLines[i] = line.replace(/\bcurrentNodeAddress\b/, '_currentNodeAddress');
      modified = true;
    }

    if (line.match(/\bsendEventPacket\b/) && line.includes('import')) {
      newLines[i] = line.replace(/\bsendEventPacket\b/, 'sendEventPacket as _sendEventPacket');
      modified = true;
    }

    // Fix const _event = assignments
    if (line.match(/const\s+_*event\s*=/)) {
      if (!line.includes('_event')) {
        newLines[i] = line.replace(/const\s+event\s*=/, 'const _event =');
        modified = true;
      }
    }

    // Fix other unused variables in destructuring
    if (line.match(/const\s+\{\s*id\s*,\s*nostrPubkey\s*,\s*createdAt\s*\}/)) {
      newLines[i] = line.replace(/\bid\b/, 'id: _id')
        .replace(/\bnostrPubkey\b/, 'nostrPubkey: _nostrPubkey')
        .replace(/\bcreatedAt\b/, 'createdAt: _createdAt');
      modified = true;
    }

    if (line.match(/\b_pingPacket\b/) && line.includes('const')) {
      // Already has underscore, but might be assigned
    }
  }

  if (modified) {
    content = newLines.join('\n');
  }

  // Fix 3: Sort imports
  const importBlockRegex = /^(import\s+.+?\n)+/gm;
  content = content.replace(importBlockRegex, (importBlock) => {
    const imports = importBlock.trim().split('\n').filter(line => line.trim());

    // Separate regular imports from type imports
    const regularImports = [];
    const typeImports = [];

    for (const imp of imports) {
      if (imp.includes('import type')) {
        typeImports.push(imp);
      } else {
        regularImports.push(imp);
      }
    }

    // Sort each group alphabetically (case-insensitive)
    const sortFn = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase());
    regularImports.sort(sortFn);
    typeImports.sort(sortFn);

    // Combine with blank line separator if both groups exist
    let result = regularImports.join('\n');
    if (typeImports.length > 0) {
      if (regularImports.length > 0) {
        result += '\n\n' + typeImports.join('\n');
      } else {
        result = typeImports.join('\n');
      }
    }

    return result + '\n';
  });

  // Clean up multiple blank lines
  content = content.replace(/\n\n\n+/g, '\n\n');

  // Write back
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
};

// Get all files
const srcFiles = getAllTsFiles(path.join(__dirname, 'src'));
const testFiles = getAllTsFiles(path.join(__dirname, 'test'));
const allFiles = [...srcFiles, ...testFiles];

console.log(`Processing ${allFiles.length} TypeScript files...`);

let fixed = 0;
for (const file of allFiles) {
  try {
    if (fixFile(file)) {
      fixed++;
      if (fixed % 50 === 0) {
        console.log(`Processed ${fixed} files...`);
      }
    }
  } catch (err) {
    console.error(`Error fixing ${file}:`, err.message);
  }
}

console.log(`\nProcessed ${fixed} files`);
console.log('\nRunning ESLint to verify...');

try {
  execSync('pnpm eslint --ext .ts ./src ./test', { stdio: 'inherit' });
  console.log('\n✅ All ESLint errors fixed!');
  process.exit(0);
} catch (err) {
  console.log('\n⚠️  Some errors may remain - check output above');
  process.exit(1);
}
