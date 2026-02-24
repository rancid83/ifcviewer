#!/usr/bin/env node
/**
 * case-summary.json 내 에너지 관련 숫자(slotEnergy.sum/avg, dailyTotalAvg, avgEnergyTest)가
 * 음수이면 절댓값(양수)으로 변환
 */

const fs = require('fs');
const path = require('path');

const SUMMARY_PATH = path.join(__dirname, '..', 'public', 'data', 'simulation2', 'case-summary.json');

function toAbs(n) {
  return typeof n === 'number' && n < 0 ? Math.abs(n) : n;
}

function run() {
  const raw = fs.readFileSync(SUMMARY_PATH, 'utf8');
  const obj = JSON.parse(raw);
  const cases = obj.cases || {};
  let count = 0;

  for (const key of Object.keys(cases)) {
    const c = cases[key];
    if (c.slotEnergy && typeof c.slotEnergy === 'object') {
      for (const slotKey of Object.keys(c.slotEnergy)) {
        const slot = c.slotEnergy[slotKey];
        if (slot && typeof slot === 'object') {
          if (typeof slot.sum === 'number' && slot.sum < 0) {
            slot.sum = Math.abs(slot.sum);
            count++;
          }
          if (typeof slot.avg === 'number' && slot.avg < 0) {
            slot.avg = Math.abs(slot.avg);
            count++;
          }
        }
      }
    }
    if (typeof c.dailyTotalAvg === 'number' && c.dailyTotalAvg < 0) {
      c.dailyTotalAvg = Math.abs(c.dailyTotalAvg);
      count++;
    }
    if (typeof c.avgEnergyTest === 'number' && c.avgEnergyTest < 0) {
      c.avgEnergyTest = Math.abs(c.avgEnergyTest);
      count++;
    }
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(obj, null, 2), 'utf8');
  console.log('Done. Converted', count, 'negative values to positive in case-summary.json');
}

run();
