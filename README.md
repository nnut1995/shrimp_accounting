This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI accounting API

See [API specification](docs/accounting-api.md). Apply
`supabase/migrations/202609250001_accounting_api.sql` after the base schema before
using writes. Run `npm run test:api` for API checks.
The maintained skill copy is [shrimp-trade-analysis](skills/shrimp-trade-analysis/SKILL.md).

## นายหน้า per lot and performance dashboard

Production database updated and feature deployed on 2026-09-29.
Deployment: `dpl_DaKXrb9rc2SCJdbE7MEqKft4Hbtq`.
Live dashboard: https://shrimp-accounting.vercel.app/brokers.
All 83 existing lots retained and initially unassigned.

Apply `supabase/migrations/202609290001_lot_brokers.sql` after the API and lot-update
migrations, then deploy the app. Existing lots default to an unassigned broker.
Enter or edit นายหน้า on each lot; `/brokers` compares performance by purchase
month/year, with broker filters and links to individual lots. Profit includes lot
expenses and selling fees, but excludes monthly overhead. Unsold lots remain in
totals and are flagged. Ratios use aggregate weights/revenue, not averages of lot
percentages. Names are trimmed and grouped by exact name; use suggestions to keep
spelling consistent. Broker commission is still entered as a lot expense.

The API accepts optional `broker` text on POST/PUT and returns it in lot reads and
edit snapshots. Omitting it on PUT preserves the existing broker; an empty string
clears it. Existing idempotency receipts keep working for omitted broker inputs.

Bulk broker assignment is available on the lot list: select individual rows or all
currently shown rows, assign a broker or explicitly clear it, then save. Changing
filters resets selection. The server checks authentication and updates only the
broker field on selected IDs. Bulk release deployed 2026-09-29; 11 tests and the
production build pass. Live browser interaction verification was unavailable
because the browser connection timed out.
