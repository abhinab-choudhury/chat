import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => {
	// Load server credentials from .env / .env.local during local development.
	const localEnv = loadEnv(mode, process.cwd(), "");
	for (const key of [
		"GEMINI_API_KEY",
		"OPENAI_API_KEY",
		"OPENAI_MODEL",
		"GEMINI_MODEL",
		"OLLAMA_BASE_URL",
		"SERPER_API_KEY",
		"DATABASE_URL",
		"REDIS_URL",
		"REDIS_URL_PRIVATE",
	]) {
		if (process.env[key] === undefined && localEnv[key]) {
			process.env[key] = localEnv[key];
		}
	}
	return {
		resolve: { tsconfigPaths: true },
		plugins: [
			devtools(),
			nitro({ rollupConfig: { external: [/^@sentry\//] } }),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
			babel({ presets: [reactCompilerPreset()] }),
		],
	};
});

export default config;
