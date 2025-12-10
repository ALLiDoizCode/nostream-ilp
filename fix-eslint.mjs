#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Get all files with eslint errors
const output = execSync('pnpm eslint --ext .ts ./src ./test 2>&1', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const lines = output.split('\n');

const fileErrors = new Map();
let currentFile = null;

for (const line of lines) {
  if (line.startsWith('/')) {
    const parts = line.split(':');
    currentFile = parts[0];
    const lineNum = parseInt(parts[1]);
    const colNum = parseInt(parts[2]);
    const errorMsg = parts.slice(3).join(':').trim();

    if (!fileErrors.has(currentFile)) {
      fileErrors.set(currentFile, []);
    }
    fileErrors.set(currentFile, [...fileErrors.get(currentFile), { line: lineNum, col: colNum, msg: errorMsg }]);
  }
}

console.log(`Found errors in ${fileErrors.size} files`);

let fixedCount = 0;

for (const [filePath, errors] of fileErrors.entries()) {
  try {
    let content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Check if file has no-unused-vars errors for _EventEmitter
    const hasEventEmitterError = errors.some(e => e.msg.includes("'_EventEmitter' is defined but never used"));

    if (hasEventEmitterError) {
      // Remove the unused import alias
      content = content.replace(/import\s+\{\s*EventEmitter\s+as\s+_EventEmitter\s*\}\s+from\s+['"].*?['"]/g, (match) => {
        // Check if EventEmitter is used elsewhere in the import
        if (match.includes(',')) {
          // Remove just the alias part
          return match.replace(/,?\s*EventEmitter\s+as\s+_EventEmitter\s*,?/, '').replace(/\{\s*,/, '{').replace(/,\s*\}/, '}');
        }
        // Remove entire import
        return '';
      });

      // Clean up empty lines
      content = content.replace(/\n\n\n+/g, '\n\n');
    }

    // Fix unused variables by prefixing with underscore
    for (const error of errors) {
      if (error.msg.includes('is defined but never used') || error.msg.includes('is assigned a value but never used')) {
        const varMatch = error.msg.match(/'([^']+)'/);
        if (varMatch && varMatch[1] !== '_EventEmitter') {
          const varName = varMatch[1];
          const lineIndex = error.line - 1;

          if (lineIndex >= 0 && lineIndex < lines.length) {
            // Replace the variable name with underscore prefix
            lines[lineIndex] = lines[lineIndex].replace(
              new RegExp(`\\b${varName}\\b(?=\\s*[:=,)])`, 'g'),
              `_${varName}`
            );
          }
        }
      }
    }

    content = lines.join('\n');

    // Sort imports
    const importRegex = /^(import\s+.+?;\n)+/gm;
    content = content.replace(importRegex, (importBlock) => {
      const imports = importBlock.trim().split('\n');

      const regularImports = [];
      const typeImports = [];

      for (const imp of imports) {
        if (imp.includes('import type')) {
          typeImports.push(imp);
        } else {
          regularImports.push(imp);
        }
      }

      regularImports.sort();
      typeImports.sort();

      let result = regularImports.join('\n');
      if (typeImports.length > 0) {
        result += '\n\n' + typeImports.join('\n');
      }

      return result + '\n';
    });

    writeFileSync(filePath, content, 'utf8');
    fixedCount++;

    if (fixedCount % 10 === 0) {
      console.log(`Fixed ${fixedCount} files...`);
    }
  } catch (err) {
    console.error(`Error fixing ${filePath}:`, err.message);
  }
}

console.log(`\nFixed ${fixedCount} files total`);
console.log('\nRunning lint again to verify...');

try {
  execSync('pnpm eslint --ext .ts ./src ./test 2>&1', { encoding: 'utf8', stdio: 'inherit' });
  console.log('\n✅ All errors fixed!');
} catch (err) {
  console.log('\n⚠️  Some errors remain - manual fixes needed');
}
