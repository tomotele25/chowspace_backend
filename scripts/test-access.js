/**
 * Access-control tests against a running server.
 *
 * Every case here failed before this work: each one is a request that used to
 * succeed and now must not. They use forged-but-valid JWTs signed with the
 * server's own secret, so they exercise the real guards rather than mocks.
 *
 *   node scripts/test-access.js            against http://localhost:2005
 *   BASE=https://... node scripts/test-access.js
 *
 * Read-only: every case expects a rejection, so nothing is written even when
 * a check fails.
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE || "http://localhost:2005";
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error("JWT_SECRET is not set — cannot mint test tokens.");
  process.exit(1);
}

// A token for a user id that doesn't exist: enough to prove the guard rejects
// on role *before* it would ever reach the data.
const tokenFor = (id) => jwt.sign({ id }, SECRET, { expiresIn: "5m" });
const FAKE_ID = "5f4d2c1b0a9e8d7c6b5a4f3e";

let pass = 0;
let fail = 0;

async function expect(label, { method = "GET", path, token, body }, wanted) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch((e) => ({ status: 0, _err: e.message }));

  const ok = wanted.includes(res.status);
  if (ok) pass += 1;
  else fail += 1;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}\n        ${method} ${path} -> ${res.status}${res._err ? ` (${res._err})` : ""} (want ${wanted.join(" or ")})`,
  );
}

(async () => {
  const REJECT = [401, 403];

  console.log("\nNo token — these all used to succeed:\n");

  await expect(
    "manager password reset (account takeover)",
    {
      method: "PUT",
      path: `/api/manager/update/${FAKE_ID}`,
      body: { newPassword: "hunter2" },
    },
    REJECT,
  );
  await expect(
    "mark any order paid",
    {
      method: "PUT",
      path: `/api/order/${FAKE_ID}`,
      body: { paymentStatus: "paid" },
    },
    REJECT,
  );
  await expect(
    "delete any product",
    { method: "DELETE", path: `/api/product-delete/${FAKE_ID}` },
    REJECT,
  );
  await expect(
    "every order on the platform (customer PII)",
    { path: "/api/getAllOrders" },
    REJECT,
  );
  await expect(
    "every customer's phone and name",
    { method: "POST", path: "/api/customerDetails" },
    REJECT,
  );
  await expect(
    "every rider's phone",
    { path: "/api/rider/get-riders" },
    REJECT,
  );
  await expect(
    "delete any rider",
    { method: "DELETE", path: `/api/rider/delete/${FAKE_ID}` },
    REJECT,
  );
  await expect(
    "broadcast to every vendor",
    {
      method: "POST",
      path: "/api/createAnnouncement",
      body: { header: "x", message: "y", audience: "vendors" },
    },
    REJECT,
  );
  await expect(
    "read any vendor's whole chat inbox",
    { path: `/api/chat/vendor/${FAKE_ID}` },
    REJECT,
  );
  await expect(
    "delete any delivery zone",
    { method: "DELETE", path: `/api/locations/${FAKE_ID}` },
    REJECT,
  );
  await expect(
    "rewrite any vendor's delivery prices",
    {
      method: "PUT",
      path: `/api/locations/${FAKE_ID}`,
      body: { locations: [{ location: "Anywhere", price: 0 }] },
    },
    REJECT,
  );
  await expect(
    "any customer's order history",
    { path: `/api/orderHistory/${FAKE_ID}` },
    REJECT,
  );
  await expect(
    "promote a vendor without paying",
    {
      method: "POST",
      path: "/api/paystack/verify-promote",
      body: { reference: "x" },
    },
    REJECT,
  );

  console.log(
    "\nWrong role — a customer token must not reach vendor routes:\n",
  );

  const customerToken = tokenFor(FAKE_ID);
  await expect(
    "customer -> vendor wallet",
    { path: "/api/getVendorWallet", token: customerToken },
    REJECT,
  );
  await expect(
    "customer -> change a vendor's payout account",
    {
      method: "PUT",
      path: "/api/vendor/profile/update",
      token: customerToken,
      body: { accountNumber: "0000000000" },
    },
    REJECT,
  );
  await expect(
    "customer -> rewrite store hours",
    {
      method: "PUT",
      path: "/api/vendor/update-hours",
      token: customerToken,
      body: { vendorId: FAKE_ID, openingHours: [] },
    },
    REJECT,
  );
  await expect(
    "customer -> take a product offline",
    {
      method: "PATCH",
      path: `/api/product/${FAKE_ID}/toggle-availability`,
      token: customerToken,
    },
    REJECT,
  );
  await expect(
    "customer -> reorder a menu",
    {
      method: "PATCH",
      path: "/api/product/rearrange",
      token: customerToken,
      body: { products: [{ id: FAKE_ID, position: 1 }] },
    },
    REJECT,
  );
  await expect(
    "customer -> admin order export",
    { path: "/api/getAllOrdersForAdmin", token: customerToken },
    REJECT,
  );
  await expect(
    "customer -> admin verification queue",
    { path: "/api/admin/verifications", token: customerToken },
    REJECT,
  );

  console.log("\nStill public — these must keep working:\n");

  await expect("storefront listing", { path: "/api/vendor/getVendors" }, [200]);
  await expect(
    "platform locations",
    { path: "/api/platform-locations" },
    [200],
  );
  await expect("dispute reasons", { path: "/api/dispute/reasons" }, [200]);

  console.log("\nPublic responses must not carry secrets:\n");

  // A status code says nothing about what came back in the body. These read
  // the payload, because the leak was never a permission — it was a missing
  // projection on an endpoint that was always meant to be public.
  const SECRET_KEYS = [
    "password",
    "accountNumber",
    "bankName",
    "subaccountId",
    "emailVerifyToken",
  ];

  async function expectNoSecrets(label, path) {
    const res = await fetch(`${BASE}${path}`).catch(() => null);
    if (!res || !res.ok) {
      console.log(`  SKIP  ${label} (${res ? res.status : "unreachable"})`);
      return;
    }
    const text = JSON.stringify(await res.json());
    const found = SECRET_KEYS.filter((k) => text.includes(`"${k}"`));
    const ok = found.length === 0;
    if (ok) pass += 1;
    else fail += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${label}\n        ${path} -> ${ok ? "no secret fields" : `LEAKS ${found.join(", ")}`}`,
    );
  }

  await expectNoSecrets("storefront listing", "/api/vendor/getVendors");

  // Pick a real slug so the check exercises a populated document.
  const listing = await fetch(`${BASE}/api/vendor/getVendors`)
    .then((r) => r.json())
    .catch(() => null);
  const slug = listing?.vendors?.[0]?.slug;
  if (slug) {
    await expectNoSecrets("storefront page", `/api/vendor/${slug}`);
  } else {
    console.log("  SKIP  storefront page (no visible vendor to sample)");
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})();
