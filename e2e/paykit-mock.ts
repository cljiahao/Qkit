import { createServer, type Server } from "node:http";

// Minimal stand-in for paykit's live `/api/v1/checkout*` surface (see
// src/lib/paykit/client.ts), so e2e can exercise the real checkout-cutover
// code path without a real paykit deployment. CI's e2e job spins up qkit's
// own local Supabase but has nothing listening at NEXT_PUBLIC_PAYKIT_URL —
// this fills that gap for the two order specs that render the pay panel.
// Started once from e2e/global-setup.ts, on a fixed local port referenced by
// playwright.config.ts's webServer.env; global-setup.ts's returned close()
// is used by Playwright as the matching global teardown.
//
// Response shapes mirror paykit's real contract (checkoutResponseSchema /
// transactionStatusResponseSchema in src/lib/paykit/client.ts) closely enough
// for qkit's zod validation to accept them — not a full paykit re-implementation.
export const PAYKIT_MOCK_PORT = 4319;
export const PAYKIT_MOCK_URL = `http://127.0.0.1:${PAYKIT_MOCK_PORT}`;
export const PAYKIT_MOCK_SECRET = "e2e-mock-secret";

type MockStatus = "pending" | "claimed" | "confirmed";

interface MockTransaction {
  id: string;
  orderRef: string;
  amountCents: number;
  status: MockStatus;
  claimedAt: string | null;
  confirmedAt: string | null;
}

function statusBody(tx: MockTransaction) {
  return {
    transaction_id: tx.id,
    status: tx.status,
    amount_cents: tx.amountCents,
    order_ref: tx.orderRef,
    claimed_at: tx.claimedAt,
    confirmed_at: tx.confirmedAt,
  };
}

export function startPaykitMock(): {
  server: Server;
  close: () => Promise<void>;
} {
  // Dedupe on order_ref, same as paykit's real (kit_slug, order_ref) uniqueness
  // — a repeat createCheckout for the same order returns the same transaction.
  const byOrderRef = new Map<string, MockTransaction>();
  const byId = new Map<string, MockTransaction>();
  let nextId = 1;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", PAYKIT_MOCK_URL);
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (req.method === "POST" && url.pathname === "/api/v1/checkout") {
        let parsed: { order_ref?: string; amount_cents?: number };
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          send(400, { error: "invalid JSON" });
          return;
        }
        const orderRef = parsed.order_ref;
        if (!orderRef) {
          send(400, { error: "order_ref is required" });
          return;
        }
        let tx = byOrderRef.get(orderRef);
        if (!tx) {
          tx = {
            id: `mock-tx-${nextId++}`,
            orderRef,
            amountCents: parsed.amount_cents ?? 0,
            status: "pending",
            claimedAt: null,
            confirmedAt: null,
          };
          byOrderRef.set(orderRef, tx);
          byId.set(tx.id, tx);
        }
        // PayNow QR payload — any non-empty string satisfies the client's
        // schema; content isn't asserted on by the e2e specs.
        send(200, {
          type: "qr",
          transaction_id: tx.id,
          payload: `MOCKPAYNOW:${tx.id}`,
        });
        return;
      }

      const claimMatch = /^\/api\/v1\/checkout\/([^/]+)\/claim$/.exec(
        url.pathname,
      );
      const confirmMatch = /^\/api\/v1\/checkout\/([^/]+)\/confirm$/.exec(
        url.pathname,
      );
      const statusMatch = /^\/api\/v1\/checkout\/([^/]+)$/.exec(url.pathname);

      if (req.method === "POST" && claimMatch) {
        const tx = byId.get(claimMatch[1]);
        if (!tx) {
          send(404, { error: "Not found" });
          return;
        }
        if (tx.status === "pending") {
          tx.status = "claimed";
          tx.claimedAt = new Date().toISOString();
        }
        send(200, statusBody(tx));
        return;
      }

      if (req.method === "POST" && confirmMatch) {
        const tx = byId.get(confirmMatch[1]);
        if (!tx) {
          send(404, { error: "Not found" });
          return;
        }
        if (tx.status !== "confirmed") {
          tx.status = "confirmed";
          tx.confirmedAt = new Date().toISOString();
        }
        send(200, statusBody(tx));
        return;
      }

      if (req.method === "GET" && statusMatch) {
        const tx = byId.get(statusMatch[1]);
        if (!tx) {
          send(404, { error: "Not found" });
          return;
        }
        send(200, statusBody(tx));
        return;
      }

      send(404, { error: "Not found" });
    });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
