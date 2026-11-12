import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db, schema } from "#/database";
import { sendOtpEmail } from "#/lib/email";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
			? {
					google: {
						clientId: process.env.GOOGLE_CLIENT_ID,
						clientSecret: process.env.GOOGLE_CLIENT_SECRET,
					},
				}
			: {}),
		...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: process.env.GITHUB_CLIENT_ID,
						clientSecret: process.env.GITHUB_CLIENT_SECRET,
					},
				}
			: {}),
		...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
			? {
					twitter: {
						clientId: process.env.TWITTER_CLIENT_ID,
						clientSecret: process.env.TWITTER_CLIENT_SECRET,
					},
				}
			: {}),
	},
	plugins: [
		emailOTP({
			async sendVerificationOTP({ email, otp, type }) {
				try {
					await sendOtpEmail({ email, otp, type });
				} catch (error) {
					console.error("[email-otp] failed to send OTP email", error);
				}
			},
		}),
		tanstackStartCookies(), // must be last
	],
});
