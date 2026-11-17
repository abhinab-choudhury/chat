import { httpRouter } from "convex/server";
import { chat } from "./agent/http";

const http = httpRouter();
http.route({ path: "/agent/chat", method: "POST", handler: chat });
export default http;
