const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const orderConfirmationEmail = async (to, subject) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject,
    text: "Thank you for your order on Chowspace!",
    html: `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); padding: 30px;">
        <h2 style="text-align: center; color: #AE2108;">Thank you for your order!</h2>
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
          Hi there 👋,
          <br/><br/>
          We're excited to let you know your order has been received and is being processed. Our partner restaurant is preparing your meal with care and it will be on its way shortly!
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://chowspace.ng/Payment-Redirect" style="background-color: #AE2108; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Track My Order
          </a>
        </div>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
          Need help? Just reply to this email and we’ll be happy to assist you.
          <br/><br/>
          Stay hungry (in a good way), <br/>
          🍴 The Chowspace Team
        </p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
        &copy; ${new Date().getFullYear()} Chowspace. All rights reserved.
      </p>
    </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
};

const sendSignupEmail = async (to, subject) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject,
    text: "Welcome to ChowSpace!",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 30px;">
          <h2 style="text-align: center; color: #AE2108;">Welcome to <span style="font-weight: bold;">Chowspace</span> 🍽️</h2>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            Hi there,<br/><br/>
            We're excited to have you on Chowspace — your one-stop solution for ordering amazing meals near you.
            Get ready to discover your next favorite dish and enjoy seamless ordering!
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://chowspace.ng" style="background-color: #AE2108; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Visit Chowspace
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
            If you have any questions, feel free to reply to this email. We’re always here to help!
            <br/><br/>
            Cheers, <br/>
            The Chowspace Team
          </p>
        </div>
        <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
          &copy; ${new Date().getFullYear()} Chowspace. All rights reserved.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
};

/* ══════════════════════════════════════════════════════════════════════
   Shared branding for vendor emails
   ══════════════════════════════════════════════════════════════════════ */

// Site theme, so emails don't look like they came from somewhere else.
const BRAND = "#AE2108";
const BRAND_DARK = "#941B06";
const PAGE_BG = "#F7F5F2"; // matches the app background
const INK = "#111827";
const MUTED = "#6b7280";

// A 200x200 copy on Cloudinary rather than /logo.jpg, which is 1.5MB — far
// too heavy for an email, and Gmail proxies images so it would be slow.
const LOGO_URL =
  "https://res.cloudinary.com/dayafwzz7/image/upload/v1785787497/chowspace_brand/email-logo.png";

const SITE = "https://chowspace.ng";

/**
 * Wraps content in the Chowspace shell.
 *
 * Table-based with inline styles because Outlook ignores flexbox, grid and
 * most stylesheets. Images are blocked by default in many clients, so the
 * layout must still read with the logo missing — hence the wordmark below it
 * rather than relying on the image alone.
 */
const emailShell = ({
  heading,
  intro,
  ctaLabel,
  ctaHref,
  body = "",
  footer = "",
}) => `
<div style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td align="center" style="padding-bottom:20px;">
          <img src="${LOGO_URL}" width="56" height="56" alt="Chowspace"
               style="display:block;border:0;border-radius:16px;object-fit:cover;" />
          <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:${INK};letter-spacing:-0.2px;padding-top:8px;">
            Chowspace
          </div>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:20px;padding:32px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.3px;">
            ${heading}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#374151;">
            ${intro}
          </p>

          ${
            ctaHref
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                   <tr><td style="background:${BRAND};border-radius:12px;">
                     <a href="${ctaHref}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                       ${ctaLabel}
                     </a>
                   </td></tr>
                 </table>`
              : ""
          }

          ${body}
        </td></tr>

        <tr><td style="padding:20px 8px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          ${
            footer
              ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:${MUTED};">${footer}</p>`
              : ""
          }
          <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;text-align:center;">
            <a href="${SITE}" style="color:${MUTED};text-decoration:none;">chowspace.ng</a>
            &nbsp;·&nbsp; &copy; ${new Date().getFullYear()} Chowspace
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</div>`;

/** A soft callout block, e.g. the next-steps list or a rejection reason. */
const panel = (title, inner, tone = "neutral") => {
  const tones = {
    neutral: { bg: "#F7F5F2", border: "#eee7e2", text: "#374151" },
    warn: { bg: "#fef3c7", border: "#fde68a", text: "#92400e" },
  };
  const t = tones[tone] || tones.neutral;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
      <tr><td style="background:${t.bg};border:1px solid ${t.border};border-radius:14px;padding:16px 18px;">
        ${
          title
            ? `<div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};padding-bottom:10px;">${title}</div>`
            : ""
        }
        <div style="font-size:13px;line-height:1.7;color:${t.text};">${inner}</div>
      </td></tr>
    </table>`;
};

/**
 * Confirmation link for a self-signed-up vendor. They cannot log in until they
 * click it, so a delivery failure locks them out — the caller must surface a
 * failure rather than swallowing it, and offer a resend.
 */
const sendVendorVerificationEmail = async (to, { businessName, link }) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject: "Confirm your email to finish setting up your Chowspace store",
    text: `Welcome to Chowspace! Confirm your email address to finish setting up ${businessName}: ${link}`,
    html: emailShell({
      heading: `Confirm your email to open ${businessName}`,
      intro: `Thanks for registering <strong style="color:${INK};">${businessName}</strong> on Chowspace. Confirm this address and you can log in and start building your store.`,
      ctaLabel: "Confirm my email",
      ctaHref: link,
      body:
        panel(
          "What happens next",
          `<table role="presentation" cellpadding="0" cellspacing="0">
             ${[
               "Log in and add your logo and at least 7 products",
               "Upload your CAC, a valid ID and proof of address",
               "We review them — usually within a day",
               "Your store goes live to customers",
             ]
               .map(
                 (s, i) => `<tr>
                   <td valign="top" style="padding:0 10px 8px 0;">
                     <span style="display:inline-block;width:20px;height:20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:11px;font-weight:800;text-align:center;line-height:20px;">${i + 1}</span>
                   </td>
                   <td valign="top" style="padding:0 0 8px;font-size:13px;line-height:1.6;color:#374151;">${s}</td>
                 </tr>`,
               )
               .join("")}
           </table>`,
        ) +
        `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
           This link expires in 24 hours. If the button doesn't work, paste this into your browser:<br/>
           <a href="${link}" style="color:${BRAND};word-break:break-all;text-decoration:none;">${link}</a>
         </p>`,
      footer:
        "You're receiving this because someone registered a business with this address on Chowspace. If that wasn't you, ignore this email — no account can be used until it's confirmed.",
    }),
  };

  const info = await transporter.sendMail(mailOptions);
  return { success: true, response: info.response };
};

/** Told to the vendor when their documents are approved or rejected. */
const sendVerificationDecisionEmail = async (
  to,
  { businessName, approved, reviewNote },
) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject: approved
      ? `${businessName} is now live on Chowspace 🎉`
      : `We need another look at ${businessName}'s documents`,
    text: approved
      ? `Your documents have been approved and ${businessName} is live on Chowspace.`
      : `We couldn't approve your documents. ${reviewNote || ""}`,
    html: emailShell({
      heading: approved
        ? `${businessName} is live 🎉`
        : "We need another look at your documents",
      intro: approved
        ? `Your documents have been approved. <strong style="color:${INK};">${businessName}</strong> is now visible to customers on Chowspace, and you can start taking orders.`
        : `We couldn't approve the documents for <strong style="color:${INK};">${businessName}</strong> yet. Re-upload and we'll take another look.`,
      ctaLabel: approved ? "Go to my dashboard" : "Re-upload documents",
      ctaHref: approved
        ? `${SITE}/vendors/Dashboard`
        : `${SITE}/vendors/Verification`,
      body:
        !approved && reviewNote
          ? panel("What to fix", reviewNote, "warn")
          : approved
            ? panel(
                "A good next step",
                "Set your opening hours so your store opens and closes on its own, and add cover photos to your storefront.",
              )
            : "",
    }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, response: info.response };
  } catch (error) {
    console.error("Error sending verification decision email:", error);
    return { success: false, error };
  }
};

