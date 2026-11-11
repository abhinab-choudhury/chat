<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

UI and auth guidance now lives in installed skills (`shadcn`, `better-auth-*`). Prefer loading those skills instead of duplicating their content here. Project specifics: shadcn config in `components.json` (style `new-york`, baseColor `zinc`, Tailwind v4, aliases `#/components/ui`); Better Auth server config `src/lib/auth.ts`, client `src/lib/auth-client.ts`, version ^1.5.3.
