import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
}

export default async function (pi: ExtensionAPI) {
    const configPath = path.join(pi.baseDir, "../../mcp.json");
    if (!fs.existsSync(configPath)) {
        console.log(`[MCP LOADER] No config found at ${configPath}`);
        return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const servers = config.mcpServers || {};

    for (const [serverName, serverConfig] of Object.entries<any>(servers)) {
        try {
            console.log(`[MCP LOADER] Initializing server: ${serverName}`);

            // Resolve env vars in config
            const env = { ...process.env, ...(serverConfig.env || {}) };
            for (const key in env) {
                if (typeof env[key] === 'string') {
                    env[key] = env[key].replace(/\{\{(\w+)\}\}/g, (_, m) => process.env[m] || "");
                }
            }

            const child = spawn(serverConfig.command, serverConfig.args, {
                env,
                stdio: ['pipe', 'pipe', 'inherit']
            });

            const tools = await listTools(serverName, child);
            console.log(`[MCP LOADER] Registered ${tools.length} tools for ${serverName}`);

            for (const tool of tools) {
                pi.registerTool({
                    name: `${serverName}_${tool.name}`,
                    description: `${tool.description} (Source: ${serverName})`,
                    parameters: tool.inputSchema,
                    execute: async (args) => {
                        return await callTool(child, tool.name, args);
                    }
                });
            }
        } catch (err) {
            console.error(`[MCP LOADER] Failed to load server ${serverName}:`, err);
        }
    }
}

async function listTools(name: string, child: ChildProcess): Promise<MCPTool[]> {
    return new Promise((resolve, reject) => {
        let response = "";
        const id = Date.now();
        const request = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/list",
            params: {}
        }) + "\n";

        const timeout = setTimeout(() => {
            child.stdout?.removeListener('data', onData);
            reject(new Error(`Timeout listing tools for ${name}`));
        }, 30000);

        function onData(data: Buffer) {
            response += data.toString();
            if (response.includes("\n")) {
                try {
                    const res = JSON.parse(response);
                    if (res.id === id) {
                        clearTimeout(timeout);
                        child.stdout?.removeListener('data', onData);
                        resolve(res.result.tools || []);
                    }
                } catch (e) {
                    // Wait for more data
                }
            }
        }

        child.stdout?.on('data', onData);
        child.stdin?.write(request);
    });
}

async function callTool(child: ChildProcess, name: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let response = "";
        const id = Math.random().toString(36).substring(7);
        const request = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args }
        }) + "\n";

        function onData(data: Buffer) {
            response += data.toString();
            if (response.includes("\n")) {
                try {
                    const res = JSON.parse(response);
                    if (res.id === id) {
                        child.stdout?.removeListener('data', onData);
                        resolve(res.result.content);
                    }
                } catch (e) {
                    // Wait for more data
                }
            }
        }

        child.stdout?.on('data', onData);
        child.stdin?.write(request);
    });
}
