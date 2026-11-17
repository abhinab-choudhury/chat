import {
	CodeIcon,
	CompassIcon,
	GraduationCapIcon,
	type LucideIcon,
	WandIcon,
} from "lucide-react";
import * as React from "react";

import { Separator } from "#/components/ui/separator";

export interface SuggestedQuestion {
	id: string;
	label: string;
}

export interface QuestionCategory {
	id: string;
	label: string;
	icon: LucideIcon;
	questions: SuggestedQuestion[];
}

interface SuggestedQuestionsProps {
	categories: QuestionCategory[];
	defaultCategoryId?: string;
	onSelect: (question: SuggestedQuestion) => void;
}

export function SuggestedQuestions({
	categories,
	defaultCategoryId,
	onSelect,
}: SuggestedQuestionsProps) {
	const [activeId, setActiveId] = React.useState(
		defaultCategoryId ?? categories[0]?.id ?? "",
	);

	const activeCategory = categories.find(
		(category) => category.id === activeId,
	);

	return (
		<div className="w-full">
			<div className="mb-3 flex flex-wrap gap-2">
				{categories.map((category) => {
					const Icon = category.icon;
					const isActive = category.id === activeId;
					return (
						<button
							key={category.id}
							type="button"
							onClick={() => setActiveId(category.id)}
							className={
								isActive
									? "inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm backdrop-blur-md transition hover:bg-primary/90"
									: "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/70 px-4 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm transition hover:bg-accent hover:text-accent-foreground"
							}
						>
							<Icon className="size-4" />
							{category.label}
						</button>
					);
				})}
			</div>
			<div className="flex flex-col">
				{(activeCategory?.questions ?? []).map((question, index, list) => (
					<div key={question.id}>
						<button
							type="button"
							onClick={() => onSelect(question)}
							className="w-full px-2 py-4 text-left text-sm text-foreground transition	 hover:bg-accent hover:text-accent-foreground"
						>
							{question.label}
						</button>
						{index < list.length ? <Separator /> : null}
					</div>
				))}
			</div>
		</div>
	);
}

export const DEFAULT_QUESTION_CATEGORIES: QuestionCategory[] = [
	{
		id: "create",
		label: "Create",
		icon: WandIcon,
		questions: [
			{
				id: "c1",
				label: "Create a 7-day launch email sequence for a SaaS app",
			},
			{
				id: "c2",
				label: "Create a 60-second YouTube Short script on noise cancellation",
			},
			{
				id: "c3",
				label: "Create a landing page hero section for an AI note-taker",
			},
		],
	},
	{
		id: "explore",
		label: "Explore",
		icon: CompassIcon,
		questions: [
			{ id: "e1", label: "Compare Redis vs. PostgreSQL for API rate-limiting" },
			{
				id: "e2",
				label: "Break down why Notion's templates drove viral growth",
			},
			{ id: "e3", label: "Plan a 3-day local food and walking trip in Tokyo" },
		],
	},
	{
		id: "code",
		label: "Code",
		icon: CodeIcon,
		questions: [
			{ id: "cd1", label: "Create a React hook for debounced search inputs" },
			{ id: "cd2", label: "Write a Python script to find duplicate CSV rows" },
			{
				id: "cd3",
				label: "Explain how JS event loop handles Promises vs. setTimeout",
			},
		],
	},
	{
		id: "learn",
		label: "Learn",
		icon: GraduationCapIcon,
		questions: [
			{
				id: "l1",
				label: "Explain self-attention from Google's Transformer paper",
			},
			{ id: "l2", label: "Quiz me on SQL indexing and query optimization" },
			{ id: "l3", label: "Build a 4-week roadmap to learn system design" },
		],
	},
];
