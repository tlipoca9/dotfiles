declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function lstatSync(path: string): { isFile(): boolean };
  export function realpathSync(path: string): string;
}

declare module "node:path" {
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    exec(
      command: string,
      args: string[],
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<{
      stdout: string;
      stderr: string;
      code: number;
      killed: boolean;
    }>;
    events: { emit(name: string, payload: { id: string }): void };
    on(event: "session_start", handler: () => unknown): void;
    on(
      event: "before_agent_start",
      handler: (event: {
        systemPrompt: string;
        systemPromptOptions: { selectedTools?: string[] };
      }) => unknown,
    ): void;
    on(
      event: "tool_call",
      handler: (
        event: { toolName: string; input: unknown },
        context: {
          cwd: string;
          signal?: AbortSignal;
          hasUI: boolean;
          ui: { notify(message: string, level: "warning"): void };
        },
      ) => unknown,
    ): void;
  }
}

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
};
