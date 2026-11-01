// TEST-004: pure-logic checks, run inside the page against the real code.
const { test } = require('@playwright/test');
const { expect, openApp } = require('./helpers');

test('calculateRisk thresholds', async ({ page }) => {
  await openApp(page);
  const labels = await page.evaluate(() => {
    const S = app.state.constructor;
    return [[1, 4], [1, 5], [3, 3], [2, 5], [3, 4], [3, 5], [5, 5]].map(([l, i]) => `${l * i}:${S.calculateRisk(l, i).label}`);
  });
  expect(labels).toEqual(['4:Low', '5:Medium', '9:Medium', '10:High', '12:High', '15:Critical', '25:Critical']);
});

test('generateNextThreatId skips gaps and ignores foreign ids', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const out = [];
    app.state.threats = []; out.push(app.generateNextThreatId());
    app.state.threats = [{ id: 'th-001' }, { id: 'th-007' }, { id: 'custom' }]; out.push(app.generateNextThreatId());
    app.state.threats = [{ id: 'th-999' }]; out.push(app.generateNextThreatId());
    return out;
  });
  expect(ids).toEqual(['th-001', 'th-008', 'th-1000']);
});

test('mergeThreatSuggestions de-duplicates by category + title, case-insensitively', async ({ page }) => {
  await openApp(page);
  const n = await page.evaluate(() => {
    app.threatSuggestions = app.getDefaultThreatSuggestions();
    app.mergeThreatSuggestions({ process: [{ category: 'Spoofing', title: 'A', desc: '' }] });
    app.mergeThreatSuggestions({ process: [{ category: ' spoofing ', title: ' a ', desc: 'dup' }, { category: 'Tampering', title: 'A', desc: '' }] });
    return app.threatSuggestions.process.length;
  });
  expect(n).toBe(2);
});