/**
 * Sent when an admin creates a vendor rather than the vendor signing up.
 *
 * Those accounts used to be given the password "vendor123", which was a
 * literal in the admin page and therefore shipped in the public JS bundle —
 * so anyone who read the source and guessed an email could sign in. The
 * password is now random and reaches the vendor only here.
 */
const sendVendorInviteEmail = async (
  to,
  { businessName, link, tempPassword },
) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject: `Your Chowspace store is ready — sign in to ${businessName}`,
    text:
      `A Chowspace store has been created for ${businessName}.

` +
      `Email: ${to}
Temporary password: ${tempPassword}

` +
      `Confirm your email address to sign in: ${link}`,
    html: emailShell({
      heading: `Your store ${businessName} is ready`,
      intro: `We've set up <strong style="color:${INK};">${businessName}</strong> on Chowspace. Confirm this address, then sign in with the temporary password below.`,
      ctaLabel: "Confirm my email",
      ctaHref: link,
      body:
        panel(
          "Your sign-in details",
          `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#374151;">Email<br><strong style="color:${INK};font-size:14px;">${to}</strong></p>
           <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#374151;">Temporary password<br><strong style="color:${INK};font-size:16px;letter-spacing:1px;font-family:ui-monospace,Menlo,monospace;">${tempPassword}</strong></p>`,
        ) +
        panel(
          "Change it once you're in",
          `This password was generated for you and sent by email, so treat it as temporary. Set your own from Business Profile as soon as you sign in.`,
          "warn",
        ),
    }),
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Vendor invite email failed:", error.message);
    throw error;
  }
};

/**
 * Sent when a vendor adds a manager to their team.
 *
 * Same reasoning as the vendor invite: the password used to be the literal
 * "manager123" in the vendor dashboard, and therefore in the public bundle.
 */
const sendManagerInviteEmail = async (
  to,
  { fullname, businessName, tempPassword },
) => {
  const mailOptions = {
    from: '"ChowSpace" <no-reply@chowspace.ng>',
    to,
    subject: `You've been added to ${businessName} on Chowspace`,
    text:
      `${fullname}, you can now manage ${businessName} on Chowspace.

` +
      `Email: ${to}
Temporary password: ${tempPassword}

` +
      `Sign in at ${SITE}/Login and change it from your profile.`,
    html: emailShell({
      heading: `You can now manage ${businessName}`,
      intro: `Hi ${fullname}, you've been added as a manager for <strong style="color:${INK};">${businessName}</strong>. Sign in with the details below.`,
      ctaLabel: "Sign in",
      ctaHref: `${SITE}/Login`,
      body:
        panel(
          "Your sign-in details",
          `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#374151;">Email<br><strong style="color:${INK};font-size:14px;">${to}</strong></p>
           <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#374151;">Temporary password<br><strong style="color:${INK};font-size:16px;letter-spacing:1px;font-family:ui-monospace,Menlo,monospace;">${tempPassword}</strong></p>`,
        ) +
        panel(
          "Change it once you're in",
          `This password was generated for you and sent by email, so treat it as temporary. Set your own from your profile as soon as you sign in.`,
          "warn",
        ),
    }),
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Manager invite email failed:", error.message);
    throw error;
  }
};

module.exports = {
  sendSignupEmail,
  sendVendorInviteEmail,
  sendManagerInviteEmail,
  orderConfirmationEmail,
  sendVendorVerificationEmail,
  sendVerificationDecisionEmail,
};
