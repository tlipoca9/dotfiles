declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function lstatSync(path: string): { isFile(): boolean };
  export function realpathSync(path: string): string;
}

declare module "node:path" {
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "@oh-my-pi/pi-coding-agent" {
  type ToolResult = {
    content: Array<{ type: "text"; text: string }>;
    details?: unknown;
    isError?: boolean;
  };

  type Schema = { readonly __schemaBrand?: never };

  type TypeBuilder = {
    Array(item: Schema, options?: Record<string, unknown>): Schema;
    Boolean(options?: Record<string, unknown>): Schema;
    Literal(value: string): Schema;
    Object(
      properties: Record<string, Schema>,
      options?: Record<string, unknown>,
    ): Schema;
    Optional(value: Schema): Schema;
    String(options?: Record<string, unknown>): Schema;
    Union(values: Schema[]): Schema;
    Unknown(): Schema;
  };

  type ToolExecutionContext = {
    cwd: string;
    invokeTool?(
      params: Record<string, unknown>,
      options?: { signal?: AbortSignal; onUpdate?: unknown },
    ): Promise<ToolResult>;
  };

  export interface ExtensionAPI {
    typebox: { Type: TypeBuilder };
    setLabel(label: string): void;
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
    on(
      event: "before_agent_start",
      handler: (event: { systemPrompt: string[] }) => unknown,
    ): void;
    registerTool(definition: {
      name: string;
      label: string;
      description: string;
      parameters: Schema;
      approval?: "read" | "write" | "exec";
      execute(
        toolCallId: string,
        params: unknown,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        context: ToolExecutionContext,
      ): Promise<ToolResult>;
    }): void;
  }
}

declare const process: {
  platform: string;
};
