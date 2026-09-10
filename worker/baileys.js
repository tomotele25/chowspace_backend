const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const nodemailer = require("nodemailer");

const { useMongoAuthState } = require("./mongoAuthState");
const { getRedis } = require("../queues/redis");

/**
 * Owns the single WhatsApp connection for the business line.
 *
 *  - reconnects on any drop except an explicit logout
 *  - on logout (unlinked, or banned) emails an alert and stops trying, because
 *    the fix is a human re-scanning a QR, not another reconnect
 *  - logs the pairing QR so an operator can link the number on first deploy
 *  - watches inbound messages for STOP and records the opt-out in Redis
 */

const STOP_RE = /\b(stop|unsubscribe|opt\s?out|cancel)\b/i;

let sock = null;
let connected = false;
let lastQrAt = null;
let stopped = false;

function jidFor(phone) {
  return `${String(phone).replace(/\D/g, "")}@s.whatsapp.net`;
}
function phoneFromJid(jid) {
  return String(jid || "").split("@")[0];
}

async function alertLoggedOut(reason) {
  console.error(`[wa-worker] LOGGED OUT (${reason}) — number needs re-linking`);
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) return;
  try {
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
    await t.sendMail({
      from: `"ChowSpace" <no-reply@chowspace.ng>`,
      to: EMAIL_USER,
      subject: "⚠️ ChowSpace WhatsApp bot logged out",
      text:
        `The WhatsApp worker lost its session (${reason}).\n\n` +
        `Automated order messages are paused until the business number is ` +
        `re-linked: open the worker logs, scan the QR from WhatsApp > Linked ` +
        `devices. If the number was banned, set WA_ENABLED=false and link a ` +
        `new number.`,
    });
  } catch (err) {
    console.error("[wa-worker] could not send logout alert:", err.message);
  }
}

async function handleInbound({ messages }) {
  const redis = getRedis();
  if (!redis) return;
  for (const msg of messages || []) {
    try {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid || "";
      if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";
      if (!STOP_RE.test(text)) continue;

      const phone = "234" + phoneFromJid(jid).replace(/^234/, "");
      await redis.set(`wa:optout:${phone}`, "1");
      console.log(`[wa-worker] opt-out recorded for ${phone}`);
      await sock.sendMessage(jid, {
        text: "You're opted out — you won't get automated messages from ChowSpace anymore. You can still reply here to reach the vendor.",
      });
    } catch (err) {
      console.error("[wa-worker] inbound handler error:", err.message);
    }
  }
}

async function start(db) {
  const { state, saveCreds } = await useMongoAuthState(db);
  const { version } = await fetchLatestBaileysVersion();

  // Pairing-code login when WA_PAIR_NUMBER is set (digits, country code, no +).
  // The QR printed to Render's log viewer is usually too distorted to scan;
  // a pairing code is plain text you type into WhatsApp > Linked devices >
  // "Link with phone number instead".
  const pairNumber = (process.env.WA_PAIR_NUMBER || "").replace(/\D/g, "");
  const usePairingCode = Boolean(pairNumber);

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false, // stay unobtrusive; don't steal presence from the phone
  });

  if (usePairingCode && !sock.authState.creds.registered) {
    // Small delay so the socket finishes its initial handshake first.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairNumber);
        console.log(
          `\n[wa-worker] PAIRING CODE for +${pairNumber}: ${code}\n` +
            `Enter it in WhatsApp on that phone: Settings > Linked devices > ` +
            `Link a device > Link with phone number instead.\n`,
        );
      } catch (err) {
        console.error("[wa-worker] requestPairingCode failed:", err.message);
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("messages.upsert", handleInbound);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      lastQrAt = new Date();
      console.log(
        "\n[wa-worker] Scan to link the business number " +
          "(WhatsApp > Linked devices):\n",
      );
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      connected = true;
      console.log("[wa-worker] connected");
    }

    if (connection === "close") {
      connected = false;
      // Baileys attaches a Boom error; the status code tells logout apart from
      // a transient drop.
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        stopped = true;
        alertLoggedOut("DisconnectReason.loggedOut");
        return;
      }
      if (stopped) return;
      const delay = 5000;
      console.warn(
        `[wa-worker] connection closed (code ${code}) — reconnecting in ${delay}ms`,
      );
      setTimeout(() => start(db).catch((e) => console.error(e)), delay);
    }
  });

  return sock;
}

/** Sends plain text. Throws if not connected so the caller can 5xx for retry. */
async function sendText(phone, text) {
  if (!sock || !connected) throw new Error("whatsapp not connected");
  await sock.sendMessage(jidFor(phone), { text });
}

function status() {
  return { connected, lastQrAt, stopped };
}

module.exports = { start, sendText, status };
