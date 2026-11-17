import assert from "node:assert/strict";
import test from "node:test";
import { math } from "@streamdown/math";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { prepareMathMarkdown } from "../src/lib/math-markdown";

function render(source: string, streaming = false) {
	return renderToStaticMarkup(
		createElement(
			Streamdown,
			{
				plugins: { math },
				mode: streaming ? "streaming" : "static",
				isAnimating: streaming,
				parseIncompleteMarkdown: streaming,
			},
			prepareMathMarkdown(source, streaming),
		),
	);
}

test("renders all common inline and display delimiters", () => {
	for (const source of [
		"$x^2$",
		"$$x^2$$",
		String.raw`\(x^2\)`,
		String.raw`\[x^2\]`,
		"$$\nx^2\n$$",
	]) {
		assert.match(render(source), /class="katex"/);
		assert.doesNotMatch(render(source), /katex-error/);
	}
	assert.match(render(String.raw`\[\frac{1}{2}\]`), /katex-display/);
});

test("keeps multiline aligned equations together across blank lines", () => {
	const source = String.raw`Before.

\[
\begin{aligned}
x &= \frac{1}{2} \\

y &= \sqrt{3}
\end{aligned}
\]

After.`;
	const html = render(source);
	assert.match(html, /katex-display/);
	assert.doesNotMatch(html, /katex-error/);
	assert.match(html, /After/);
});

test("buffers every partial formula until its closing delimiter arrives", () => {
	for (const formula of [
		String.raw`\(\frac{1}{2}\)`,
		String.raw`\[\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}\]`,
		String.raw`$\sqrt{x^2}$`,
		"$$\n\\frac{1}{2}\n$$",
	]) {
		const openerLength =
			formula.startsWith("$") && !formula.startsWith("$$") ? 1 : 2;
		for (let i = openerLength; i < formula.length; i++) {
			const html = render(`Answer: ${formula.slice(0, i)}`, true);
			assert.doesNotMatch(
				html,
				/class="katex"|katex-error/,
				formula.slice(0, i),
			);
			assert.match(html, /Answer/);
		}
		assert.match(render(`Answer: ${formula}`, true), /class="katex"/);
	}
});

test("preserves code, escaped dollars, and ordinary prices", () => {
	for (const source of [
		String.raw`Use \`\(x\)\``.replaceAll("\\`", "`"),
		"```latex\n\\[x\\]\n```",
		"~~~\n$x$\n~~~",
		String.raw`Cost: \$5 and \$10.`,
		"Cost: $5 and $10.",
		"Pay $20",
		"`$x$`",
		"`` `$x$` ``",
	]) {
		assert.equal(prepareMathMarkdown(source, true), source);
		assert.doesNotMatch(render(source), /class="katex"/);
	}
});

test("leaves unfinished final responses readable and invalid math nonfatal", () => {
	assert.equal(
		prepareMathMarkdown(String.raw`Answer: \[x`),
		String.raw`Answer: \[x`,
	);
	assert.doesNotThrow(() => render(String.raw`\[\invalidcommand{x}\]`));
});
