import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import taskWayfinder from "./index.ts";
import {
  applyIssueTrackerDocument,
  childPolicyPrompt,
  inspectTaskInput,
  parseWayfinderBinding,
  prepareNativeTaskInput,
  repositoryIdentity,
  validateWayfinderGate,
  WAYFINDER_REVIEWER_AGENT,
} from "./gate-policy.ts";

const githubRepository = repositoryIdentity(
  "/repo",
  "git@github.com:acme/widgets.git",
);

function trackedBinding(keys = ["implementation"]) {
  return {
    mode: "tracked",
    tracker: "github",
    map: {
      name: "Plan migration",
      ref: "https://github.com/acme/widgets/issues/100",
    },
    tickets: keys.map((key, index) => ({
      key,
      name: `Ticket ${key}`,
      ref: `https://github.com/acme/widgets/issues/${101 + index}`,
    })),
  };
}

function gate(input, wayfinder, repository = githubRepository) {
  return validateWayfinderGate({
    inspection: inspectTaskInput(input),
    repository,
    wayfinder,
  });
}

test("selects GitHub, Gongfeng, local, and TAPD mini trackers", () => {
  assert.equal(githubRepository.tracker, "github");
  assert.equal(
    repositoryIdentity("/repo", "https://git.woa.com/cloud/team/widgets.git")
      .tracker,
    "gongfeng",
  );
  assert.equal(repositoryIdentity("/repo").tracker, "local");

  const tapd = applyIssueTrackerDocument(
    githubRepository,
    '---\ntracker: tapd_mini\nworkspace_id: "70230031"\n---\n',
  );
  assert.equal(tapd.tracker, "tapd_mini");
  assert.equal(tapd.workspaceId, "70230031");
  assert.match(
    applyIssueTrackerDocument(
      githubRepository,
      "---\ntracker: tapd_mini\n---\n",
    ).configurationError,
    /numeric workspace_id/,
  );
});

test("requires explicit unique task names in batch and flat shapes", () => {
  const batch = inspectTaskInput({
    context: "shared",
    tasks: [
      { name: "implementation", agent: "task", task: "Implement." },
      { name: "review", agent: "reviewer", task: "Review." },
    ],
  });
  assert.deepEqual(batch.errors, []);
  assert.deepEqual(
    batch.lanes.map(({ key, agent }) => ({ key, agent })),
    [
      { key: "implementation", agent: "task" },
      { key: "review", agent: "reviewer" },
    ],
  );

  assert.match(
    inspectTaskInput({
      context: "",
      tasks: [{ task: "Missing name" }],
    }).errors.join(" "),
    /explicit non-empty name/,
  );
  assert.match(
    inspectTaskInput({
      context: "",
      tasks: [
        { name: "Review", task: "One" },
        { name: "review", task: "Two" },
      ],
    }).errors.join(" "),
    /duplicated case-insensitively/,
  );
});

test("allows only the dedicated non-isolated reviewer exemption", () => {
  const exempt = { mode: "exempt", reason: "one-shot-read-only" };
  assert.equal(
    gate(
      {
        name: "review",
        agent: WAYFINDER_REVIEWER_AGENT,
        task: "Review.",
      },
      exempt,
    ).ok,
    true,
  );
  assert.match(
    gate({ name: "review", agent: "reviewer", task: "Review." }, exempt).reason,
    /wayfinder-reviewer/,
  );
  assert.match(
    gate(
      {
        name: "review",
        agent: WAYFINDER_REVIEWER_AGENT,
        task: "Review.",
        isolated: true,
      },
      exempt,
    ).reason,
    /non-isolated/,
  );
});

