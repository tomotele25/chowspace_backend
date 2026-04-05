
const MoneiSDK = require("monei-sdk");

const sdk = new MoneiSDK({ apiKey: process.env.MONEI_API_KEY });

module.exports = { sdk };
