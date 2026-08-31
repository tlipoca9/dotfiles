import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import tlipoca9PiTools, {
	settleBashCommands,
} from "../home/dot_pi/private_agent/extensions/tlipoca9-pi-tools.ts";

test("tlipoca9-pi-tools registers only bash_async", () => {
	const tools: Array<{ name: string }> = [];
	tlipoca9PiTools({
		registerTool(tool: { name: string }) {
			tools.push(tool);
		},
	} as never);

	assert.deepEqual(tools.map((tool) => tool.name), ["bash_async"]);
});

test("settles independent commands concurrently and preserves input order", async () => {
	const started: string[] = [];
	const releases = new Map<string, () => void>();
	const commands = [
		{ label: "first", command: "wait first" },
		{ label: "second", command: "wait second" },
	];

	const pending = settleBashCommands(commands, async ({ command }) => {
		started.push(command);
		await new Promise<void>((resolve) => releases.set(command, resolve));
		return `${command} done`;
	});

	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(started, ["wait first", "wait second"]);

	releases.get("wait second")?.();
	releases.get("wait first")?.();
	const outcomes = await pending;

	assert.deepEqual(outcomes, [
		{
			label: "first",
			command: "wait first",
			status: "succeeded",
			output: "wait first done",
		},
		{
			label: "second",
			command: "wait second",
			status: "succeeded",
			output: "wait second done",
		},
	]);
});

test("settles every command and reports individual failures", async () => {
	let successfulWaitFinished = false;
	const outcomes = await settleBashCommands([
		{ label: "fails", command: "wait fails" },
		{ label: "succeeds", command: "wait succeeds" },
	], async ({ command }) => {
		if (command === "wait fails") throw new Error("delete failed");
		await new Promise((resolve) => setImmediate(resolve));
		successfulWaitFinished = true;
		return "deleted";
	});

	assert.equal(successfulWaitFinished, true);
	assert.deepEqual(outcomes, [
		{
			label: "fails",
			command: "wait fails",
			status: "failed",
			output: "delete failed",
		},
		{
			label: "succeeds",
			command: "wait succeeds",
			status: "succeeded",
			output: "deleted",
		},
	]);
});

test("bash_async runs real Pi bash commands concurrently", async () => {
	let tool: any;
	tlipoca9PiTools({
		registerTool(registered: unknown) {
			tool = registered;
		},
	} as never);
	assert.ok(tool);

	const cwd = await mkdtemp(join(tmpdir(), "tlipoca9-pi-tools-"));
	try {
		const updates: any[] = [];
		const result = await tool.execute(
			"parallel-test",
			{
				commands: [
					{
						label: "first",
						command: "touch first.started; while [ ! -e second.started ]; do sleep 0.01; done; echo first-ready",
					},
					{
						label: "second",
						command: "touch second.started; while [ ! -e first.started ]; do sleep 0.01; done; echo second-ready",
					},
				],
				timeout: 2,
			},
			AbortSignal.timeout(5_000),
			(update: unknown) => updates.push(update),
			{
				cwd,
				model: undefined,
				sessionManager: {
					getSessionFile: () => undefined,
					getSessionId: () => "parallel-test-session",
				},
				thinkingLevel: undefined,
			} as never,
		);

		assert.match(result.content[0]?.text ?? "", /first-ready/);
		assert.match(result.content[0]?.text ?? "", /second-ready/);
		assert.deepEqual(result.details.outcomes.map((outcome: any) => outcome.status), [
			"succeeded",
			"succeeded",
		]);
		assert.equal(updates.at(-1)?.details.completed, 2);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