test("validates tracked ticket count, order, ownership, and identity", () => {
  const input = {
    context: "shared",
    tasks: [
      { name: "implementation", agent: "task", task: "Implement." },
      { name: "review", agent: "reviewer", task: "Review." },
    ],
  };
  assert.equal(
    gate(input, trackedBinding(["implementation", "review"])).ok,
    true,
  );
  assert.match(
    gate(input, trackedBinding(["review", "implementation"])).reason,
    /must use task name/,
  );

  const otherRepository = trackedBinding(["implementation", "review"]);
  otherRepository.tickets[1].ref = "https://github.com/other/repo/issues/102";
  assert.match(gate(input, otherRepository).reason, /does not belong/);

  const alias = trackedBinding(["implementation", "review"]);
  alias.tickets[0].ref = `${alias.map.ref}?alias=ticket`;
  assert.match(gate(input, alias).reason, /distinct artifacts/);
});

test("validates TAPD mini refs against the declared workspace", () => {
  const repository = applyIssueTrackerDocument(
    githubRepository,
    '---\ntracker: tapd_mini\nworkspace_id: "70230031"\n---\n',
  );
  const binding = {
    mode: "tracked",
    tracker: "tapd_mini",
    map: {
      name: "Map",
      ref: "https://tapd.woa.com/tapd_fe/t/index/70230031?mini_item_id=100",
    },
    tickets: [
      {
        key: "implementation",
        name: "Implement",
        ref: "https://tapd.woa.com/tapd_fe/t/index/70230031?mini_item_id=101",
      },
    ],
  };
  assert.equal(
    gate({ name: "implementation", task: "Implement." }, binding, repository)
      .ok,
    true,
  );
  binding.tickets[0].ref =
    "https://tapd.woa.com/tapd_fe/t/index/999?mini_item_id=101";
  assert.match(
    gate({ name: "implementation", task: "Implement." }, binding, repository)
      .reason,
    /does not belong to TAPD mini workspace/,
  );
});

test("requires canonical repository-local files and rejects local isolation", () => {
  const root = mkdtempSync(join(tmpdir(), "omp-wayfinder-policy-"));
  mkdirSync(join(root, ".scratch", "migration", "issues"), {
    recursive: true,
  });
  writeFileSync(join(root, ".scratch", "migration", "map.md"), "# Map\n");
  writeFileSync(
    join(root, ".scratch", "migration", "issues", "01-implement.md"),
    "# Ticket\n",
  );
  const repository = repositoryIdentity(root);
  const binding = {
    mode: "tracked",
    tracker: "local",
    map: { name: "Map", ref: ".scratch/migration/map.md" },
    tickets: [
      {
        key: "implementation",
        name: "Implement",
        ref: ".scratch/migration/issues/01-implement.md",
      },
    ],
  };
  assert.equal(
    gate({ name: "implementation", task: "Implement." }, binding, repository)
      .ok,
    true,
  );
  assert.match(
    gate(
      { name: "implementation", task: "Implement.", isolated: true },
      binding,
      repository,
    ).reason,
    /cannot provide one canonical shared pitfall log/,
  );

  const outside = mkdtempSync(join(tmpdir(), "omp-wayfinder-outside-"));
  const outsideFile = join(outside, "map.md");
  writeFileSync(outsideFile, "# Outside\n");
  symlinkSync(outsideFile, join(root, ".scratch", "migration", "outside.md"));
  binding.map.ref = ".scratch/migration/outside.md";
  assert.match(
    gate({ name: "implementation", task: "Implement." }, binding, repository)
      .reason,
    /outside/,
  );
});

test("injects one scoped child contract and removes wayfinder before delegation", () => {
  const input = {
    context: "shared",
    tasks: [
      { name: "implementation", agent: "task", task: "Implement." },
      { name: "review", agent: "reviewer", task: "Review." },
    ],
    wayfinder: trackedBinding(["implementation", "review"]),
  };
  const inspection = inspectTaskInput(input);
  const native = prepareNativeTaskInput(
    input,
    inspection,
    parseWayfinderBinding(input.wayfinder),
  );
  assert.equal("wayfinder" in native, false);
  assert.match(native.tasks[0].task, /Ticket implementation/);
  assert.doesNotMatch(native.tasks[0].task, /Ticket review/);
  assert.match(native.tasks[1].task, /Ticket review/);
  assert.match(native.tasks[0].task, /\[wayfinder:pitfall_report\]/);
  assert.match(native.tasks[0].task, /another independent ticket/);
  assert.match(
    native.tasks[0].task,
    /Normal ticket iteration is not a pitfall/,
  );
  assert.match(
    native.tasks[0].task,
    /transient failures caused by code currently being changed/,
  );
});

