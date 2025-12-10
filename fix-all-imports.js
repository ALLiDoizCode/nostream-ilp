#!/usr/bin/env node

const fs = require('fs');
const { glob } = require('glob');

const files = glob.sync('{src,test}/**/*.ts');

console.log(`Processing ${files.length} files...`);

function sortImportGroup(imports) {
  // Parse imports to understand their structure
  const parsed = imports.map(imp => {
    const text = imp.trim();
    const hasMultipleMembers = text.includes('{') && text.includes(',');
    const hasSingleMember = text.includes('{') && !text.includes(',');
    const isNamespaceOrDefault = !text.includes('{') || text.match(/import\s+\w+\s+from/);

    // Extract the actual imported name(s) for sorting
    let sortKey = text;
    const fromMatch = text.match(/from\s+['"]([^'"]+)['"]/);
    if (fromMatch) {
      sortKey = fromMatch[1].toLowerCase();
    }

    return {
      text,
      hasMultipleMembers,
      hasSingleMember,
      isNamespaceOrDefault,
      sortKey,
    };
  });

  // Group by member type (multiple before single before namespace/default)
  const multipleMembers = parsed.filter(p => p.hasMultipleMembers);
  const singleMembers = parsed.filter(p => p.hasSingleMember);
  const others = parsed.filter(p => p.isNamespaceOrDefault);

  // Sort each group by the from clause
  const sortByKey = (a, b) => a.sortKey.localeCompare(b.sortKey);
  multipleMembers.sort(sortByKey);
  singleMembers.sort(sortByKey);
  others.sort(sortByKey);

  // Combine: multiple, then single, then others
  return [...multipleMembers, ...singleMembers, ...others].map(p => p.text);
}

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find all import groups (separated by blank lines or non-import lines)
  const groups = [];
  let currentGroup = [];
  let groupStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('import ')) {
      if (currentGroup.length === 0) {
        groupStart = i;
      }
      currentGroup.push(line);
    } else if (currentGroup.length > 0) {
      // End of group
      groups.push({ start: groupStart, imports: currentGroup });
      currentGroup = [];
      groupStart = -1;

      // Stop at first non-import, non-blank line
      if (trimmed && !trimmed.startsWith('//')) {
        break;
      }
    }
  }

  // Add last group if exists
  if (currentGroup.length > 0) {
    groups.push({ start: groupStart, imports: currentGroup });
  }

  if (groups.length === 0) continue;

  // Sort each group
  let modified = false;
  for (const group of groups) {
    const sorted = sortImportGroup(group.imports);

    // Check if sorting changed anything
    const changed = sorted.some((s, i) => s !== group.imports[i]);
    if (changed) {
      modified = true;
      // Replace in lines array
      for (let i = 0; i < sorted.length; i++) {
        lines[group.start + i] = sorted[i];
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Fixed: ${filePath}`);
  }
}

console.log('Done!');
