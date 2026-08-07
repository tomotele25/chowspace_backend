/**
 * Works out which Monei credential authenticates.
 *
 * Their dashboard exposes more than one value and the SDK sends whichever it
 * is given as `X-API-KEY`. This tries each credential present in the
 * environment against an endpoint that genuinely requires auth, and reports
 * which one works — without printing any of them.
 *
 *   node scripts/check-monei-key.js
 */
require("dotenv").config();
const https = require("https");

const CANDIDATES = [
  "MONEI_SECRET_KEY",
  "MONEI_API_KEY",
  "MONEI_PUBLIC_KEY",
  "MONEI_KEY",
];

// /api/v1/user/me is behind auth. getBanks is not, so it proves nothing.
const AUTHED_PATH = "/api/v1/user/me";

const attempt = (key, header) =>
  new Promise((resolve) => {
    const req = https.request(
      {
        host: "api.monei.cc",
        path: AUTHED_PATH,
        method: "GET",
        headers: {
          [header]: header === "Authorization" ? `Bearer ${key}` : key,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: body.slice(0, 120) }),
        );
      },
    );
    req.on("error", (e) => resolve({ status: "net", body: e.message }));
    req.end();
  });

(async () => {
  const present = CANDIDATES.filter((name) => process.env[name]);

  if (present.length === 0) {
    console.log("None of these are set in .env:");
    CANDIDATES.forEach((n) => console.log("  " + n));
    process.exit(1);
  }

  console.log("");
  let winner = null;

  for (const name of present) {
    const key = process.env[name];
    // Fingerprint only — never the value itself.
    const shown = `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`;

    for (const header of ["X-API-KEY", "Authorization"]) {
      const r = await attempt(key, header);
      const ok = r.status === 200;
      if (ok && !winner) winner = { name, header };
      console.log(
        `  ${ok ? "WORKS " : "  no  "} ${name.padEnd(18)} ${shown.padEnd(22)} via ${header.padEnd(14)} -> ${r.status}`,
      );
    }
  }

  console.log("");
  if (winner) {
    console.log(`Use ${winner.name} — it authenticates via ${winner.header}.`);
    if (winner.name !== "MONEI_SECRET_KEY") {
      console.log(
        "The code reads MONEI_SECRET_KEY, so copy this value there (and on Vercel).",
      );
    }
  } else {
    console.log(
      "None of the credentials present authenticate. Either every key here is\n" +
        "stale, or the account's API access is restricted — the latter is worth\n" +
        "asking Monei about while the tier upgrade is under review.",
    );
  }

  process.exit(winner ? 0 : 1);
})();
