import { drainMemoryJobs } from "./service.server";

let started = false;
/** Local Node worker. First chat request starts recovery; no queue service needed. */
export function startMemoryWorker() {
	if (started) return;
	started = true;
	const timer = setInterval(() => {
		void drainMemoryJobs().catch(() => {});
	}, 60000);
	timer.unref();
	void drainMemoryJobs().catch(() => {});
}
