import {
	emailOTPClient,
	jwtClient,
	lastLoginMethodClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_BETTER_AUTH_URL ?? window.location.origin,
	fetchOptions: { credentials: "include" },
	plugins: [emailOTPClient(), jwtClient(), lastLoginMethodClient()],
});
