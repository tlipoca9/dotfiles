/// <reference path="./node-shim.d.ts" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
  applyIssueTrackerDocument,
  inspectTaskInput,
  prepareNativeTaskInput,
  repositoryIdentity,
  validateWayfinderGate,
  WAYFINDER_REVIEWER_AGENT,
  type RepositoryIdentity,
} from "./gate-policy.ts";

const PARENT_POLICY_PROMPT = `## Task Wayfinder gate

Before calling task, classify the work. A single one-shot '${WAYFINDER_REVIEWER_AGENT}' read-only child may use the explicit one-shot-read-only exemption. Every other task call must first create or attach one Wayfinder map and one ticket per task item.

Every task child must have an explicit stable name. Pass a top-level wayfinder field on the task call. Tracked bindings use { mode: "tracked", tracker, map: { name, ref }, tickets: [{ key, name, ref }] }, where ticket order and key exactly match task item names. The only exemption is { mode: "exempt", reason: "one-shot-read-only" } and it is valid only for one non-isolated '${WAYFINDER_REVIEWER_AGENT}' task.

Select the tracker from the actual repository. docs/agents/issue-tracker.md frontmatter declaring tracker: tapd_mini plus workspace_id overrides origin detection; otherwise github.com uses GitHub, git.woa.com uses Gongfeng, and every other or missing remote uses local markdown. Local tracking cannot be combined with isolated tasks. The gate validates binding structure, tracker ownership, reference shape, distinct artifacts, and task-name order. Remote checks are deliberately static and do not prove that an issue exists or is readable.

An execution-bearing map has one retained map supervisor for its active execution. Read the latest tracker-specific pitfall log before launch. GitHub and Gongfeng use comments headed WAYFINDER PITFALL; TAPD mini uses the map description's ## 可复用障碍. A pitfall is only a non-obvious operational obstacle from build, deploy, tooling, permissions, environment, or shared infrastructure that can recur across independent tickets and be reused without knowing one ticket's decision history. Normal ticket iteration—hypotheses, rejected options, clarification, feedback, prototype adjustment, changing understanding, routine trial and error, typos, and transient failures from code under change—stays out of the pitfall log. Children report only qualifying obstacles through hub with [wayfinder:pitfall_report] and ask one unresolved material question through hub with [wayfinder:interview_request]. The parent rejects candidates outside that narrow definition. For a qualifying report, it is the only pitfall-log writer, deduplicates by normalized Scope + Symptom + Cause immediately before append, acknowledges every report, and discloses all new, reused, or unresolved pitfalls at handoff, or states Pitfalls: None.`;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

