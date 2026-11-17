import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({ env: { AGENT_BRIDGE_SECRET: v.string() } });
app.use(agent);
app.use(workflow);
export default app;
