import assert from 'node:assert/strict';
import test from 'node:test';

// Exercise browser synchronization without a live database or personal records.
test('cloud sync preserves old browser data, accepts deletions, and reports failed writes', async () => {
  const cache = new Map<string, string>([
    ['klinik_dompu_wbp_v1', JSON.stringify([{ id: 'legacy', nama: 'Test', kamar: '1' }])],
  ]);
  Object.defineProperty(globalThis, 'localStorage', { value: {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
  }, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { addEventListener() {} }, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: { visibilityState: 'hidden', addEventListener() {} }, configurable: true });
  const originalInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => originalInterval(...args).unref()) as typeof setInterval;
  const originalFetch = globalThis.fetch;
  let fail = false;
  globalThis.fetch = async () => fail
    ? new Response('{}', { status: 503 })
    : Response.json({ wbp: [], kunjungan: [], referensi: [], penyakit: [], master_obat: [], resep_obat: [] });
  try {
    const { store } = await import('../src/lib/storage');
    await store.syncFromDatabase();
    assert.equal(store.getSyncState(), 'online');
    assert.equal(store.getWbpList().length, 0);
    assert.equal(JSON.parse(store.getLegacyBackup()!).wbp[0].id, 'legacy');
    assert.deepEqual(store.getMasterObatList(), []);
    fail = true;
    store.logAudit('test', 'connection failure');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.getSyncState(), 'error');
    fail = false;
    await store.syncFromDatabase();
    assert.equal(store.getSyncState(), 'error', 'do not hide an unsaved write with a successful read');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalInterval;
  }
});
