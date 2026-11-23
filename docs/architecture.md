# Architecture and implementation plan

The supplied ZIP is a Vite/React/Material UI frontend deployed by GitHub Pages. It talks to an external Cloudflare Worker that signs users in against Firebase and exposes synthetic Firestore balances. The archive includes no Worker source, Firebase configuration for server verification, security rules, central ledger source, or deployable database schema. Worker-side authorization, account ownership, settlement and ledger invariants cannot be audited from the archive.

## Integration boundary

- `src/live-api.js`, `src/cloudflare-config.js`, `src/bank-config.js`, `src/amount.js` and the original deployment workflow are preserved.
- The request handlers within LiveBank remain intact. Existing routes are POST /api/v1/banks/{bankId}/sign-in, GET /api/v1/banks/{bankId}/dashboard, GET /api/v1/directory/banks, and POST /api/v1/banks/{bankId}/transfers. Transfers use the existing idempotency key implementation, destination IFSC and INR minor units.
- Existing tokens are held in browser memory and used as bearer credentials. The original configurable Worker origin is a trust boundary because sign-in credentials are sent there. Only use the origin supplied by the SharedBank operator. Existing browser sign-out clears local state. Server revocation and MFA could not be reviewed.
- Live statements and summaries are based on the latest 50 transfers returned by the Worker, with only completed items included in totals. They are views of transfer activity, not certified bank statements.
- The local training service uses SQLite with a separate journal, account records, workflow requests and audit events. It serves its training UI and namespaced API on loopback. Its operator-generated credentials are distinct from Firebase. It neither receives the Firebase token nor contacts the shared Worker.

## Sequence

1. Audit the source and keep the Worker contracts intact.
2. Redesign sign-in, dashboard, accounts, transfers and activity.
3. Add independently testable training workflows and a journal for local financial operations.
4. Validate the frontend build, sandbox scenarios and preserved integration source. Live settlement verification requires an authorized SharedBank environment.
5. For deployment beyond training, get operator approval and the Worker source, then reconcile the existing ledger, document identities and ownership, and integrate shared authorization, role claims and provider callbacks before enabling new money movements.
