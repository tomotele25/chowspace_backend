const { MoneiSDK } = require("monei-sdk");
const Vendor = require("../models/vendor");

/**
 * Bank lookup and account verification, for vendors setting up payouts.
 *
 * Instant payout needs a bank *code*, not a bank name — the provider lists
 * around 700 institutions and "Zenith" alone does not identify one. Until now
 * the only bank list in the codebase was a hardcoded map of fourteen Paystack
 * codes, duplicated between the backend and the vendor profile page, so most
 * banks could not be chosen at all.
 */

let monei = null;
const getMonei = () => {
  if (!monei) monei = new MoneiSDK({ apiKey: process.env.MONEI_SECRET_KEY });
  return monei;
};

// The list changes rarely and is the same for everyone, so it is fetched once
// per process rather than on every page load.
let bankCache = { at: 0, banks: null };
const CACHE_MS = 6 * 60 * 60 * 1000;

const getBanks = async (req, res) => {
  try {
    if (bankCache.banks && Date.now() - bankCache.at < CACHE_MS) {
      return res.status(200).json({ success: true, banks: bankCache.banks });
    }

    const result = await getMonei().walletUtility.getBanks();
    const raw = result?.data || result || [];

    const banks = raw
      .map((b) => ({ code: b.code, name: b.name }))
      .filter((b) => b.code && b.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    bankCache = { at: Date.now(), banks };
    return res.status(200).json({ success: true, banks });
  } catch (err) {
    console.error("getBanks error:", err.message);
    return res
      .status(502)
      .json({ success: false, message: "Could not load the bank list" });
  }
};

/**
 * Confirms an account number really belongs to someone, and returns the name
 * the bank holds for it.
 *
 * Worth the extra step: a mistyped digit otherwise sends a vendor's takings to
 * a stranger, and there is no way to recall a completed transfer.
 */
const verifyBankAccount = async (req, res) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Account number and bank are required",
      });
  }

  if (!/^\d{10}$/.test(String(accountNumber))) {
    return res
      .status(400)
      .json({ success: false, message: "Account numbers are 10 digits" });
  }

  try {
    const result = await getMonei().walletUtility.verifyBankAccount({
      accountNumber: String(accountNumber),
      bank: String(bankCode),
    });
    const data = result?.data || result;

    if (!data?.accountName) {
      return res
        .status(404)
        .json({ success: false, message: "We couldn't find that account" });
    }

    return res
      .status(200)
      .json({ success: true, accountName: data.accountName });
  } catch (err) {
    console.error("verifyBankAccount error:", err.message);
    return res.status(400).json({
      success: false,
      message: "We couldn't verify that account. Check the number and bank.",
    });
  }
};

/**
 * Saves the vendor's payout account after verifying it.
 *
 * Separate from the general profile update, which only wrote bank details when
 * a Paystack subaccount could also be created and never updated them again —
 * one reason 39 of 41 vendors have no payout account on file.
 */
const savePayoutAccount = async (req, res) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Account number and bank are required",
      });
  }

  try {
    const verified = await getMonei().walletUtility.verifyBankAccount({
      accountNumber: String(accountNumber),
      bank: String(bankCode),
    });
    const accountName = (verified?.data || verified)?.accountName;

    if (!accountName) {
      return res
        .status(400)
        .json({ success: false, message: "We couldn't verify that account" });
    }

    const banksResult = await getMonei().walletUtility.getBanks();
    const bank = (banksResult?.data || banksResult || []).find(
      (b) => String(b.code) === String(bankCode),
    );

    const vendor = await Vendor.findByIdAndUpdate(
      req.vendorId,
      {
        $set: {
          accountNumber: String(accountNumber),
          bankCode: String(bankCode),
          bankName: bank?.name || null,
          accountName,
        },
      },
      { new: true },
    ).select("accountNumber bankCode bankName accountName");

    return res.status(200).json({
      success: true,
      message: "Payout account saved",
      account: vendor,
    });
  } catch (err) {
    console.error("savePayoutAccount error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Could not save that account" });
  }
};

module.exports = { getBanks, verifyBankAccount, savePayoutAccount };
