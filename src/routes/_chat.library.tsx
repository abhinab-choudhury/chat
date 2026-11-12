import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/library")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_chat/library"!</div>;
}
