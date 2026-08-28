import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  WAYFINDER_BINDING_NAMESPACE,
  WAYFINDER_EXTENSION_ACK_ID,
  applyIssueTrackerDocument,
  childPolicyPrompt,
  injectChildBindings,
  inspectWorkflowScript,
  parseChildBinding,
  repositoryIdentity,
  validateWayfinderGate,
  type RepositoryIdentity,
} from "./policy.ts";

const PARENT_POLICY_PROMPT = `## Subagent Wayfinder gate

Before an initial subagent execution, classify the workflow. A single one-shot reviewer/oracle read-only child may use the explicit one-shot-read-only exemption. Any writer, scout/researcher artifact producer, multi-child, multi-stage, worktree, custom/unknown agent, or explicitly long-running workflow must first create or attach one Wayfinder map and one ticket per literal child key.

Select the tracker from the actual workflow repository. A docs/agents/issue-tracker.md frontmatter declaration of tracker: tapd_mini plus workspace_id overrides origin detection; otherwise github.com uses GitHub, git.woa.com uses Gongfeng, and every other/no remote uses local markdown. Read the wayfinder skill and tracker document, then create or attach the map/tickets before launch. The gate validates binding structure, tracker ownership, reference shape, and child-key order, but deliberately does not contact the tracker or require proof that a reference exists or is readable. Refer to every issue by name. Split cross-repository work into separate workflows.

Every execution must use workflowScript and top-level extensionBindings['${WAYFINDER_BINDING_NAMESPACE}']. Tracked bindings have { mode: "tracked", tracker, map: { name, ref }, tickets: [{ key, name, ref }] } in exact child order. The only exemption is { mode: "exempt", reason: "one-shot-read-only" }. The gate blocks missing, mismatched, dynamic, unsupported, or invalid bindings.

An execution-bearing Wayfinder map has exactly one retained map-supervisor workflow for its whole active execution. Before launch, verify that no other map supervisor is active, record this workflow as the map supervisor, and launch every concurrent execution agent beneath it; later work resumes this workflow instead of launching a second one. Read the latest tracker-specific pitfall log and make every existing entry available to tracked children. GitHub and Gongfeng use WAYFINDER PITFALL map comments; TAPD mini uses append-only entries in the map description's ## 可复用障碍 section because mini-item comments are unavailable through MCP. A pitfall is only a non-obvious operational obstacle from build, deploy, tooling, permissions, environment, or shared infrastructure that can recur across independent tickets and be reused without knowing one ticket's decision history. Normal ticket iteration—hypotheses, rejected options, clarification, feedback, prototype adjustment, changing understanding, routine trial and error, typos, and transient failures from code under change—stays out of the pitfall log. When a child sends contact_supervisor reason "interview_request", answer from settled map/ticket decisions and repository evidence when possible. If human judgment is still required, read the grilling skill, ask the user exactly one question, then reply through subagent_supervisor. Do not bundle questions. The map supervisor is the only pitfall-log writer for that map's active execution. For every "pitfall_report", first reject candidates outside that narrow definition; for a qualifying candidate, re-read the latest log and compare the normalized Scope + Symptom + Cause key immediately before writing. If it matches an existing entry, reply with that entry's reference; otherwise append exactly one complete WAYFINDER PITFALL entry and reply with its reference. Never accept a child as complete before acknowledging its report. At workflow handoff, re-read the log and disclose every pitfall recorded, reused, or unresolved across the children, or explicitly report "Pitfalls: None". For tracked runs, treat a missing runtime acknowledgement '${WAYFINDER_EXTENSION_ACK_ID}' as policy failure rather than claiming compliant completion.`;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
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

export default function subagentWayfinder(pi: ExtensionAPI) {
  const childBinding = parseChildBinding(
    process.env.PI_SUBAGENT_EXTENSION_BINDINGS,
  );

  pi.on("session_start", () => {
    if (childBinding) {
      pi.events.emit("subagent:acknowledge-extension", {
        id: WAYFINDER_EXTENSION_ACK_ID,
      });
    }
  });

  pi.on("before_agent_start", (event) => {
    const additions: string[] = [];
    if (childBinding) additions.push(childPolicyPrompt(childBinding));
    if (event.systemPromptOptions.selectedTools?.includes("subagent")) {
      additions.push(PARENT_POLICY_PROMPT);
    }
    return additions.length > 0
      ? { systemPrompt: `${event.systemPrompt}\n\n${additions.join("\n\n")}` }
      : undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "subagent") return undefined;
    const input = record(event.input);
    if (!input)
      return { block: true, reason: "Subagent input must be an object." };

    // Management, control, and retained top-level resume calls preserve their
    // original launch contract and are outside the initial execution gate.
    if (typeof input.action === "string" && input.action.trim())
      return undefined;

    if (typeof input.workflowScriptPath === "string") {
      return {
        block: true,
        reason:
          "Wayfinder-gated subagents require inline workflowScript so child keys and ticket bindings can be verified.",
      };
    }
    if (
      typeof input.workflowScript !== "string" ||
      !input.workflowScript.trim()
    ) {
      return {
        block: true,
        reason:
          "Initial subagent execution must use workflowScript; direct { agent, task } execution cannot carry verified child tickets.",
      };
    }

    const inspection = inspectWorkflowScript(input.workflowScript);
    const workflowCwd = resolve(
      ctx.cwd,
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : ".",
    );
    const repositoryCache = new Map<string, Promise<RepositoryIdentity>>();
    const repositories = await Promise.all(
      inspection.lanes.map((lane) => {
        const childCwd = resolve(workflowCwd, lane.cwd ?? ".");
        const cached = repositoryCache.get(childCwd);
        if (cached) return cached;
        const pending = inspectRepository(pi, childCwd, ctx.signal);
        repositoryCache.set(childCwd, pending);
        return pending;
      }),
    );

    const result = validateWayfinderGate({
      inspection,
      repositories,
      extensionBindings: input.extensionBindings,
      topLevelTimeoutMs: numberValue(input.timeoutMs),
      topLevelMaxRuntimeMs: numberValue(input.maxRuntimeMs),
      topLevelWorktree: input.worktree === true,
    });
    if (!result.ok) {
      if (ctx.hasUI)
        ctx.ui.notify(`Subagent blocked: ${result.reason}`, "warning");
      return { block: true, reason: result.reason };
    }

    input.workflowScript = injectChildBindings(
      input.workflowScript,
      inspection,
      result.binding,
    );
    return undefined;
  });
}
