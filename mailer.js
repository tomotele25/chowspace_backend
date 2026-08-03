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
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 30px;">
          <h2 style="text-align: center; color: #AE2108;">Welcome to <span style="font-weight: bold;">Chowspace</span> 🍽️</h2>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            Hi there,<br/><br/>
            Thanks for registering <strong>${businessName}</strong> on Chowspace.
            Confirm your email address to log in and start setting up your store.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #AE2108; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Confirm my email
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
            This link expires in 24 hours. If the button doesn't work, paste this into your browser:<br/>
            <span style="color:#AE2108; word-break: break-all;">${link}</span>
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
            After confirming, you'll add your products and upload your business
            documents (CAC, a valid ID and proof of address). Once we've reviewed
            them your store goes live to customers.
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
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 30px;">
          <h2 style="text-align: center; color: #AE2108;">
            ${approved ? "You're verified 🎉" : "One more step"}
          </h2>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            ${
              approved
                ? `Your documents have been approved. <strong>${businessName}</strong> is now visible to customers on Chowspace.`
                : `We couldn't approve the documents for <strong>${businessName}</strong> yet.`
            }
          </p>
          ${
            !approved && reviewNote
              ? `<div style="background:#fef3c7; border-radius:6px; padding:14px; margin:20px 0; font-size:14px; color:#92400e;">
                   <strong>What to fix:</strong><br/>${reviewNote}
                 </div>`
              : ""
          }
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://chowspace.ng/vendors/Verification" style="background-color: #AE2108; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              ${approved ? "Go to my dashboard" : "Re-upload documents"}
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280;">Cheers,<br/>The Chowspace Team</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, response: info.response };
  } catch (error) {
    console.error("Error sending verification decision email:", error);
    return { success: false, error };
  }
};

module.exports = {
  sendSignupEmail,
  orderConfirmationEmail,
  sendVendorVerificationEmail,
  sendVerificationDecisionEmail,
};
