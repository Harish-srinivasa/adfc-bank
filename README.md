# Bank portal template

Register the bank with the SharedBank operator. Set its bank ID, name, IFSC and branding in `src/bank-config.js`. Set the common HTTPS Worker URL in `src/cloudflare-config.js`, or set the repository variable `VITE_X42_API_URL`.

On Node.js 22 or newer, run `npm ci` and `npm run dev` to work locally. The portal uses the bank's Firebase test account and displays live synthetic balances from the Worker.

Publish this folder to a GitHub repository and enable its GitHub Pages source with **GitHub Actions**. The supplied workflow deploys the `main` branch.

## Updated ADFC Bank portal

The default page continues to use the existing SharedBank Worker and Firebase test sign-in. GitHub Pages builds and serves this mode as before. The dashboard summarizes recent completed transfers, and transfer history supports status filtering and amount or date sorting.

### Local training workspace

Use Node.js 22.13 or newer for the built-in SQLite module. From this directory:

1. Run `npm ci` and `npm run build`.
2. Copy `.env.example` to `.env`. Generate two distinct access keys by running
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   twice. Set `TRAINING_CUSTOMER_KEY` and `TRAINING_REVIEWER_KEY` to the two results.
3. Run `npm run training`, then open the loopback URL ending in `/#training` printed by the server.
4. Use the customer key to move synthetic funds between the two seeded accounts or submit a request. Sign out and use the reviewer key to approve or reject requests and inspect the audit trail.
5. Run `npm test` to execute the local domain and HTTP tests.

SQLite creates its schema automatically at startup and seeds the two training accounts once. By default it writes `training.sqlite` in the project directory. No Firebase configuration or changes to the Worker are required for training. The training UI uses a separate access key kept in memory. Use only synthetic information.

See [architecture](docs/architecture.md), [feature status](docs/status.md), [API contract](docs/openapi.json), and [verification](docs/verification.md).
