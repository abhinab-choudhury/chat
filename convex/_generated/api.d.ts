/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_http from "../agent/http.js";
import type * as agent_memory from "../agent/memory.js";
import type * as agent_state from "../agent/state.js";
import type * as agent_validators from "../agent/validators.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as projects from "../projects.js";
import type * as schema_messages from "../schema/messages.js";
import type * as schema_products from "../schema/products.js";
import type * as schema_projects from "../schema/projects.js";
import type * as schema_threads from "../schema/threads.js";
import type * as threads from "../threads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/http": typeof agent_http;
  "agent/memory": typeof agent_memory;
  "agent/state": typeof agent_state;
  "agent/validators": typeof agent_validators;
  http: typeof http;
  messages: typeof messages;
  projects: typeof projects;
  "schema/messages": typeof schema_messages;
  "schema/products": typeof schema_products;
  "schema/projects": typeof schema_projects;
  "schema/threads": typeof schema_threads;
  threads: typeof threads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
