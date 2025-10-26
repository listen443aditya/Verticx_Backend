import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

const RAZORPAY_KEY = process.env.RAZORPAY_KEY ?? "dummy_key";
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET ?? "dummy_secret";

export const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY,
  key_secret: RAZORPAY_SECRET,
});

console.log(
  "Razorpay initialized with key:",
  RAZORPAY_KEY === "dummy_key" ? "dummy_key (fallback)" : "env key"
);
