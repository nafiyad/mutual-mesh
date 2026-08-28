export type WebMCPToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

export type WebMCPTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMCPToolAnnotations;
  execute: (input: unknown, options: { signal: AbortSignal }) => unknown | Promise<unknown>;
};

export type WebMCPModelContext = {
  registerTool: (tool: WebMCPTool, options?: { signal?: AbortSignal }) => Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: WebMCPModelContext;
  }
}
