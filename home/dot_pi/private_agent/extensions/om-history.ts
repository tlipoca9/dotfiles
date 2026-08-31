import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCompactedHistoryTools } from "./lib/compacted-history.ts";

export default function omHistory(pi: ExtensionAPI): void {
	registerCompactedHistoryTools(pi);
}
