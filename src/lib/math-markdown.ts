/** Normalize model math delimiters before Markdown can consume backslashes.
 * Code is kept verbatim; unfinished formulas stay buffered while streaming.
 */
export function prepareMathMarkdown(source: string, streaming = false): string {
	let result = "";
	let i = 0;
	while (i < source.length) {
		// Fences may contain both backticks and LaTeX examples.
		if (i === 0 || source[i - 1] === "\n") {
			const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(
				source.slice(i),
			);
			if (fence) {
				const marker = fence[2];
				const closing = new RegExp(
					`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*$`,
					"m",
				);
				const rest = source.slice(i + fence[0].length);
				const end = closing.exec(rest);
				const length = end
					? fence[0].length + end.index + end[0].length
					: source.length - i;
				result += source.slice(i, i + length);
				i += length;
				continue;
			}
		}
		if (source[i] === "`") {
			const run = /^`+/.exec(source.slice(i))?.[0] ?? "`";
			let end = source.indexOf(run, i + run.length);
			while (
				end !== -1 &&
				(source[end - 1] === "`" || source[end + run.length] === "`")
			) {
				end = source.indexOf(run, end + run.length);
			}
			const length = end === -1 ? source.length - i : end + run.length - i;
			result += source.slice(i, i + length);
			i += length;
			continue;
		}
		const pair = source.slice(i, i + 2);
		const opener =
			pair === "\\(" || pair === "\\[" || pair === "$$"
				? pair
				: source[i] === "$"
					? "$"
					: null;
		if (opener) {
			const closer =
				opener === "\\(" ? "\\)" : opener === "\\[" ? "\\]" : opener;
			let end = source.indexOf(closer, i + opener.length);
			while (end !== -1) {
				let backslashes = 0;
				for (let k = end - 1; k >= 0 && source[k] === "\\"; k--) backslashes++;
				if (backslashes % 2 === 0) break;
				end = source.indexOf(closer, end + closer.length);
			}
			// A dollar followed by whitespace, or a price followed by prose,
			// is currency rather than an opening inline delimiter.
			const body = source.slice(
				i + opener.length,
				end === -1 ? undefined : end,
			);
			const currency =
				opener === "$" &&
				(/^\s/.test(body) ||
					(/^\d/.test(body) &&
						(end === -1 ||
							/\s$/.test(body) ||
							/^\d/.test(source.slice(end + 1)))));
			if (!currency) {
				if (end === -1) {
					result += streaming ? "…" : source.slice(i);
					break;
				}
				const display =
					opener === "\\[" || (opener === "$$" && body.includes("\n"));
				result += display ? `\n$$\n${body.trim()}\n$$\n` : `$$${body.trim()}$$`;
				i = end + closer.length;
				continue;
			}
		}
		// Preserve escaped dollars and escaped backslashes.
		if (source[i] === "\\" && i + 1 < source.length) {
			result += source.slice(i, i + 2);
			i += 2;
		} else {
			result += source[i++];
		}
	}
	return result;
}
