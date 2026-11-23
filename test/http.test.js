import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('training HTTP authorization, review and concurrent replay', { timeout: 10000 }, async t => {
  const customer = 'customer-' + randomUUID();
  const reviewer = 'reviewer-' + randomUUID();
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, TRAINING_CUSTOMER_KEY: customer, TRAINING_REVIEWER_KEY: reviewer,
      TRAINING_PORT: '0', TRAINING_DB: ':memory:' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => server.kill());
  const [line] = await once(server.stdout, 'data');
  const base = line.toString().match(/http:\/\/[^#\s]+/)[0];
  const api = (path, token, payload, key) => fetch(new URL('api/v1/sandbox/' + path, base), {
    method: payload ? 'POST' : 'GET',
    headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(payload && { 'Content-Type': 'application/json' }),
      ...(key && { 'Idempotency-Key': key }) },
    body: payload && JSON.stringify(payload),
  });

  assert.equal((await api('accounts')).status, 401);
  assert.equal((await api('accounts', reviewer)).status, 404);
  assert.equal((await api('audit', customer)).status, 404);
  const request = await api('requests', customer, { kind: 'salary', details: 'Synthetic request' });
  assert.equal(request.status, 201);
  const { id } = await request.json();
  const decision = 'requests/' + id + '/decision';
  assert.equal((await api(decision, customer, { state: 'APPROVED' })).status, 404);
  assert.equal((await api(decision, reviewer, { state: 'APPROVED' })).status, 200);
  const transfer = { from: 'TRAINING-SAVINGS', to: 'TRAINING-CURRENT', amount: 50000 };
  const replies = await Promise.all([1, 2].map(() => api('transfers', customer, transfer, 'same-key-for-both-requests')));
  assert.deepEqual(replies.map(reply => reply.status), [200, 200]);
  const [first, retry] = await Promise.all(replies.map(reply => reply.json()));
  assert.deepEqual(first, retry);
  const accounts = await (await api('accounts', customer)).json();
  assert.equal(accounts.find(account => account.id === 'TRAINING-SAVINGS').availableMinor, 50000);
});
