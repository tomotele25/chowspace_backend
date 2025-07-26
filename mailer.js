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
    from: `"Chowspace 🍽️" <${process.env.EMAIL_USER}>`,
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

module.exports = { sendSignupEmail, orderConfirmationEmail };
