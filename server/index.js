import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { BankingError, createBank } from './ledger.js';

const customerKey = process.env.TRAINING_CUSTOMER_KEY;
const reviewerKey = process.env.TRAINING_REVIEWER_KEY;
if (!customerKey || !reviewerKey || customerKey.length < 32 || reviewerKey.length < 32 || customerKey === reviewerKey) {
  throw new Error('Set two different random training access keys of at least 32 characters.');
}

const bank = createBank(process.env.TRAINING_DB || 'training.sqlite');
bank.seedTrainingCustomer();

const dist = resolve('dist');
const digest = value => createHash('sha256').update(value).digest();
const customerDigest = digest('Bearer ' + customerKey);
const reviewerDigest = digest('Bearer ' + reviewerKey);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const prefix = '/api/v1/sandbox';

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (req.headers['content-type'] !== 'application/json') throw new BankingError('Expected application/json.', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new BankingError('Request body too large.', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new BankingError('Expected a JSON object.');
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith(prefix + '/')) {
      const name = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = resolve(dist, '.' + name);
      if (req.method !== 'GET' || !file.startsWith(dist + sep)) throw new BankingError('Page not found.', 404);
      const bytes = await readFile(file).catch(() => { throw new BankingError('Page not found. Build the frontend first.', 404); });
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      return res.end(bytes);
    }
    const auth = digest(req.headers.authorization || '');
    const role = timingSafeEqual(auth, customerDigest) ? 'customer' : timingSafeEqual(auth, reviewerDigest) ? 'reviewer' : null;
    if (!role) throw new BankingError('Invalid training access key.', 401);
    const path = url.pathname.slice(prefix.length);
    if (req.method === 'GET' && path === '/session') return json(res, 200, { role });
    if (req.method === 'GET' && path === '/requests') return json(res, 200, bank.requests(role === 'customer' ? role : null));
    if (role === 'customer') {
      if (req.method === 'GET' && path === '/accounts') return json(res, 200, bank.accounts(role));
      if (req.method === 'GET' && path === '/statement') return json(res, 200, bank.statement(role));
      if (req.method === 'POST' && path === '/requests') return json(res, 201, bank.submit(role, await body(req)));
      if (req.method === 'POST' && path === '/transfers') return json(res, 200, bank.transfer(role, req.headers['idempotency-key'], await body(req)));
    } else {
      if (req.method === 'GET' && path === '/audit') return json(res, 200, bank.audit());
      const review = path.match(/^\/requests\/([a-f0-9-]+)\/decision$/);
      if (req.method === 'POST' && review) return json(res, 200, bank.decide(role, review[1], await body(req)));
    }
    throw new BankingError('Endpoint unavailable for this role.', 404);
  } catch (error) {
    if (!(error instanceof BankingError)) console.error(error);
    json(res, error instanceof BankingError ? error.status : 500, { error: error instanceof BankingError ? error.message : 'Unexpected server error.' });
  }
});
server.listen(Number(process.env.TRAINING_PORT || 4174), '127.0.0.1', () => {
  console.log('Training portal at http://127.0.0.1:' + server.address().port + '/#training');
});
