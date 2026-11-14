import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { emailOTP, jwt, lastLoginMethod } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import Redis from "ioredis";

import { db, schema } from "#/database";
import { sendOtpEmail } from "#/lib/email";

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

const trustedOrigins = [
	"https://chat.abhinab.tech",
	process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
	"http://localhost:3000",
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	trustedOrigins,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	...(redis
		? {
				secondaryStorage: {
					get: async (key: string) => redis.get(key),
					getAndDelete: async (key: string) => {
						const val = await redis.get(key);
						if (val !== null) await redis.del(key);
						return val;
					},
					increment: async (key: string, ttl: number) => {
						const val = await redis.incr(key);
						if (val === 1) await redis.expire(key, ttl);
						return val;
					},
					set: async (key: string, value: string, ttl?: number) => {
						if (ttl) await redis.set(key, value, "EX", ttl);
						else await redis.set(key, value);
					},
					delete: async (key: string) => {
						await redis.del(key);
					},
				},
			}
		: {}),
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
		...(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET
			? {
					twitch: {
						clientId: process.env.TWITCH_CLIENT_ID,
						clientSecret: process.env.TWITCH_CLIENT_SECRET,
					},
				}
			: {}),
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300,
			allowedAttempts: 3,
			async sendVerificationOTP({ email, otp, type }) {
				void sendOtpEmail({ email, otp, type }).catch((error) => {
					console.error("[email-otp] failed to send OTP email", error);
				});
			},
		}),
		jwt({
			jwks: {
				keyPairConfig: {
					alg: "RS256",
				},
			},
			jwt: {
				audience: "chat",
				expirationTime: "6h",
			},
		}),
		lastLoginMethod(),
		tanstackStartCookies(), // must be last
	],
});
