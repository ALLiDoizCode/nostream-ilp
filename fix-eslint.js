#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

// Get all files with errors
let output;
try {
  output = execSync('pnpm eslint --ext .ts ./src ./test 2>&1', { encoding: 'utf-8' });
} catch (err) {
  output = err.stdout || '';
}
const lines = output.split('\n');

let currentFile = null;
const fileErrors = new Map();

for (const line of lines) {
  if (line.startsWith('/Users/')) {
    currentFile = line.trim();
    fileErrors.set(currentFile, []);
  } else if (currentFile && line.includes('error')) {
    const match = line.match(/(\d+):(\d+)\s+error\s+(.+)/);
    if (match) {
      const [, lineNum, col, message] = match;
      fileErrors.get(currentFile).push({ lineNum: parseInt(lineNum), col: parseInt(col), message });
    }
  }
}

console.log(`Found ${fileErrors.size} files with errors`);

for (const [filePath, errors] of fileErrors) {
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let modified = false;

  // Fix no-unused-vars errors
  for (const error of errors) {
    if (error.message.includes('no-unused-vars')) {
      const lineIdx = error.lineNum - 1;
      const line = lines[lineIdx];

      // Fix unused import aliases like '_EventEmitter'
      if (line.includes("as _")) {
        // Remove the import entirely if it's unused
        const importMatch = line.match(/import\s+\{[^}]*as (_\w+)[^}]*\}\s+from/);
        if (importMatch) {
          // Just remove this entire import line
          lines[lineIdx] = '';
          modified = true;
          continue;
        }
      }

      // Fix unused variables/parameters
      const varMatch = error.message.match(/'(\w+)' is (defined but never used|assigned a value but never used)/);
      if (varMatch) {
        const varName = varMatch[1];
        // Don't prefix if already prefixed
        if (!varName.startsWith('_')) {
          // Replace variable name with underscore prefix
          lines[lineIdx] = line.replace(new RegExp(`\\b${varName}\\b`, 'g'), `_${varName}`);
          modified = true;
        }
      }

      // Fix unused function parameters with specific error message
      const paramMatch = error.message.match(/'(\w+)' is defined but never used\. Allowed unused args must match/);
      if (paramMatch) {
        const paramName = paramMatch[1];
        if (!paramName.startsWith('_')) {
          lines[lineIdx] = line.replace(new RegExp(`\\b${paramName}\\b`), `_${paramName}`);
          modified = true;
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Fixed: ${filePath}`);
  }
}

console.log('Done with no-unused-vars fixes');
