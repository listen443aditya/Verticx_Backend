import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config(); // Ensure environment variables are loaded

// 1. Set the API key from your environment variables
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error("CRITICAL: SENDGRID_API_KEY environment variable is not set!");
  // Optionally, throw an error or exit if the key is missing in production
} else {
  sgMail.setApiKey(apiKey);
  console.log("SendGrid API Key configured."); // Add this for confirmation
}

// 2. Define your verified sender email from environment variables
const verifiedSender = process.env.EMAIL_FROM;
if (!verifiedSender) {
  console.error("CRITICAL: EMAIL_FROM environment variable is not set!");
}

/**
 * Sends an OTP email using SendGrid.
 * @param email The recipient's email address.
 * @param otp The 6-digit code.
 */
export const sendOtpEmail = async (
  email: string,
  otp: string
): Promise<void> => {
  if (!apiKey || !verifiedSender) {
    console.error("SendGrid is not configured. Cannot send email.");
    throw new Error("Email service configuration error."); // Prevent sending
  }

  const msg = {
    to: email,
    from: verifiedSender, // Use the verified sender address from your .env
    subject: "Your Verticx Login OTP",
    html: `
      <div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #333;">Your One-Time Password is:</h2>
        <h1 style="font-size: 36px; letter-spacing: 4px; margin: 15px; color: #007bff;">
          ${otp}
        </h1>
        <p style="color: #666;">This code is valid for 10 minutes.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">If you did not request this OTP, please ignore this email.</p>
      </div>
    `,
    // You can also add a plain text version for email clients that don't support HTML
    // text: `Your One-Time Password is: ${otp}. This code will expire in 10 minutes.`,
  };

  try {
    await sgMail.send(msg);
    console.log(`OTP email successfully sent to ${email} via SendGrid.`);
  } catch (error: any) {
    console.error(`Error sending SendGrid email to ${email}:`, error);

    // SendGrid often provides detailed errors in the response body
    if (error.response) {
      console.error("SendGrid Error Body:", error.response.body);
    }
    throw new Error("Failed to send OTP email."); // Re-throw for the controller
  }
};

// Add other email functions (sendWelcomeEmail, sendPasswordResetEmail, etc.) here as needed.