async function configuredRepositoryIdentity(
  identity: RepositoryIdentity,
): Promise<RepositoryIdentity> {
  const path = resolve(identity.root, "docs/agents/issue-tracker.md");
  try {
    return applyIssueTrackerDocument(identity, readFileSync(path, "utf8"));
  } catch (error) {
    if (record(error)?.code === "ENOENT") return identity;
    return {
      ...identity,
      configurationError: `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function inspectRepository(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<RepositoryIdentity> {
  const absoluteCwd = resolve(cwd);
  const rootResult = await pi.exec(
    "git",
    ["-C", absoluteCwd, "rev-parse", "--show-toplevel"],
    { signal, timeout: 3000 },
  );
  if (rootResult.code !== 0 || !rootResult.stdout.trim()) {
    return configuredRepositoryIdentity(repositoryIdentity(absoluteCwd));
  }
  const root = resolve(rootResult.stdout.trim());
  const remoteResult = await pi.exec(
    "git",
    ["-C", root, "remote", "get-url", "origin"],
    { signal, timeout: 3000 },
  );
  return configuredRepositoryIdentity(
    repositoryIdentity(
      root,
      remoteResult.code === 0 ? remoteResult.stdout.trim() : undefined,
    ),
  );
}

function taskParameters(pi: ExtensionAPI) {
  const Type = pi.typebox.Type;
  const artifact = Type.Object(
    {
      name: Type.String({ minLength: 1 }),
      ref: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  );
  const ticket = Type.Object(
    {
      key: Type.String({ minLength: 1 }),
      name: Type.String({ minLength: 1 }),
      ref: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  );
  const wayfinder = Type.Union([
    Type.Object(
      {
        mode: Type.Literal("exempt"),
        reason: Type.Literal("one-shot-read-only"),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        mode: Type.Literal("tracked"),
        tracker: Type.Union([
          Type.Literal("local"),
          Type.Literal("github"),
          Type.Literal("gongfeng"),
          Type.Literal("tapd_mini"),
        ]),
        map: artifact,
        tickets: Type.Array(ticket),
      },
      { additionalProperties: false },
    ),
  ]);
  const item = Type.Object(
    {
      name: Type.String({ minLength: 1 }),
      agent: Type.Optional(Type.String({ minLength: 1 })),
      task: Type.String({ minLength: 1 }),
      effort: Type.Optional(
        Type.Union([
          Type.Literal("lo"),
          Type.Literal("med"),
          Type.Literal("hi"),
        ]),
      ),
      outputSchema: Type.Optional(Type.Unknown()),
      schemaMode: Type.Optional(
        Type.Union([Type.Literal("permissive"), Type.Literal("strict")]),
      ),
      isolated: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: true },
  );
  return Type.Union([
    Type.Object(
      {
        context: Type.String(),
        tasks: Type.Array(item, { minItems: 1 }),
        wayfinder,
      },
      { additionalProperties: true },
    ),
    Type.Object(
      {
        name: Type.String({ minLength: 1 }),
        agent: Type.Optional(Type.String({ minLength: 1 })),
        task: Type.String({ minLength: 1 }),
        effort: Type.Optional(
          Type.Union([
            Type.Literal("lo"),
            Type.Literal("med"),
            Type.Literal("hi"),
          ]),
        ),
        outputSchema: Type.Optional(Type.Unknown()),
        schemaMode: Type.Optional(
          Type.Union([Type.Literal("permissive"), Type.Literal("strict")]),
        ),
        isolated: Type.Optional(Type.Boolean()),
        wayfinder,
      },
      { additionalProperties: true },
    ),
  ]);
}

export default function taskWayfinder(pi: ExtensionAPI) {
  pi.setLabel("Wayfinder-gated task");

  pi.on("before_agent_start", (event) => ({
    systemPrompt: [...event.systemPrompt, PARENT_POLICY_PROMPT],
  }));

  pi.registerTool({
    name: "task",
    label: "Task (Wayfinder-gated)",
    description:
      "Spawn one or more OMP task agents after validating a Wayfinder map and one ticket per explicit task name. Delegates approved work to OMP's native task tool.",
    parameters: taskParameters(pi),
    approval: "exec",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = record(params);
      if (!input) {
        return {
          content: [{ type: "text", text: "Task input must be an object." }],
          details: {},
          isError: true,
        };
      }
      const inspection = inspectTaskInput(input);
      const repository = await inspectRepository(pi, ctx.cwd, signal);
      const result = validateWayfinderGate({
        inspection,
        repository,
        wayfinder: input.wayfinder,
      });
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Task blocked: ${result.reason}` }],
          details: { blocked: true, reason: result.reason },
          isError: true,
        };
      }
      if (!ctx.invokeTool) {
        return {
          content: [
            {
              type: "text",
              text: "Task blocked: OMP did not expose the native task delegation seam.",
            },
          ],
          details: { blocked: true, reason: "native task unavailable" },
          isError: true,
        };
      }
      const nativeInput = prepareNativeTaskInput(
        input,
        inspection,
        result.binding,
      );
      return ctx.invokeTool(nativeInput, { signal, onUpdate });
    },
  });
}
