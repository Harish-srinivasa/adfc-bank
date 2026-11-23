import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export class BankingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function amountMinor(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new BankingError('Use a positive amount in paise.');
  return value;
}

export function createBank(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, owner TEXT, kind TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS journal (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, request_key TEXT NOT NULL, input TEXT NOT NULL,
      booked TEXT NOT NULL, debit TEXT NOT NULL REFERENCES accounts(id),
      credit TEXT NOT NULL REFERENCES accounts(id), amount INTEGER NOT NULL CHECK(amount > 0),
      CHECK(debit <> credit), UNIQUE(actor, request_key)
    ) STRICT;
    CREATE VIEW IF NOT EXISTS journal_lines AS
      SELECT id AS journal_id, debit AS account_id, 'DEBIT' AS side, amount FROM journal
      UNION ALL SELECT id, credit, 'CREDIT', amount FROM journal;
    CREATE TRIGGER IF NOT EXISTS journal_no_update BEFORE UPDATE ON journal
      BEGIN SELECT RAISE(ABORT, 'Journal is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS journal_no_delete BEFORE DELETE ON journal
      BEGIN SELECT RAISE(ABORT, 'Journal is immutable'); END;
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL,
      details TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('PENDING','APPROVED','REJECTED')),
      created TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, reference TEXT NOT NULL, occurred TEXT NOT NULL
    ) STRICT;
    INSERT OR IGNORE INTO accounts VALUES ('TRAINING-CASH', NULL, 'clearing');
  `);

  const now = () => new Date().toISOString();
  const owned = (id, owner) => db.prepare('SELECT 1 FROM accounts WHERE id = ? AND owner = ?').get(id, owner);
  const balance = id => db.prepare(`
    SELECT COALESCE(SUM(CASE side WHEN 'CREDIT' THEN amount ELSE -amount END), 0) AS amount
    FROM journal_lines WHERE account_id = ?
  `).get(id).amount;
  const audit = (actor, action, ref) => db.prepare('INSERT INTO audit(actor, action, reference, occurred) VALUES (?, ?, ?, ?)').run(actor, action, ref, now());
  const post = (actor, key, input, from, to, amount) => {
    const id = randomUUID();
    db.prepare('INSERT INTO journal VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, actor, key, input, now(), from, to, amount);
    audit(actor, 'POSTED', id);
    return { id, state: 'POSTED' };
  };
  function atomic(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    accounts(owner) {
      return db.prepare('SELECT id, kind FROM accounts WHERE owner = ? ORDER BY id').all(owner)
        .map(account => ({ ...account, availableMinor: balance(account.id) }));
    },
    statement(owner) {
      return db.prepare(`
        SELECT j.id, j.booked, l.account_id AS accountId, l.side, l.amount AS amountMinor
        FROM journal_lines l JOIN journal j ON j.id = l.journal_id
        JOIN accounts a ON a.id = l.account_id WHERE a.owner = ?
        ORDER BY j.booked DESC, j.id DESC LIMIT 100
      `).all(owner);
    },
    transfer(actor, key, { from, to, amount }) {
      amountMinor(amount);
      if (!/^[\w-]{16,100}$/.test(key ?? '') || typeof from !== 'string' || typeof to !== 'string' || from === to) {
        throw new BankingError('Select two different accounts and pass a valid idempotency key.');
      }
      const input = JSON.stringify([from, to, amount]);
      return atomic(() => {
        const existing = db.prepare('SELECT id, input FROM journal WHERE actor = ? AND request_key = ?').get(actor, key);
        if (existing) {
          if (existing.input !== input) throw new BankingError('This request key has already been used.', 409);
          return { id: existing.id, state: 'POSTED' };
        }
        if (!owned(from, actor) || !owned(to, actor)) throw new BankingError('Select accounts owned by this customer.', 403);
        if (balance(from) < amount) throw new BankingError('Insufficient available balance.', 409);
        return post(actor, key, input, from, to, amount);
      });
    },
    requests(owner) {
      return owner
        ? db.prepare('SELECT * FROM requests WHERE owner = ? ORDER BY created DESC LIMIT 100').all(owner)
        : db.prepare('SELECT * FROM requests ORDER BY created DESC LIMIT 100').all();
    },
    submit(owner, { kind, details }) {
      const categories = new Set(['savings', 'current', 'salary', 'fixed-deposit', 'recurring-deposit',
        'debit-card', 'credit-card', 'personal-loan', 'home-loan', 'vehicle-loan', 'education-loan',
        'business-loan', 'dispute']);
      if (!categories.has(kind) || typeof details !== 'string' || details.length > 240) {
        throw new BankingError('Choose a supported request type. Details can contain up to 240 characters.');
      }
      return atomic(() => {
        const id = randomUUID();
        db.prepare("INSERT INTO requests VALUES (?, ?, ?, ?, 'PENDING', ?)").run(id, owner, kind, details.trim(), now());
        audit(owner, 'SUBMITTED', id);
        return { id, state: 'PENDING' };
      });
    },
    decide(actor, id, { state }) {
      if (!['APPROVED', 'REJECTED'].includes(state)) throw new BankingError('Choose approve or reject.');
      return atomic(() => {
        const item = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
        if (!item) throw new BankingError('Request not found.', 404);
        if (item.owner === actor) throw new BankingError('A reviewer cannot approve their own request.', 403);
        if (item.state !== 'PENDING') throw new BankingError('This request was already reviewed.', 409);
        db.prepare('UPDATE requests SET state = ? WHERE id = ?').run(state, id);
        if (state === 'APPROVED' && ['savings', 'current', 'salary'].includes(item.kind)) {
          db.prepare('INSERT INTO accounts VALUES (?, ?, ?)').run(randomUUID(), item.owner, item.kind);
        }
        audit(actor, state, id);
        return { id, state };
      });
    },
    seedTrainingCustomer() {
      return atomic(() => {
        if (owned('TRAINING-SAVINGS', 'customer')) return;
        db.prepare('INSERT INTO accounts VALUES (?, ?, ?)').run('TRAINING-SAVINGS', 'customer', 'savings');
        db.prepare('INSERT INTO accounts VALUES (?, ?, ?)').run('TRAINING-CURRENT', 'customer', 'current');
        post('system', 'initial-training-funds', 'Synthetic opening balance', 'TRAINING-CASH', 'TRAINING-SAVINGS', 100000);
      });
    },
    audit() {
      return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all();
    },
    close() { db.close(); },
  };
}
