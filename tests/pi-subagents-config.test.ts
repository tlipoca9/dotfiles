import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("only overrides the pi-subagents inline tool display", () => {
	const config = JSON.parse(
		readFileSync(
			new URL(
				"../home/dot_pi/private_agent/extensions/subagent/config.json",
				import.meta.url,
			),
			"utf8",
		),
	);

	assert.deepEqual(config, { inlineToolDisplay: "summary" });
});
