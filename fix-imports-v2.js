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
  let imports = [];
  let importLines = [];
  let currentImport = { text: [], startLine: -1, endLine: -1 };
  let inImport = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Start of import
    if (trimmed.startsWith('import ')) {
      if (currentImport.startLine >= 0 && !inImport) {
        imports.push(currentImport);
        importLines.push(...currentImport.text);
      }
      currentImport = { text: [line], startLine: i, endLine: i };
      inImport = !line.includes(' from ');
    }
    // Continuation of multi-line import
    else if (inImport) {
      currentImport.text.push(line);
      currentImport.endLine = i;
      if (line.includes(' from ')) {
        inImport = false;
      }
    }
    // End of import section
    else if (currentImport.startLine >= 0 && !inImport) {
      imports.push(currentImport);
      importLines.push(...currentImport.text);
      break;
    }
  }

  // If we ended while still in imports
  if (currentImport.startLine >= 0 && !inImport && !imports.includes(currentImport)) {
    imports.push(currentImport);
    importLines.push(...currentImport.text);
  }

  if (imports.length === 0) continue;

  // Parse each import
  const parsedImports = imports.map(imp => {
    const fullText = imp.text.join('\n');
    const isType = fullText.includes('import type');
    const fromMatch = fullText.match(/from\s+['"]([^'"]+)['"]/);
    const modulePath = fromMatch ? fromMatch[1] : '';

    // Determine if it's a single member or multiple member import
    const hasMultipleMembers = fullText.includes('{') && fullText.includes(',');
    const hasSingleMember = fullText.includes('{') && !fullText.includes(',');

    // Categorize by module type
    let category;
    if (modulePath.startsWith('node:') || ['stream', 'http', 'https', 'net', 'crypto', 'fs', 'path', 'cluster', 'events'].includes(modulePath.split('/')[0])) {
      category = 'node';
    } else if (modulePath.startsWith('.')) {
      category = 'local';
    } else {
      category = 'external';
    }

    return {
      ...imp,
      fullText,
      isType,
      modulePath,
      hasMultipleMembers,
      hasSingleMember,
      category,
    };
  });

  // Group and sort
  const groups = {
    node: { multiple: [], single: [], default: [] },
    external: { multiple: [], single: [], default: [] },
    local: { multiple: [], single: [], default: [] },
    nodeType: { multiple: [], single: [], default: [] },
    externalType: { multiple: [], single: [], default: [] },
    localType: { multiple: [], single: [], default: [] },
  };

  for (const imp of parsedImports) {
    const groupKey = imp.isType ? `${imp.category}Type` : imp.category;
    const memberType = imp.hasMultipleMembers ? 'multiple' :
                      imp.hasSingleMember ? 'single' : 'default';

    groups[groupKey][memberType].push(imp);
  }

  // Sort each subgroup by module path
  const sortByPath = (a, b) => a.modulePath.localeCompare(b.modulePath);

  for (const group of Object.values(groups)) {
    group.multiple.sort(sortByPath);
    group.single.sort(sortByPath);
    group.default.sort(sortByPath);
  }

  // Rebuild imports in correct order
  const orderedImports = [];

  // Regular imports: multiple before single before default
  for (const category of ['node', 'external', 'local']) {
    const group = groups[category];
    if (group.multiple.length || group.single.length || group.default.length) {
      if (orderedImports.length) orderedImports.push({ text: [''] });
      orderedImports.push(...group.multiple, ...group.single, ...group.default);
    }
  }

  // Type imports: multiple before single before default
  const typeGroups = [groups.nodeType, groups.externalType, groups.localType];
  const hasAnyTypeImports = typeGroups.some(g => g.multiple.length || g.single.length || g.default.length);

  if (hasAnyTypeImports) {
    if (orderedImports.length) orderedImports.push({ text: [''] });

    for (const category of ['nodeType', 'externalType', 'localType']) {
      const group = groups[category];
      orderedImports.push(...group.multiple, ...group.single, ...group.default);
    }
  }

  // Build new content
  const firstImportLine = imports[0].startLine;
  const lastImportLine = imports[imports.length - 1].endLine;

  const before = lines.slice(0, firstImportLine);
  const after = lines.slice(lastImportLine + 1);

  // Remove leading empty lines from after
  while (after.length && after[0].trim() === '') {
    after.shift();
  }

  const newImportLines = [];
  for (const imp of orderedImports) {
    newImportLines.push(...imp.text);
  }

  const newContent = [...before, ...newImportLines, '', ...after].join('\n');

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Fixed: ${filePath}`);
  }
}

console.log('Done!');
