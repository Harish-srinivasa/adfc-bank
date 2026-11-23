import { useState } from 'react';
import { Alert, Button, MenuItem, TextField } from '@mui/material';
import { Landmark } from 'lucide-react';
import { toPaise } from './amount';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const money = minor => currency.format(minor / 100);
const kinds = ['savings', 'current', 'salary', 'fixed-deposit', 'recurring-deposit', 'debit-card', 'credit-card',
  'personal-loan', 'home-loan', 'vehicle-loan', 'education-loan', 'business-loan', 'dispute'];

async function api(token, path, data, key) {
  const response = await fetch('./api/v1/sandbox/' + path, {
    method: data ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(data && { 'Content-Type': 'application/json' }), ...(key && { 'Idempotency-Key': key }) },
    body: data && JSON.stringify(data),
    redirect: 'error',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Open the local training server to use this workspace.');
  return result;
}

function Table({ headings, rows }) {
  if (!rows.length) return <div className="empty">No records yet</div>;
  return <div className="table-scroll"><table>
    <thead><tr>{headings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
    <tbody>{rows.map(({ key, cells }) => <tr key={key}>
      {cells.map((cell, index) => <td key={index}>{cell}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

export default function Training() {
  const [key, setKey] = useState('');
  const [session, setSession] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState(kinds[0]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pending, setPending] = useState(null);

  async function load({ token, role }) {
    const sections = role === 'reviewer' ? ['requests', 'audit'] : ['requests', 'accounts', 'statement'];
    const entries = await Promise.all(sections.map(async section => [section, await api(token, section)]));
    setView(Object.fromEntries(entries));
  }

  async function run(work) {
    setBusy(true);
    setError('');
    setMessage('');
    try { await work(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function signIn(event) {
    event.preventDefault();
    run(async () => {
      const { role } = await api(key, 'session');
      const next = { token: key, role };
      await load(next);
      setSession(next);
      setKey('');
    });
  }

  function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const details = new FormData(form).get('details');
    run(async () => {
      await api(session.token, 'requests', { kind, details });
      form.reset();
      setMessage('Request submitted for review.');
      await load(session);
    });
  }

  function transfer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const amount = toPaise(new FormData(form).get('amount'));
    if (amount === null || from === to) {
      setError('Choose two different accounts and enter a positive INR amount.');
      return;
    }
    if (!window.confirm('Move ' + money(amount) + ' between these training accounts?')) return;
    const details = { from, to, amount };
    const signature = JSON.stringify(details);
    const requestKey = pending?.signature === signature ? pending.key : crypto.randomUUID();
    setPending({ key: requestKey, signature });
    run(async () => {
      const result = await api(session.token, 'transfers', details, requestKey);
      setPending(null);
      setMessage('Posted · ' + result.id);
      form.reset();
      await load(session);
    });
  }

  function review(id, state) {
    if (!window.confirm(state === 'APPROVED' ? 'Approve this training request?' : 'Reject this training request?')) return;
    run(async () => {
      await api(session.token, 'requests/' + id + '/decision', { state });
      await load(session);
    });
  }

  const reviewer = session?.role === 'reviewer';
  return <div className="layout live-bank-layout">
    <aside className="sidebar"><div className="brand">
      <span className="brand-icon"><Landmark size={22} /></span><span><strong>ADFC BANK</strong><small>TRAINING</small></span>
    </div><a className="switch-link" href="./">SharedBank portal</a></aside>
    <div className="main">
      <header className="topbar"><strong>Local training workspace</strong>
        {session && <Button disabled={busy} onClick={() => {
          setSession(null); setView(null); setPending(null); setFrom(''); setTo(''); setError(''); setMessage('');
        }}>Sign out</Button>}
      </header>
      <main className="content live-bank-content">
        <div className="page-head"><div><h1>{session ? reviewer ? 'Reviewer console' : 'Training accounts' : 'Training sign-in'}</h1>
          <p>Synthetic balances and local records</p></div></div>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {!session && <section className="panel live-sign-in">
          <header className="panel-head"><h2>Access key</h2></header>
          <form className="transfer-form" onSubmit={signIn}>
            <TextField type="password" label="Training access key" required value={key} onChange={event => setKey(event.target.value)} />
            <div><Button variant="contained" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></div>
          </form>
        </section>}
        {session && view && <>
          {!reviewer && <>
            <div className="accounts">{view.accounts.map((account, index) =>
              <section className={'account-card account-color-' + (index % 3)} key={account.id}>
                <strong>{account.kind}</strong><div className="account-value">{money(account.availableMinor)}</div>
                <span>{account.id}</span></section>)}</div>
            <div className="overview">
              <section className="panel"><header className="panel-head"><h2>Own-account transfer</h2></header>
                <form className="transfer-form" onSubmit={transfer}>
                  {[['From', from, setFrom], ['To', to, setTo]].map(([label, value, update]) =>
                    <TextField key={label} label={label} select required value={value} onChange={event => update(event.target.value)}>
                      {view.accounts.map(account => <MenuItem key={account.id} value={account.id}>{account.kind} · {account.id}</MenuItem>)}
                    </TextField>)}
                  <TextField name="amount" label="Amount in INR" required slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                  <div><Button type="submit" variant="contained" disabled={busy}>Review transfer</Button></div>
                </form>
              </section>
              <section className="panel"><header className="panel-head"><h2>Product or dispute request</h2></header>
                <form className="transfer-form" onSubmit={submitRequest}>
                  <TextField select label="Request type" value={kind} onChange={event => setKind(event.target.value)}>
                    {kinds.map(value => <MenuItem key={value} value={value}>{value.replaceAll('-', ' ')}</MenuItem>)}
                  </TextField>
                  <TextField name="details" label="Details" helperText="Use synthetic information only." slotProps={{ htmlInput: { maxLength: 240 } }} />
                  <div><Button type="submit" variant="contained" disabled={busy}>Submit for review</Button></div>
                </form>
              </section>
            </div>
          </>}
          <section className="panel"><header className="panel-head"><h2>Requests</h2>
            <Button disabled={busy} onClick={() => run(() => load(session))}>Refresh</Button></header>
            <Table headings={['Request', 'Details', 'Status', ...(reviewer ? ['Decision'] : [])]} rows={view.requests.map(item => ({
              key: item.id, cells: [item.kind, item.details, item.state, ...(reviewer ? [
                item.state === 'PENDING' && <><Button disabled={busy} onClick={() => review(item.id, 'APPROVED')}>Approve</Button>
                  <Button disabled={busy} onClick={() => review(item.id, 'REJECTED')}>Reject</Button></>,
              ] : [])],
            }))} />
          </section>
          <section className="panel"><header className="panel-head"><h2>{reviewer ? 'Audit trail' : 'Journal activity'}</h2></header>
            {reviewer
              ? <Table headings={['Time', 'Actor', 'Action', 'Reference']} rows={view.audit.map(row => ({
                key: row.id, cells: [row.occurred, row.actor, row.action, row.reference],
              }))} />
              : <Table headings={['Time', 'Account', 'Side', 'Amount', 'Reference']} rows={view.statement.map(row => ({
                key: row.id + row.side, cells: [row.booked, row.accountId, row.side, money(row.amountMinor), row.id],
              }))} />}
          </section>
        </>}
      </main>
    </div>
  </div>;
}
