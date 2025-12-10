#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

// Get ESLint output
let output;
try {
  output = execSync('pnpm eslint --ext .ts ./src ./test 2>&1', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
} catch (err) {
  output = err.output ? err.output.join('') : err.stdout || '';
}

const lines = output.split('\n');

// Parse errors by file
const fileErrors = new Map();
let currentFile = null;

for (const line of lines) {
  if (line.startsWith('/Users/')) {
    currentFile = line.trim();
    if (!fileErrors.has(currentFile)) {
      fileErrors.set(currentFile, []);
    }
  } else if (currentFile && line.includes('error') && line.includes('no-unused-vars')) {
    const match = line.match(/(\d+):(\d+)\s+error\s+(.+)/);
    if (match) {
      const [, lineNum, col, message] = match;
      fileErrors.get(currentFile).push({
        lineNum: parseInt(lineNum),
        col: parseInt(col),
        message: message.trim()
      });
    }
  }
}

console.log(`Found ${fileErrors.size} files with no-unused-vars errors`);

let fixedCount = 0;

for (const [filePath, errors] of fileErrors) {
  if (!errors.length || !fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let modified = false;

  for (const error of errors) {
    const lineIdx = error.lineNum - 1;
    if (lineIdx >= lines.length) continue;

    let line = lines[lineIdx];

    // Extract variable name from error message
    const varMatch = error.message.match(/'([^']+)'/);
    if (!varMatch) continue;

    const varName = varMatch[1];

    // Skip if already prefixed with underscore
    if (varName.startsWith('_')) continue;

    // Replace the variable name with underscore-prefixed version
    // Use word boundaries to ensure we only replace complete variable names
    const regex = new RegExp(`\\b${varName}\\b`, 'g');
    const newLine = line.replace(regex, `_${varName}`);

    if (newLine !== line) {
      lines[lineIdx] = newLine;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Fixed: ${filePath}`);
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
console.log('Done!');