test("read-only child contract forbids mutation", () => {
  assert.match(
    childPolicyPrompt({ mode: "exempt", reason: "one-shot-read-only" }),
    /Do not mutate/,
  );
});

test("TAPD child contract reads the Chinese reusable-obstacle section", () => {
  const prompt = childPolicyPrompt({
    mode: "tracked",
    tracker: "tapd_mini",
    map: { name: "迁移地图", ref: "https://tapd.example/map" },
    ticket: {
      key: "review",
      name: "评审迁移方案",
      ref: "https://tapd.example/ticket",
    },
  });
  assert.match(prompt, /## 可复用障碍/);
  assert.doesNotMatch(prompt, /## Pitfall log/);
});

function typeboxMock() {
  const wrap =
    (kind) =>
    (...args) => ({ kind, args });
  return {
    Array: wrap("Array"),
    Boolean: wrap("Boolean"),
    Literal: wrap("Literal"),
    Object: wrap("Object"),
    Optional: wrap("Optional"),
    String: wrap("String"),
    Union: wrap("Union"),
    Unknown: wrap("Unknown"),
  };
}

function extensionHarness() {
  const handlers = new Map();
  let tool;
  const commands = [];
  const pi = {
    typebox: { Type: typeboxMock() },
    setLabel() {},
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool(definition) {
      tool = definition;
    },
    async exec(command, args) {
      commands.push([command, args]);
      if (args.includes("--show-toplevel")) {
        return { code: 0, stdout: "/repo\n", stderr: "", killed: false };
      }
      return {
        code: 0,
        stdout: "git@github.com:acme/widgets.git\n",
        stderr: "",
        killed: false,
      };
    },
  };
  taskWayfinder(pi);
  return {
    handlers,
    get tool() {
      return tool;
    },
    commands,
  };
}

test("extension appends the parent gate to OMP's prompt array", () => {
  const harness = extensionHarness();
  const result = harness.handlers.get("before_agent_start")({
    systemPrompt: ["base prompt"],
  });
  assert.equal(result.systemPrompt[0], "base prompt");
  assert.match(result.systemPrompt[1], /Task Wayfinder gate/);
});

test("extension delegates approved work to native task and fails closed", async () => {
  const harness = extensionHarness();
  let delegated;
  const context = {
    cwd: "/repo",
    async invokeTool(params) {
      delegated = params;
      return { content: [{ type: "text", text: "spawned" }], details: {} };
    },
  };
  const approved = {
    context: "shared",
    tasks: [{ name: "implementation", agent: "task", task: "Implement." }],
    wayfinder: trackedBinding(),
  };
  const result = await harness.tool.execute(
    "call-1",
    approved,
    undefined,
    undefined,
    context,
  );
  assert.equal(result.content[0].text, "spawned");
  assert.equal("wayfinder" in delegated, false);
  assert.match(delegated.tasks[0].task, /Wayfinder child contract/);
  assert.deepEqual(
    harness.commands.map(([command]) => command),
    ["git", "git"],
  );

  delegated = undefined;
  const blocked = await harness.tool.execute(
    "call-2",
    { ...approved, wayfinder: undefined },
    undefined,
    undefined,
    context,
  );
  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0].text, /Task blocked/);
  assert.equal(delegated, undefined);
});

test("extension fails closed when native task delegation is unavailable", async () => {
  const harness = extensionHarness();
  const result = await harness.tool.execute(
    "call-1",
    {
      context: "shared",
      tasks: [{ name: "implementation", task: "Implement." }],
      wayfinder: trackedBinding(),
    },
    undefined,
    undefined,
    { cwd: "/repo" },
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /native task delegation seam/);
});
