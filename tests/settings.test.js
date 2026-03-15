/**
 * Settings tests (getSettings, saveSettings, proxyUrl).
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadStorage() {
  const storageCode = readFileSync(join(__dirname, '../js/storage.js'), 'utf8');
  const html = `<!DOCTYPE html><html><body><script>${storageCode}</script></body></html>`;
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
  });
  return { Storage: dom.window.Storage, localStorage: dom.window.localStorage };
}

describe('Settings getSettings defaults', () => {
  it('returns all expected default keys', () => {
    const { Storage } = loadStorage();
    const s = Storage.getSettings();
    assert.strictEqual(s.colorScheme, 'system');
    assert.strictEqual(s.style, 'minimal');
    assert.strictEqual(s.refreshInterval, 30);
    assert.strictEqual(s.postsPerPage, 15);
    assert.strictEqual(s.feedOrder, 'alphabetical');
    assert.strictEqual(s.navPosition, 'top');
    assert.strictEqual(s.proxyUrl, '');
  });

  it('proxyUrl defaults to empty string', () => {
    const { Storage } = loadStorage();
    assert.strictEqual(Storage.getSettings().proxyUrl, '');
  });
});

describe('Settings saveSettings / getSettings round-trip', () => {
  it('persists proxyUrl', () => {
    const { Storage } = loadStorage();
    const s = Storage.getSettings();
    s.proxyUrl = 'https://my-worker.example.workers.dev';
    Storage.saveSettings(s);
    const loaded = Storage.getSettings();
    assert.strictEqual(loaded.proxyUrl, 'https://my-worker.example.workers.dev');
  });

  it('persists other settings alongside proxyUrl', () => {
    const { Storage } = loadStorage();
    const s = Storage.getSettings();
    s.colorScheme = 'dark';
    s.proxyUrl = 'https://custom.example.com';
    Storage.saveSettings(s);
    const loaded = Storage.getSettings();
    assert.strictEqual(loaded.colorScheme, 'dark');
    assert.strictEqual(loaded.proxyUrl, 'https://custom.example.com');
  });

  it('clears proxyUrl when set to empty string', () => {
    const { Storage } = loadStorage();
    const s = Storage.getSettings();
    s.proxyUrl = 'https://custom.example.com';
    Storage.saveSettings(s);
    s.proxyUrl = '';
    Storage.saveSettings(s);
    assert.strictEqual(Storage.getSettings().proxyUrl, '');
  });

  it('does not expose legacy proxy keys', () => {
    const { Storage, localStorage } = loadStorage();
    // Simulate old data with legacy keys
    localStorage.setItem('justrss-settings', JSON.stringify({
      proxy: 'old-value',
      proxySelfHosted: true,
      proxyUrls: ['a', 'b'],
      colorScheme: 'light',
    }));
    const s = Storage.getSettings();
    assert.ok(!('proxy' in s));
    assert.ok(!('proxySelfHosted' in s));
    assert.ok(!('proxyUrls' in s));
    assert.strictEqual(s.colorScheme, 'light');
  });
});
