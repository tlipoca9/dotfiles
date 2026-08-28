import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "workspace-performance";

interface PerformanceSample {
	requestStartedAt?: number;
	firstTokenAt?: number;
	lastTokenAt?: number;
	ttftMs?: number;
	tokensPerSecond?: number;
}

function compactTokens(value: number): string {
	if (value < 1_000) return String(value);
	if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function statusText(sample: PerformanceSample, ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const ttft = sample.ttftMs === undefined ? "TTFT —" : `TTFT ${(sample.ttftMs / 1_000).toFixed(2)}s`;
	const tpot = sample.tokensPerSecond === undefined ? "TPOT —" : `TPOT ${sample.tokensPerSecond.toFixed(1)} tok/s`;
	const context = usage
		? `CTX ${usage.percent === null ? "—" : `${usage.percent.toFixed(1)}%`} · ${usage.tokens === null ? "—" : compactTokens(usage.tokens)}/${compactTokens(usage.contextWindow)}`
		: "CTX —";
	return `${ttft} · ${tpot} · ${context}`;
}

function isTokenDelta(type: string): boolean {
	return type === "text_delta" || type === "thinking_delta";
}

export default function performanceStatus(pi: ExtensionAPI): void {
	const sample: PerformanceSample = {};
	let context: ExtensionContext | undefined;

	const render = (ctx = context): void => {
		if (ctx?.mode === "tui") {
			ctx.ui.setWidget(STATUS_KEY, [statusText(sample, ctx)], { placement: "belowEditor" });
		}
	};

	pi.on("session_start", (_event, ctx) => {
		context = ctx;
		render(ctx);
	});
	pi.on("turn_start", (_event, ctx) => {
		sample.requestStartedAt = Date.now();
		sample.firstTokenAt = undefined;
		sample.lastTokenAt = undefined;
		sample.ttftMs = undefined;
		sample.tokensPerSecond = undefined;
		render(ctx);
	});
	pi.on("before_provider_request", (_event, ctx) => {
		sample.requestStartedAt = Date.now();
		sample.firstTokenAt = undefined;
		sample.lastTokenAt = undefined;
		render(ctx);
	});
	pi.on("message_update", (event, ctx) => {
		if (event.message.role !== "assistant" || !isTokenDelta(event.assistantMessageEvent.type)) return;
		const now = Date.now();
		if (sample.firstTokenAt === undefined) {
			sample.firstTokenAt = now;
			if (sample.requestStartedAt !== undefined) sample.ttftMs = now - sample.requestStartedAt;
			render(ctx);
		}
		sample.lastTokenAt = now;
	});
	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const outputTokens = event.message.usage.output;
		if (sample.firstTokenAt !== undefined && sample.lastTokenAt !== undefined && outputTokens > 1) {
			const generationSeconds = Math.max(0.001, (sample.lastTokenAt - sample.firstTokenAt) / 1_000);
			sample.tokensPerSecond = (outputTokens - 1) / generationSeconds;
		}
		render(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setWidget(STATUS_KEY, undefined);
		context = undefined;
	});
}

export { compactTokens, isTokenDelta, statusText };
