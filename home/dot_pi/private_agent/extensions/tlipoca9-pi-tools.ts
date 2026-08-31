import { Type } from "typebox";
import {
	createBashToolDefinition,
	defineTool,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const MAX_COMMANDS = 16;

export interface BashAsyncCommand {
	label?: string;
	command: string;
}

export interface BashAsyncOutcome {
	label: string;
	command: string;
	status: "succeeded" | "failed";
	output: string;
}

interface BashAsyncProgress {
	label: string;
	command: string;
	status: "running" | BashAsyncOutcome["status"];
	output?: string;
}

interface BashAsyncDetails {
	completed: number;
	total: number;
	outcomes: BashAsyncProgress[];
}

type BashAsyncRunner = (command: BashAsyncCommand, index: number) => Promise<string>;

function commandLabel(command: BashAsyncCommand, index: number): string {
	return command.label?.trim() || `command ${index + 1}`;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function settleBashCommands(
	commands: readonly BashAsyncCommand[],
	run: BashAsyncRunner,
	onSettled?: (outcome: BashAsyncOutcome, index: number) => void,
): Promise<BashAsyncOutcome[]> {
	return Promise.all(commands.map(async (command, index) => {
		let outcome: BashAsyncOutcome;
		try {
			outcome = {
				label: commandLabel(command, index),
				command: command.command,
				status: "succeeded",
				output: await run(command, index),
			};
		} catch (error) {
			outcome = {
				label: commandLabel(command, index),
				command: command.command,
				status: "failed",
				output: errorText(error),
			};
		}
		onSettled?.(outcome, index);
		return outcome;
	}));
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.map((block) => block.type === "text" ? block.text ?? "" : "[image]")
		.filter(Boolean)
		.join("\n");
}

function formatProgress(progress: readonly BashAsyncProgress[]): string {
	const completed = progress.filter((item) => item.status !== "running").length;
	return [
		`Parallel bash commands: ${completed}/${progress.length} completed`,
		...progress.map((item, index) =>
			`[${index + 1}/${progress.length}] ${item.label}: ${item.status}`
		),
	].join("\n");
}

function formatOutcomes(outcomes: readonly BashAsyncOutcome[]): string {
	return outcomes.map((outcome, index) => [
		`[${index + 1}/${outcomes.length}] ${outcome.label}: ${outcome.status}`,
		`$ ${outcome.command}`,
		outcome.output || "(no output)",
	].join("\n")).join("\n\n");
}

export default function tlipoca9PiTools(pi: ExtensionAPI): void {
	pi.registerTool(defineTool({
		name: "bash_async",
		label: "bash async",
		description:
			"Run 2-16 independent bash commands concurrently, wait for every command to settle, and return their results together. " +
			"Use this for parallel waits, builds, tests, queries, or operation-plus-wait commands such as several `agr deployment delete ... --wait` calls.",
		promptSnippet: "Run multiple independent bash commands concurrently",
		promptGuidelines: [
			"Before bash_async, state what the batch will do, why it is needed, and which skills are in use.",
			"Use bash_async only when every command is independent and safe to run concurrently; keep dependent or state-sensitive operations sequential.",
			"Use bash for a single command. Do not turn unrelated work into one heterogeneous bash_async batch.",
			"Inspect every outcome before starting a subsequent mutation.",
		],
		executionMode: "sequential",
		parameters: Type.Object({
			commands: Type.Array(Type.Object({
				label: Type.Optional(Type.String({
					minLength: 1,
					maxLength: 120,
					description: "Short identifier used to distinguish this command in progress and results.",
				})),
				command: Type.String({
					minLength: 1,
					description: "One self-contained bash command that may safely run in parallel with the other commands.",
				}),
			}), {
				minItems: 2,
				maxItems: MAX_COMMANDS,
			}),
			timeout: Type.Optional(Type.Number({
				minimum: 1,
				description: "Optional timeout in seconds applied independently to every command.",
			})),
		}),
		async execute(toolCallId, params, signal, onUpdate, context) {
			const bash = createBashToolDefinition(context.cwd);
			const progress: BashAsyncProgress[] = params.commands.map((command, index) => ({
				label: commandLabel(command, index),
				command: command.command,
				status: "running",
			}));
			const emitProgress = () => onUpdate?.({
				content: [{ type: "text", text: formatProgress(progress) }],
				details: {
					completed: progress.filter((item) => item.status !== "running").length,
					total: progress.length,
					outcomes: progress.map((item) => ({ ...item })),
				},
			});
			emitProgress();

			const outcomes = await settleBashCommands(
				params.commands,
				async (command, index) => resultText(await bash.execute(
					`${toolCallId}:${index + 1}`,
					{ command: command.command, timeout: params.timeout },
					signal,
					undefined,
					context,
				)),
				(outcome, index) => {
					progress[index] = outcome;
					emitProgress();
				},
			);
			const text = formatOutcomes(outcomes);
			const failures = outcomes.filter((outcome) => outcome.status === "failed");
			if (failures.length > 0) {
				throw new Error(`${text}\n\n${failures.length}/${outcomes.length} parallel bash commands failed`);
			}

			const details: BashAsyncDetails = {
				completed: outcomes.length,
				total: outcomes.length,
				outcomes,
			};
			return {
				content: [{ type: "text", text }],
				details,
			};
		},
	}));
}
