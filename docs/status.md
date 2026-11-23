# Feature status

| Area | Delivered | Remaining |
|---|---|---|
| SharedBank | Original Firebase sign-in via Worker, directory, account balances, same-bank and interbank transfer submission and status | Live end-to-end settlement and server-side controls require SharedBank access. |
| Customer experience | Responsive overview, available and held balances, quick actions, transfer form, recent flow summary and transfer history | Spending categories, monthly income reporting, formal statements, profiles, registration, KYC, nominees and lifecycle controls. |
| Training accounts | Savings, current and salary request and approval. Two seeded synthetic accounts. Own-account transfers and journal activity. | Fixed and recurring deposit servicing, maintenance, limits, fees, interest and reversals. |
| Cards, loans and disputes | Training request intake, status and reviewer decisions | Issuance, repayment, underwriting, statements, chargebacks, complaints escalation, credit scoring and provider connections. Approval records a decision only for these requests. |
| Ledger | Training chart of accounts, immutable balanced journal, balances derived from journal lines, atomic updates, idempotency and audit events | Legacy ledger verification, accounting periods, settlement reconciliation, reversals, period close and accounting controls. |
| Transfers and beneficiaries | Existing SharedBank flow and separately posted training transfers | Scheduling, beneficiary verification, cooling-off, automated reconciliation, and specific payment rails where supported by the operator. |
| Pricing and promotions | Pending | Versioned interest, fees, tax, commissions, offers, coupons, cashback and rewards. |
| Merchants and notifications | Pending | Merchant onboarding, settlement and refunds. Email, SMS, in-app notifications and reminders. |
| Administration and security | Separate training customer and reviewer roles, object ownership for transfers, authorization checks, account approval and audit history | Institutional RBAC, full maker-checker coverage, fraud monitoring, production-grade session controls, MFA, regulated providers and KYC/AML controls. |

## Deployment and regulatory review

This repository supports synthetic training. A production applicability review belongs with the institution operating the service. Review RBI KYC/AML directions, the entity-specific digital payment security directions, the card issuance and conduct requirements, applicable payment system and rail rules, PCI DSS with the card provider, and India's Digital Personal Data Protection framework. Confirm effective dates, regulated entity classification, and provider responsibilities before deploying. References for that review include the [RBI master directions index](https://www.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx) and [RBI Commercial Banks Digital Payment Security Controls Directions](https://www.rbi.org.in/SCRIPTS/BS_ViewMasDirections.aspx?id=13642).
