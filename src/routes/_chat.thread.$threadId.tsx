import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/thread/$threadId")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_chat/thread/$threadId"!</div>;
}
