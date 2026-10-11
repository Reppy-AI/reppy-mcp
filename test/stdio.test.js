import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dummyKey = 'b'.repeat(64);
async function harness(t) {
  const dir = await mkdtemp(join(tmpdir(), 'reppy-mcp-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const keyFile = join(dir, 'key');
  await writeFile(keyFile, dummyKey + '\n', { mode: 0o600 });
  const calls = [];
  const server = httpServer((req, res) => {
    calls.push({ path: req.url, authorization: req.headers.authorization });
    if (req.url === '/v1/workouts/rate-limited') {
      res.writeHead(429, { 'Retry-After': '7' });
      res.end(dummyKey);
      return;
    }
    if (req.url === '/v1/workouts/redirected') {
      res.writeHead(302, { Location: '/v1/should-not-follow' });
      res.end();
      return;
    }
    const payload = req.url.includes('?')
      ? { unit: 'kg', items: [{ id: 'synthetic-1', name: 'Synthetic routine' }], offset: 2, limit: 3, total: 1 }
      : { id: 'synthetic-1', path: req.url };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => server.listen(0, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', fileURLToPath(new URL('./mock-fetch.js', import.meta.url)), fileURLToPath(new URL('../src/index.js', import.meta.url))],
    env: { ...process.env, REPPY_API_KEY_FILE: keyFile, REPPY_TEST_API_ORIGIN: `http://localhost:${server.address().port}` },
    stderr: 'pipe'
  });
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'synthetic-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  return { client, calls, stderr: () => stderr };
}

test('actual stdio tools list exposes exactly six read-only tools with strict typed schemas', async t => {
  const { client, calls, stderr } = await harness(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_account', 'get_routine', 'get_workout', 'list_routines', 'list_workouts', 'ping']);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  const list = tools.find(tool => tool.name === 'list_workouts');
  assert.equal(list.inputSchema.properties.limit.type, 'integer');
  assert.equal(list.inputSchema.properties.limit.maximum, 100);
  assert.equal(list.inputSchema.properties.offset.maximum, 100000);
  const detail = tools.find(tool => tool.name === 'get_routine');
  assert.deepEqual(detail.inputSchema.required, ['id']);
  assert.equal(calls.length, 0);
  assert.equal(stderr(), '');
});

test('actual SDK tools calls return unchanged text and structured API JSON with header auth', async t => {
  const { client, calls, stderr } = await harness(t);
  for (const [name, args, path] of [
    ['ping', {}, '/v1/ping'], ['get_account', {}, '/v1/me'],
    ['list_routines', { limit: 3, offset: 2 }, '/v1/routines?limit=3&offset=2'],
    ['list_workouts', { limit: 3, offset: 2 }, '/v1/workouts?limit=3&offset=2'],
    ['get_routine', { id: 'routine-1' }, '/v1/routines/routine-1'],
    ['get_workout', { id: 'workout_1' }, '/v1/workouts/workout_1']
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    if (path.includes('?')) assert.deepEqual(result.structuredContent, { unit: 'kg', items: [{ id: 'synthetic-1', name: 'Synthetic routine' }], offset: 2, limit: 3, total: 1 });
    else assert.deepEqual(result.structuredContent, { id: 'synthetic-1', path });
    assert.deepEqual(calls.at(-1), { path, authorization: 'Bearer ' + dummyKey });
  }
  assert.equal(stderr(), '');
});

test('actual MCP rejects bad arguments before HTTP and safely returns 429 and redirect errors', async t => {
  const { client, calls, stderr } = await harness(t);
  for (const [name, args] of [
    ['ping', { account: 'other' }], ['get_routine', { id: '../me' }],
    ['get_workout', { id: '%252f' }], ['list_routines', { limit: 101 }],
    ['list_workouts', { offset: 100001 }], ['list_workouts', { key: dummyKey }]
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true);
  }
  assert.equal(calls.length, 0);
  const limited = await client.callTool({ name: 'get_workout', arguments: { id: 'rate-limited' } });
  assert.equal(limited.isError, true);
  assert.equal(limited.structuredContent.retryAfter, 7);
  assert.equal(limited.structuredContent.status, 429);
  assert.ok(!JSON.stringify(limited).includes(dummyKey));
  assert.equal(calls.length, 1);
  const redirected = await client.callTool({ name: 'get_workout', arguments: { id: 'redirected' } });
  assert.equal(redirected.isError, true);
  assert.equal(redirected.structuredContent.error, 'NETWORK_ERROR');
  assert.equal(calls.length, 2);
  assert.equal(stderr(), '');
});
