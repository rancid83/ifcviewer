#!/usr/bin/env node
/**
 * 겨울 케이스 chunk JSON에서 Qsens_test, Qsens_ref가 음수인 값을 0으로 수정
 * usage: node scripts/fix-winter-qsens.js
 */

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'public', 'data', 'simulation2');

function fixChunk(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const obj = JSON.parse(raw);
  if (!obj.data || !Array.isArray(obj.data)) return 0;

  let count = 0;
  for (const row of obj.data) {
    if (typeof row.Qsens_test === 'number' && row.Qsens_test < 0) {
      row.Qsens_test = Math.abs(row.Qsens_test);
      count++;
    }
    if (typeof row.Qsens_ref === 'number' && row.Qsens_ref < 0) {
      row.Qsens_ref = Math.abs(row.Qsens_ref);
      count++;
    }
  }
  if (count > 0) {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  }
  return count;
}

function main() {
  const dirs = fs.readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.endsWith('-winter'))
    .map(d => d.name);

  let totalFiles = 0;
  let totalReplacements = 0;

  for (const dir of dirs) {
    const dirPath = path.join(DATA_ROOT, dir);
    const files = fs.readdirSync(dirPath)
      .filter(f => f.startsWith('chunk-') && f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const n = fixChunk(filePath);
      if (n > 0) {
        totalFiles++;
        totalReplacements += n;
      }
    }
  }

  console.log(`Done. Modified ${totalFiles} files, ${totalReplacements} negative Qsens values converted to positive (winter only).`);
}

main();
