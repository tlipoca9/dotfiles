import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import subagentWayfinder from "./index.ts";
import {
  LONG_RUNNING_THRESHOLD_MS,
  WAYFINDER_BINDING_NAMESPACE,
  WAYFINDER_EXTENSION_ACK_ID,
  applyIssueTrackerDocument,
  childPolicyPrompt,
  injectChildBindings,
  inspectWorkflowScript,
  parseChildBinding,
  repositoryIdentity,
  validateWayfinderGate,
} from "./policy.ts";

const exemptBindings = {
  [WAYFINDER_BINDING_NAMESPACE]: {
    mode: "exempt",
    reason: "one-shot-read-only",
  },
};

function githubBinding(tickets) {
  return {
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "github",
      map: {
        name: "Plan migration",
        ref: "https://github.com/acme/widgets/issues/100",
      },
      tickets,
    },
  };
}

function gongfengBinding(tickets) {
  return {
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "gongfeng",
      map: {
        name: "Plan migration",
        ref: "https://git.woa.com/acme/widgets/issues/100",
      },
      tickets,
    },
  };
}

function tapdMiniBinding(tickets) {
  return {
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "tapd_mini",
      map: {
        name: "Plan migration",
        ref: "https://tapd.woa.com/tapd_fe/t/index/70230031?mini_item_id=100",
      },
      tickets,
    },
  };
}

function gate(script, extensionBindings, repositories, extra = {}) {
  return validateWayfinderGate({
    inspection: inspectWorkflowScript(script),
    repositories,
    extensionBindings,
    ...extra,
  });
}

test("selects GitHub, Gongfeng, and local trackers from origin", () => {
  assert.deepEqual(
    repositoryIdentity("/repo", "git@github.com:acme/widgets.git"),
    {
      root: "/repo",
      tracker: "github",
      remote: "git@github.com:acme/widgets.git",
      projectPath: "acme/widgets",
    },
  );
  assert.equal(
    repositoryIdentity("/repo", "https://git.woa.com/cloud/team/widgets.git")
      .tracker,
    "gongfeng",
  );
  assert.equal(
    repositoryIdentity("/repo", "https://gitlab.example/acme/widgets.git")
      .tracker,
    "local",
  );
  assert.equal(repositoryIdentity("/repo").tracker, "local");
});

test("a repository tracker document explicitly selects TAPD mini", () => {
  const github = repositoryIdentity("/repo", "git@github.com:acme/widgets.git");
  assert.deepEqual(
    applyIssueTrackerDocument(
      github,
      '---\ntracker: tapd_mini\nworkspace_id: "70230031"\n---\n',
    ),
    {
      ...github,
      tracker: "tapd_mini",
      workspaceId: "70230031",
    },
  );

  assert.match(
    applyIssueTrackerDocument(github, "---\ntracker: tapd_mini\n---\n")
      .configurationError,
    /numeric workspace_id/,
  );
  assert.match(
    applyIssueTrackerDocument(github, "---\ntracker: github\n---\n")
      .configurationError,
    /cannot override/,
  );
});

test("extracts literal sequential and parallel workflow lanes", () => {
  const inspection = inspectWorkflowScript(`
    const first = await runs.run("implement", {
      agent: "worker",
      cwd: "packages/api",
      timeoutMs: 120000,
    });
    return runs.all([
      { key: "correctness", agent: "reviewer" },
      { key: "tests", agent: "reviewer", worktree: false },
    ]);
  `);
  assert.deepEqual(inspection.errors, []);
  assert.deepEqual(
    inspection.lanes.map(({ key, agent, cwd, timeoutMs, worktree }) => ({
      key,
      agent,
      cwd,
      timeoutMs,
      worktree,
    })),
    [
      {
        key: "implement",
        agent: "worker",
        cwd: "packages/api",
        timeoutMs: 120000,
        worktree: undefined,
      },
      {
        key: "correctness",
        agent: "reviewer",
        cwd: undefined,
        timeoutMs: undefined,
        worktree: undefined,
      },
      {
        key: "tests",
        agent: "reviewer",
        cwd: undefined,
        timeoutMs: undefined,
        worktree: false,
      },
    ],
  );
});

