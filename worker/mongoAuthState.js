const { initAuthCreds, BufferJSON, proto } = require("@whiskeysockets/baileys");

/**
 * Baileys AuthenticationState backed by a MongoDB collection.
 *
 * Baileys ships useMultiFileAuthState, which writes the session to disk. On
 * Render's free tier the filesystem is wiped on every deploy and restart, so
 * a disk session would force a QR re-scan of the business number several
 * times a week. Keeping it in Mongo (the same cluster the API already uses)
 * means the link survives restarts untouched.
 *
 * Layout in collection `wa_session`:
 *   { _id: "creds", value: <creds> }
 *   { _id: "app-state-sync-key-<id>", value: <key> }   (one doc per key)
 *
 * Values are serialised with Baileys' BufferJSON so Buffers round-trip.
 */
async function useMongoAuthState(db) {
  const col = db.collection("wa_session");

  const write = (id, value) =>
    col.updateOne(
      { _id: id },
      { $set: { value: JSON.stringify(value, BufferJSON.replacer) } },
      { upsert: true },
    );

  const read = async (id) => {
    const doc = await col.findOne({ _id: id });
    if (!doc) return null;
    return JSON.parse(doc.value, BufferJSON.reviver);
  };

  const remove = (id) => col.deleteOne({ _id: id });

  const creds = (await read("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              out[id] = value || undefined;
            }),
          );
          return out;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? write(key, value) : remove(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}

module.exports = { useMongoAuthState };
