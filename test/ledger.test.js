import test from 'node:test';
import assert from 'node:assert/strict';
import { createBank } from '../server/ledger.js';

test('training seed and transfers produce balanced lines and replay safely', t => {
  const bank = createBank(':memory:');
  t.after(() => bank.close());
  bank.seedTrainingCustomer();
  bank.seedTrainingCustomer();
  const transfer = { from: 'TRAINING-SAVINGS', to: 'TRAINING-CURRENT', amount: 3500 };
  const posted = bank.transfer('customer', 'first-request-1234', transfer);
  assert.deepEqual(bank.transfer('customer', 'first-request-1234', transfer), posted);
  assert.throws(() => bank.transfer('customer', 'first-request-1234', { ...transfer, amount: 4000 }), { status: 409 });
  const lines = bank.statement('customer').filter(line => line.id === posted.id);
  assert.equal(lines.length, 2);
  assert.equal(lines.find(line => line.side === 'DEBIT').amountMinor, lines.find(line => line.side === 'CREDIT').amountMinor);
  assert.deepEqual(bank.accounts('customer').map(row => row.availableMinor), [3500, 96500]);
});

test('insufficient funds, invalid money and unrelated accounts do not post', t => {
  const bank = createBank(':memory:');
  t.after(() => bank.close());
  bank.seedTrainingCustomer();
  const transfer = { from: 'TRAINING-SAVINGS', to: 'TRAINING-CURRENT', amount: 100001 };
  const key = 'second-request-1234';
  assert.throws(() => bank.transfer('customer', key, transfer), { status: 409 });
  assert.throws(() => bank.transfer('stranger', key, { ...transfer, amount: 1 }), { status: 403 });
  assert.throws(() => bank.transfer('customer', key, { ...transfer, amount: 0.5 }), { status: 400 });
  assert.equal(bank.statement('customer').length, 1);
});

test('only a separate reviewer can approve a pending account and approval is atomic', t => {
  const bank = createBank(':memory:');
  t.after(() => bank.close());
  const request = bank.submit('customer', { kind: 'salary', details: 'Training' });
  assert.deepEqual(bank.requests('stranger'), []);
  assert.throws(() => bank.decide('customer', request.id, { state: 'APPROVED' }), { status: 403 });
  assert.equal(bank.decide('reviewer', request.id, { state: 'APPROVED' }).state, 'APPROVED');
  assert.throws(() => bank.decide('reviewer', request.id, { state: 'REJECTED' }), { status: 409 });
  assert.equal(bank.accounts('customer')[0].kind, 'salary');
  assert.equal(bank.accounts('customer')[0].availableMinor, 0);
  assert.equal(bank.audit().length, 2);
});