test("rejects dynamic workflow children and mixed unbound launches", () => {
  const dynamicArray = inspectWorkflowScript("return runs.all(children);");
  assert.match(dynamicArray.errors.join(" "), /inline array/);

  const mixed = inspectWorkflowScript(`
    if (false) await runs.run("review", { agent: "reviewer" });
    return runs["run"]("write", { agent: "worker" });
  `);
  assert.match(mixed.errors.join(" "), /bracket access/);

  const aliased = inspectWorkflowScript(`
    const launch = runs;
    return launch.run("write", { agent: "worker" });
  `);
  assert.match(aliased.errors.join(" "), /aliases/);

  const escaped = inspectWorkflowScript(String.raw`
    if (false) await runs.run("review", { agent: "reviewer" });
    return r\u0075ns.run("write", { agent: "worker" });
  `);
  assert.deepEqual(
    escaped.lanes.map((lane) => lane.key),
    ["review", "write"],
  );

  const evaluated = inspectWorkflowScript(`
    if (false) await runs.run("review", { agent: "reviewer" });
    return eval('runs.run("write", { agent: "worker" })');
  `);
  assert.match(evaluated.errors.join(" "), /must not use eval/);
});

test("rejects spreads, computed keys, shorthand, and duplicate governed fields", () => {
  const spread = inspectWorkflowScript(`
    return runs.run("review", { agent: "reviewer", ...options });
  `);
  assert.match(spread.errors.join(" "), /spread properties are forbidden/);

  const computed = inspectWorkflowScript(`
    return runs.run("review", { ["agent"]: "reviewer" });
  `);
  assert.match(computed.errors.join(" "), /Computed and non-literal/);

  const shorthand = inspectWorkflowScript(`
    return runs.run("review", { agent });
  `);
  assert.match(shorthand.errors.join(" "), /explicit key: value syntax/);

  const duplicated = inspectWorkflowScript(`
    return runs.run("review", { agent: "reviewer", agent: "worker" });
  `);
  assert.match(duplicated.errors.join(" "), /property 'agent' is duplicated/);
});

test("allows only a one-shot builtin read-only exemption", () => {
  const repo = repositoryIdentity("/repo", "git@github.com:acme/widgets.git");
  const reviewer =
    "return runs.run('review', { agent: 'reviewer', task: 'Review.' });";
  assert.equal(gate(reviewer, exemptBindings, [repo]).ok, true);

  const worker =
    "return runs.run('write', { agent: 'worker', task: 'Edit.' });";
  assert.match(
    gate(worker, exemptBindings, [repo]).reason,
    /one-shot-read-only/,
  );

  assert.match(
    gate(reviewer, exemptBindings, [repo], {
      topLevelTimeoutMs: LONG_RUNNING_THRESHOLD_MS,
    }).reason,
    /10 minutes/,
  );
});

