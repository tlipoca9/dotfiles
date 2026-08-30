import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const theme = JSON.parse(
	readFileSync(
		new URL("../home/dot_pi/private_agent/themes/atom-one-dark.json", import.meta.url),
		"utf8",
	),
) as { name: string; colors: Record<string, string> };

test("renders the managed Pi appearance and notification settings", () => {
	const settingsTemplate = new URL(
		"../home/dot_pi/private_agent/modify_settings.json.tmpl",
		import.meta.url,
	);
	const result = spawnSync("python3", [settingsTemplate.pathname], {
		encoding: "utf8",
		input: "{}\n",
	});

	assert.equal(result.status, 0, result.stderr);
	const settings = JSON.parse(result.stdout) as {
		theme?: string;
		"observational-memory"?: {
			passive?: boolean;
			showWorkerNotifications?: boolean;
		};
	};
	assert.equal(settings.theme, theme.name);
	assert.equal(theme.colors.thinkingHigh, "focus");
	assert.equal(
		settings["observational-memory"]?.showWorkerNotifications,
		false,
	);
	assert.equal(settings["observational-memory"]?.passive, undefined);
});
