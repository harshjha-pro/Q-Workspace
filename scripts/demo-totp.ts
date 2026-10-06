/** npm run demo:totp — print the current 6-digit code for the demo Partners, Managers and Admins. */
import { generate } from "otplib";
import { DEMO_TOTP_SECRET } from "../prisma/seed/demo";

const code = await generate({ secret: DEMO_TOTP_SECRET });
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`Demo authenticator code: ${code}  (valid ~${left}s)`);
