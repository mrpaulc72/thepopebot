/**
 * Permission Gate Extension - Intercepts sensitive commands
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";

// List of command patterns that require explicit permission
const SENSITIVE_PATTERNS = [
    /git push/,
    /git merge/,
    /rm -rf/,
    /npm publish/,
    /docker push/
];

export default function (pi: ExtensionAPI) {
    // Override bash tool
    const bashTool = createBashTool(process.cwd(), {
        spawnHook: ({ command, cwd, env }) => {
            const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(command));

            if (isSensitive) {
                console.log(`[PERMISSION GATE] Sensitive command detected: ${command}`);

                // In a GitHub Actions environment, we can't wait for interactive input easily.
                // Instead, we mark the command as blocked and instruct the agent.
                throw new Error(
                    `PERMISSION_DENIED: The command "${command}" is sensitive and requires explicit user approval. ` +
                    `Please explain why you need this command and ask the user to re-run the job with PERMISSION_GRANTED=true.`
                );
            }

            // If PERMISSION_GRANTED=true is in the env, bypass for this specific run
            if (process.env.PERMISSION_GRANTED === 'true') {
                return { command, cwd, env };
            }

            return { command, cwd, env };
        },
    });

    pi.registerTool(bashTool);
}
