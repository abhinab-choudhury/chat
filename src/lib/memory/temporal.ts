export class TemporalResolutionError extends Error {}
export interface DateRange {
	from: number;
	to: number;
	label: string;
}
const weekdays = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];
const months = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];
function localParts(instant: number, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(instant);
	const get = (key: string) => Number(parts.find((p) => p.type === key)?.value);
	return Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
}
function midnight(local: number, timezone: string) {
	let utc = local;
	for (let i = 0; i < 5; i++) utc += local - localParts(utc, timezone);
	return utc;
}
/** Explicit grammar; previous calendar week for 'last weekday', most recent past date without year. */
export function resolveDate(
	text: string,
	now: Date,
	timezone: string,
): DateRange | undefined {
	const local = new Date(localParts(now.getTime(), timezone));
	const today = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
	);
	let day: number | undefined;
	const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
	const named = text.match(
		new RegExp(
			`\\b(\\d{1,2})\\s+(${months.join("|")})(?:\\s+(\\d{4}))?\\b`,
			"i",
		),
	);
	const mentionedDates = [
		...text.matchAll(
			new RegExp(
				`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+(?:${months.join("|")})(?:\\s+\\d{4})?|(?:last\\s+|on\\s+)?(?:${weekdays.join("|")}))\\b`,
				"gi",
			),
		),
	].map((m) => m[0].toLowerCase());
	if (new Set(mentionedDates).size > 1)
		throw new TemporalResolutionError(
			"Which historical date should I look up? Please specify one date at a time.",
		);
	const weekday = text.match(
		new RegExp(`\\b(last\\s+|on\\s+)?(${weekdays.join("|")})\\b`, "i"),
	);
	if (iso || named) {
		let year = iso
			? Number(iso[1])
			: Number(named?.[3] || local.getUTCFullYear());
		const month = iso
			? Number(iso[2]) - 1
			: months.indexOf(named?.[2].toLowerCase() ?? "");
		const date = Number(iso ? iso[3] : named?.[1]);
		day = Date.UTC(year, month, date);
		if (!iso && !named?.[3] && day > today) day = Date.UTC(--year, month, date);
		const parsed = new Date(day);
		if (parsed.getUTCMonth() !== month || parsed.getUTCDate() !== date)
			throw new TemporalResolutionError(
				"Please clarify the historical date: that date is invalid.",
			);
	} else if (/\byesterday\b/i.test(text)) day = today - 86400000;
	else if (weekday) {
		const target = weekdays.indexOf(weekday[2].toLowerCase());
		const current = local.getUTCDay();
		const delta =
			weekday[1]?.trim().toLowerCase() === "last"
				? ((current + 6) % 7) + 7 - ((target + 6) % 7)
				: (current - target + 7) % 7 || 7;
		day = today - delta * 86400000;
	}
	if (day === undefined && /\btoday\b/i.test(text)) day = today;
	if (day === undefined) return;
	return {
		from: midnight(day, timezone),
		to: midnight(day + 86400000, timezone),
		label: `${new Date(day).toISOString().slice(0, 10)} (${timezone})`,
	};
}
export function reciprocalRankFusion<T extends { id: string }>(
	lists: T[][],
	limit = 10,
): T[] {
	const scores = new Map<string, { item: T; score: number }>();
	for (const list of lists)
		list.forEach((item, i) => {
			const entry = scores.get(item.id) ?? { item, score: 0 };
			entry.score += 1 / (60 + i + 1);
			scores.set(item.id, entry);
		});
	return [...scores.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((x) => x.item);
}
