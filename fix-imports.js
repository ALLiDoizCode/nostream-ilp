#!/usr/bin/env node

const fs = require('fs');
const { glob } = require('glob');

// Get all TypeScript files
const files = glob.sync('{src,test}/**/*.ts');

console.log(`Processing ${files.length} files...`);

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find import section
  let importStart = -1;
  let importEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || (importStart >= 0 && line.startsWith('}'))) {
      if (importStart === -1) importStart = i;
      importEnd = i;
    } else if (importStart >= 0 && line && !line.startsWith('//')) {
      break;
    }
  }

  if (importStart === -1) continue;

  // Extract all imports
  const imports = [];
  let currentImport = '';
  let inMultiLine = false;

  for (let i = importStart; i <= importEnd; i++) {
    const line = lines[i];

    if (line.trim().startsWith('import ')) {
      if (currentImport && !inMultiLine) {
        imports.push(currentImport);
      }
      currentImport = line;
      inMultiLine = !line.includes(' from ') || !line.trim().endsWith("'") && !line.trim().endsWith('"');
    } else if (inMultiLine) {
      currentImport += '\n' + line;
      if (line.includes(' from ') && (line.trim().endsWith("'") || line.trim().endsWith('"'))) {
        inMultiLine = false;
      }
    }

    if (i === importEnd && currentImport) {
      imports.push(currentImport);
    }
  }

  if (imports.length === 0) continue;

  // Categorize imports
  const nodeImports = [];
  const externalImports = [];
  const localImports = [];
  const typeImports = [];

  for (const imp of imports) {
    const isType = imp.includes('import type');
    const fromMatch = imp.match(/from ['"]([^'"]+)['"]/);
    if (!fromMatch) continue;

    const moduleName = fromMatch[1];

    if (isType) {
      typeImports.push(imp);
    } else if (moduleName.startsWith('node:') || ['stream', 'http', 'https', 'net', 'crypto', 'fs', 'path', 'cluster', 'events'].includes(moduleName.split('/')[0])) {
      nodeImports.push(imp);
    } else if (moduleName.startsWith('.')) {
      localImports.push(imp);
    } else {
      externalImports.push(imp);
    }
  }

  // Sort each group
  const sortImports = (arr) => arr.sort((a, b) => {
    // Extract module name for comparison
    const getModuleName = (imp) => {
      const match = imp.match(/from ['"]([^'"]+)['"]/);
      return match ? match[1] : '';
    };
    return getModuleName(a).localeCompare(getModuleName(b));
  });

  sortImports(nodeImports);
  sortImports(externalImports);
  sortImports(localImports);
  sortImports(typeImports);

  // Rebuild imports section
  const newImports = [];

  if (nodeImports.length) {
    newImports.push(...nodeImports);
  }

  if (externalImports.length) {
    if (newImports.length) newImports.push('');
    newImports.push(...externalImports);
  }

  if (localImports.length) {
    if (newImports.length) newImports.push('');
    newImports.push(...localImports);
  }

  if (typeImports.length) {
    if (newImports.length) newImports.push('');
    newImports.push(...typeImports);
  }

  // Replace import section
  const before = lines.slice(0, importStart);
  const after = lines.slice(importEnd + 1);

  // Remove empty lines after imports
  while (after.length && after[0].trim() === '') {
    after.shift();
  }

  const newContent = [...before, ...newImports, '', ...after].join('\n');

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Fixed: ${filePath}`);
  }
}

console.log('Done!');
