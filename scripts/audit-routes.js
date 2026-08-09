/**
 * Walks the Express app and reports every route with no guard.
 *
 * Written because the original audit was done by reading files, and reading
 * files is how twenty-three open endpoints survived in the first place. This
 * asks the router itself what is mounted, so a route added later without a
 * guard shows up here rather than in an incident.
 *
 *   node scripts/audit-routes.js          list unguarded routes
 *   node scripts/audit-routes.js --all    list every route
 */
require("dotenv").config();

const path = require("path");

// Routes that are deliberately open, with the reason. Anything not on this
// list and not guarded is a finding.
const INTENTIONALLY_PUBLIC = {
  "POST /api/auth/user/signup": "public signup",
  "POST /api/auth/user/login": "public login",
  "GET /api/auth/verify-email": "email link, carries its own token",
  "POST /api/auth/resend-verification": "pre-login",
  "POST /api/vendor/create": "public vendor signup",
  "GET /api/vendor/vendorTotalCount": "public count",
  "GET /api/vendor/getVendors": "storefront listing",
  "GET /api/vendor/:slug": "storefront page",
  "GET /api/getVendorStatusById/:vendorId": "open/closed badge",
  "GET /api/vendor/:vendorId/reviews": "public reviews",
  "GET /api/vendor/:vendorId/opening-hours": "public hours",
  "GET /api/vendor/:vendorId/live-status": "public open/closed",
  "GET /api/vendors/:vendorId/in-app-chat": "public feature flag",
  "GET /api/product/vendor/:id": "public menu",
  "GET /api/product/vendor/slug/:slug": "public menu",
  "GET /api/locations/:vendorId": "delivery quote before login",
  "GET /api/getLocations": "public list",
  "GET /api/platform-locations": "public list",
  "GET /api/packing-fee/:vendorId": "public fee",
  "GET /api/dispute/reasons": "static list",
  "POST /api/orders": "guest checkout",
  "POST /api/payment/monei/initialize": "guest checkout",
  "POST /api/payment/monei/verify": "provider-driven",
  "POST /api/orders/monei/webhook": "HMAC-verified in controller",
  "GET /api/confirm/:orderId": "link sent to a guest customer",
  "POST /api/customers/birthday": "guest checkout prompt",
  "POST /api/chat/:roomId/message":
    "guests chat; senderType derived from token",
  "GET /api/chat/:roomId": "guests read their order thread",
  "POST /api/upload": "guests attach receipts in chat",
  "POST /api/jobs/email": "Upstash signature verified in controller",
  "GET /api/cron/sync-store-status": "CRON_SECRET checked in controller",
  "GET /": "health check",
};

const GUARD_NAMES = ["guard", "attachUserIfPresent"];

function collect(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      const p = prefix + layer.route.path;
      for (const h of layer.route.stack) {
        const method = h.method?.toUpperCase();
        if (!method) continue;
        const handlers = layer.route.stack.map((s) => s.name);
        out.push({ method, path: p, handlers });
        break;
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const mount =
        layer.regexp?.source
          ?.replace("^\\/", "/")
          .replace("\\/?(?=\\/|$)", "")
          .replace(/\\\//g, "/")
          .replace(/\$$/, "") || "";
      collect(
        layer.handle.stack,
        prefix + (mount === "/(?=/|$)" ? "" : mount),
        out,
      );
    }
  }
}

(async () => {
  const { app } = require(path.join(process.cwd(), "api", "server.js"));

  // Give the async route mounting in server.js a moment to finish.
  await new Promise((r) => setTimeout(r, 1500));

  const routes = [];
  collect(app._router?.stack || app.router?.stack || [], "", routes);

  const showAll = process.argv.includes("--all");
  let open = 0;

  console.log("");
  for (const r of routes) {
    // Express reports the path relative to the router's mount point, so
    // compare without the /api prefix rather than trying to reconstruct it.
    const key = `${r.method} ${r.path}`;
    const guarded = r.handlers.some((h) => GUARD_NAMES.includes(h));
    const allowed =
      INTENTIONALLY_PUBLIC[key] ||
      INTENTIONALLY_PUBLIC[`${r.method} /api${r.path}`];

    if (guarded) {
      if (showAll) console.log(`  guarded   ${key}`);
    } else if (allowed) {
      if (showAll) console.log(`  public    ${key}  (${allowed})`);
    } else {
      open += 1;
      console.log(`  UNGUARDED ${key}`);
    }
  }

  console.log(`\n${routes.length} routes, ${open} unguarded and unexplained.`);
  process.exit(open === 0 ? 0 : 1);
})();
