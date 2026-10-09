import { chat } from "./provider.js";

const result = await chat([
  { role: "user", content: "Reply with exactly: Figma agent connection works." },
]);

if (!result.content.trim()) throw new Error("Provider returned empty content.");
process.stdout.write(result.content + "\n");
process.stdout.write("Connected using " + result.model + "\n");
if (typeof result.reasoningTokens === "number") {
  process.stdout.write("Reasoning tokens: " + result.reasoningTokens + "\n");
}