test("validates tracked ticket order, repository, and URL ownership", () => {
  const script = `return runs.all([
    { key: "implementation", agent: "worker" },
    { key: "review", agent: "reviewer" },
  ]);`;
  const repo = repositoryIdentity("/repo", "git@github.com:acme/widgets.git");
  const binding = githubBinding([
    {
      key: "implementation",
      name: "Implement migration",
      ref: "https://github.com/acme/widgets/issues/101",
    },
    {
      key: "review",
      name: "Review migration",
      ref: "https://github.com/acme/widgets/issues/102",
    },
  ]);
  assert.equal(gate(script, binding, [repo, repo]).ok, true);

  const remoteAlias = structuredClone(binding);
  remoteAlias[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    `${remoteAlias[WAYFINDER_BINDING_NAMESPACE].map.ref}?alias=ticket`;
  assert.match(
    gate(script, remoteAlias, [repo, repo]).reason,
    /resolve to distinct artifacts/,
  );

  const encodedAlias = structuredClone(binding);
  encodedAlias[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    "https://github.com/acme/widgets/issues/%31%30%30";
  assert.match(
    gate(script, encodedAlias, [repo, repo]).reason,
    /resolve to distinct artifacts/,
  );

  const reversed = githubBinding(
    [...binding[WAYFINDER_BINDING_NAMESPACE].tickets].reverse(),
  );
  assert.match(
    gate(script, reversed, [repo, repo]).reason,
    /must use child key/,
  );

  const other = structuredClone(binding);
  other[WAYFINDER_BINDING_NAMESPACE].tickets[1].ref =
    "https://github.com/other/repo/issues/102";
  assert.match(gate(script, other, [repo, repo]).reason, /does not belong/);

  const malformedEncoding = structuredClone(binding);
  malformedEncoding[WAYFINDER_BINDING_NAMESPACE].tickets[1].ref =
    "https://github.com/acme/widgets/issues/%ZZ";
  assert.match(
    gate(script, malformedEncoding, [repo, repo]).reason,
    /invalid URL path encoding/,
  );

  const noncanonicalPath = structuredClone(binding);
  noncanonicalPath[WAYFINDER_BINDING_NAMESPACE].tickets[1].ref =
    "https://github.com/acme/widgets/arbitrary/issues/102/extra";
  assert.match(
    gate(script, noncanonicalPath, [repo, repo]).reason,
    /not an issue URL/,
  );
});

test("validates TAPD mini workspace ref shape and identity uniqueness", () => {
  const base = repositoryIdentity("/repo", "git@github.com:acme/widgets.git");
  const repo = applyIssueTrackerDocument(
    base,
    '---\ntracker: tapd_mini\nworkspace_id: "70230031"\n---\n',
  );
  const script = "return runs.run('implementation', { agent: 'worker' });";
  const binding = tapdMiniBinding([
    {
      key: "implementation",
      name: "Implement migration",
      ref: "https://tapd.woa.com/tapd_fe/t/index/70230031?mini_item_id=101",
    },
  ]);
  assert.equal(gate(script, binding, [repo]).ok, true);

  const wrongWorkspace = structuredClone(binding);
  wrongWorkspace[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    "https://tapd.woa.com/tapd_fe/t/index/999?mini_item_id=101";
  assert.match(
    gate(script, wrongWorkspace, [repo]).reason,
    /does not belong to TAPD mini workspace/,
  );

  const missingItem = structuredClone(binding);
  missingItem[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    "https://tapd.woa.com/tapd_fe/t/index/70230031";
  assert.match(
    gate(script, missingItem, [repo]).reason,
    /numeric mini_item_id/,
  );

  const invalidDoc = {
    ...repo,
    configurationError: "invalid tracker declaration",
  };
  assert.match(
    gate(script, binding, [invalidDoc]).reason,
    /invalid tracker declaration/,
  );
});

test("requires real repository-relative local map and ticket files", () => {
  const root = mkdtempSync(join(tmpdir(), "wayfinder-policy-"));
  mkdirSync(join(root, ".scratch", "migration", "issues"), { recursive: true });
  writeFileSync(join(root, ".scratch", "migration", "map.md"), "# Map\n");
  writeFileSync(
    join(root, ".scratch", "migration", "issues", "01-implement.md"),
    "# Ticket\n",
  );
  const repo = repositoryIdentity(root);
  const binding = {
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "local",
      map: { name: "Plan migration", ref: ".scratch/migration/map.md" },
      tickets: [
        {
          key: "implementation",
          name: "Implement migration",
          ref: ".scratch/migration/issues/01-implement.md",
        },
      ],
    },
  };
  const script = "return runs.run('implementation', { agent: 'worker' });";
  assert.equal(gate(script, binding, [repo]).ok, true);

  const localAlias = structuredClone(binding);
  localAlias[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    ".scratch/migration/./map.md";
  assert.match(
    gate(script, localAlias, [repo]).reason,
    /resolve to distinct artifacts/,
  );

  assert.match(
    gate(script, binding, [repo], { topLevelWorktree: true }).reason,
    /cannot provide one canonical shared pitfall log/,
  );
  const isolatedScript =
    "return runs.run('implementation', { agent: 'worker', worktree: true });";
  assert.match(
    gate(isolatedScript, binding, [repo]).reason,
    /cannot provide one canonical shared pitfall log/,
  );

  const outsideRoot = mkdtempSync(join(tmpdir(), "wayfinder-outside-"));
  const outsideFile = join(outsideRoot, "map.md");
  writeFileSync(outsideFile, "# Outside\n");
  const symlink = join(root, ".scratch", "migration", "outside.md");
  symlinkSync(outsideFile, symlink);
  const escaping = structuredClone(binding);
  escaping[WAYFINDER_BINDING_NAMESPACE].map.ref =
    ".scratch/migration/outside.md";
  assert.match(gate(script, escaping, [repo]).reason, /regular file|outside/);

  binding[WAYFINDER_BINDING_NAMESPACE].tickets[0].ref =
    ".scratch/migration/issues/missing.md";
  assert.match(gate(script, binding, [repo]).reason, /does not exist/);
});

test("injects one child-scoped binding per literal workflow object", () => {
  const script = `return runs.all([
    { key: "implementation", agent: "worker", },
    { key: "review", agent: "reviewer", },
  ]);`;
  const inspection = inspectWorkflowScript(script);
  const parsed = githubBinding([
    {
      key: "implementation",
      name: "Implement",
      ref: "https://github.com/acme/widgets/issues/101",
    },
    {
      key: "review",
      name: "Review",
      ref: "https://github.com/acme/widgets/issues/102",
    },
  ])[WAYFINDER_BINDING_NAMESPACE];
  const injected = injectChildBindings(script, inspection, parsed);
  assert.doesNotThrow(() => new Function("runs", injected));
  assert.equal((injected.match(/extensionBindings:/g) ?? []).length, 2);
  assert.match(injected, /"ticket":\{"key":"implementation"/);
  assert.match(injected, /"ticket":\{"key":"review"/);
});

test("extension reads a repository TAPD mini tracker declaration", async () => {
  const root = mkdtempSync(join(tmpdir(), "wayfinder-tapd-mini-"));
  mkdirSync(join(root, "docs", "agents"), { recursive: true });
  writeFileSync(
    join(root, "docs", "agents", "issue-tracker.md"),
    '---\ntracker: tapd_mini\nworkspace_id: "70230031"\n---\n',
  );
  const handlers = new Map();
  const commands = [];
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    events: { emit() {} },
    async exec(command, args) {
      commands.push(command);
      if (args.includes("--show-toplevel")) {
        return { code: 0, stdout: `${root}\n`, stderr: "", killed: false };
      }
      return {
        code: 0,
        stdout: "git@github.com:acme/widgets.git\n",
        stderr: "",
        killed: false,
      };
    },
  };
  subagentWayfinder(pi);
  const input = {
    workflowScript: "return runs.run('implementation', { agent: 'worker' });",
    extensionBindings: tapdMiniBinding([
      {
        key: "implementation",
        name: "Implement migration",
        ref: "https://tapd.woa.com/tapd_fe/t/index/70230031?mini_item_id=101",
      },
    ]),
  };
  const result = await handlers.get("tool_call")(
    { toolName: "subagent", input },
    { cwd: root, hasUI: false, ui: { notify() {} } },
  );
  assert.equal(result, undefined);
  assert.equal(commands.includes("gh"), false);
  assert.equal(handlers.has("tool_result"), false);
  assert.match(input.workflowScript, /"tracker":"tapd_mini"/);
});

test("extension hard-blocks invalid bindings without reading remote refs and injects approved child bindings", async () => {
  const handlers = new Map();
  const commands = [];
  let remote = "git@github.com:acme/widgets.git";
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    events: { emit() {} },
    async exec(command, args) {
      commands.push(command);
      if (args.includes("--show-toplevel")) {
        return { code: 0, stdout: "/repo\n", stderr: "", killed: false };
      }
      return {
        code: 0,
        stdout: `${remote}\n`,
        stderr: "",
        killed: false,
      };
    },
  };
  subagentWayfinder(pi);
  const toolCall = handlers.get("tool_call");
  const context = {
    cwd: "/repo",
    hasUI: false,
    ui: { notify() {} },
  };
  const missing = await toolCall(
    {
      toolName: "subagent",
      input: {
        workflowScript:
          "return runs.run('implementation', { agent: 'worker' });",
      },
    },
    context,
  );
  assert.equal(missing.block, true);
  assert.match(missing.reason, /Missing or invalid extensionBindings/);

  const approvedInput = {
    workflowScript: "return runs.run('review', { agent: 'reviewer', });",
    extensionBindings: exemptBindings,
  };
  const approved = await toolCall(
    { toolName: "subagent", input: approvedInput },
    context,
  );
  assert.equal(approved, undefined);
  assert.match(approvedInput.workflowScript, /extensionBindings:/);

  const trackedInput = {
    workflowScript: "return runs.run('implementation', { agent: 'worker', });",
    extensionBindings: githubBinding([
      {
        key: "implementation",
        name: "Implement migration",
        ref: "https://github.com/acme/widgets/issues/101",
      },
    ]),
  };
  const tracked = await toolCall(
    { toolName: "subagent", input: trackedInput },
    context,
  );
  assert.equal(tracked, undefined);
  assert.match(trackedInput.workflowScript, /extensionBindings:/);

  remote = "git@git.woa.com:acme/widgets.git";
  commands.length = 0;
  const gongfengInput = {
    workflowScript: "return runs.run('implementation', { agent: 'worker', });",
    extensionBindings: gongfengBinding([
      {
        key: "implementation",
        name: "Implement migration",
        ref: "https://git.woa.com/acme/widgets/issues/101",
      },
    ]),
  };
  const gongfeng = await toolCall(
    { toolName: "subagent", input: gongfengInput },
    context,
  );
  assert.equal(gongfeng, undefined);
  assert.equal(commands.includes("curl"), false);
  assert.match(gongfengInput.workflowScript, /extensionBindings:/);

  const parentPrompt = handlers.get("before_agent_start")({
    systemPrompt: "base",
    systemPromptOptions: { selectedTools: ["subagent"] },
  });
  assert.match(parentPrompt.systemPrompt, /Subagent Wayfinder gate/);
  assert.match(parentPrompt.systemPrompt, /does not contact the tracker/);
  assert.match(parentPrompt.systemPrompt, /grilling/);
  assert.match(parentPrompt.systemPrompt, /WAYFINDER PITFALL/);
  assert.match(
    parentPrompt.systemPrompt,
    /one retained map-supervisor workflow/,
  );
  assert.match(
    parentPrompt.systemPrompt,
    /resumes this workflow instead of launching a second one/,
  );
  assert.match(parentPrompt.systemPrompt, /only pitfall-log writer/);
  assert.match(
    parentPrompt.systemPrompt,
    /normalized Scope \+ Symptom \+ Cause/,
  );
  assert.match(parentPrompt.systemPrompt, /pitfall_report/);
  assert.match(parentPrompt.systemPrompt, /Pitfalls: None/);
});

test("child runtime acknowledges the extension and receives its scoped contract", () => {
  const previous = process.env.PI_SUBAGENT_EXTENSION_BINDINGS;
  const raw = JSON.stringify({
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "github",
      map: {
        name: "Plan migration",
        ref: "https://github.com/acme/widgets/issues/100",
      },
      ticket: {
        key: "review",
        name: "Review migration",
        ref: "https://github.com/acme/widgets/issues/102",
      },
    },
  });
  const handlers = new Map();
  const emitted = [];
  try {
    process.env.PI_SUBAGENT_EXTENSION_BINDINGS = raw;
    subagentWayfinder({
      on(name, handler) {
        handlers.set(name, handler);
      },
      events: {
        emit(name, payload) {
          emitted.push({ name, payload });
        },
      },
    });
    handlers.get("session_start")();
    assert.deepEqual(emitted, [
      {
        name: "subagent:acknowledge-extension",
        payload: { id: WAYFINDER_EXTENSION_ACK_ID },
      },
    ]);
    const injected = handlers.get("before_agent_start")({
      systemPrompt: "base",
      systemPromptOptions: { selectedTools: [] },
    });
    assert.match(injected.systemPrompt, /Review migration/);
    assert.match(injected.systemPrompt, /WAYFINDER PITFALL/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_EXTENSION_BINDINGS;
    } else {
      process.env.PI_SUBAGENT_EXTENSION_BINDINGS = previous;
    }
  }
});

test("child binding produces shared-pitfall and one-question contracts", () => {
  const raw = JSON.stringify({
    [WAYFINDER_BINDING_NAMESPACE]: {
      mode: "tracked",
      tracker: "github",
      map: {
        name: "Plan migration",
        ref: "https://github.com/acme/widgets/issues/100",
      },
      ticket: {
        key: "review",
        name: "Review migration",
        ref: "https://github.com/acme/widgets/issues/102",
      },
    },
  });
  const binding = parseChildBinding(raw);
  assert.ok(binding);
  const prompt = childPolicyPrompt(binding);
  assert.match(prompt, /Review migration/);
  assert.match(prompt, /WAYFINDER PITFALL/);
  assert.match(prompt, /before trying another fix/);
  assert.match(prompt, /Do not write the shared pitfall log directly/);
  assert.match(prompt, /pitfall_report/);
  assert.match(prompt, /normalized Scope \+ Symptom \+ Cause/);
  assert.match(prompt, /recorded, reused, or unresolved/);
  assert.match(prompt, /interview_request/);
  assert.match(prompt, /exactly one focused question/);
  assert.match(prompt, /Never bundle questions/);
});
