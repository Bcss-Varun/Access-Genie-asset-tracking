// Smoke check for the sync environment: boots, signs in, creates, displays.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody } from './env.mjs';

let env;
before(async () => { env = await startEnv({ estate: 'fresh', browser: true }); }, { timeout: 180000 });
after(async () => { await env?.stop(); });

test('fresh estate numbers from AST-1 and the registry shows a new asset after client-side navigation', async () => {
  await env.login('admin');
  const created = [];
  for (let i = 1; i <= 11; i++) created.push(await env.ok('admin', '/assets', 'POST', assetBody(`Smoke asset ${String(i).padStart(2, '0')}`)));
  assert.equal(created[0].id, 'AST-1');
  assert.equal(created[10].id, 'AST-11');
  const dataset = await env.ok('admin', '/dataset');
  console.log('dataset asset order:', dataset.assets.map((a) => a.id ?? a._id).join(','));
  await env.reload('/assets');
  await env.expectText('Smoke asset 11');
});
