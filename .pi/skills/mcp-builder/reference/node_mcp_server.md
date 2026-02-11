# Node/TypeScript MCP Server Implementation Guide

This reference provides TypeScript/Node-specific patterns and examples for implementing MCP servers using the official MCP TypeScript SDK. It covers project setup, tool implementation, advanced features, and complete working examples.

---

## SDK Overview

### MCP TypeScript SDK

The official MCP TypeScript SDK provides:

- `McpServer` class for server initialization
- Type-safe tool, resource, and prompt registration
- Zod schema integration for runtime validation
- Support for all MCP transports (stdio, Streamable HTTP)
- Full TypeScript type definitions

**Installation**:
```bash
npm install @modelcontextprotocol/sdk zod
# or
yarn add @modelcontextprotocol/sdk zod
```

---

## Quick Start

### Minimal Server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-service-mcp-server",
  version: "1.0.0"
});

server.registerTool(
  "hello",
  {
    title: "Say Hello",
    description: "Say hello to someone by name.",
    inputSchema: z.object({
      name: z.string().describe("The name to greet")
    })
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

### Running the Server

```bash
# Build
npm run build

# Run (stdio transport)
node dist/index.js

# Or with npx for development
npx ts-node src/index.ts
```

---

## Project Structure

```
{service}-mcp-server/
├── src/
│   ├── index.ts              # Main entry point
│   ├── server.ts             # McpServer configuration
│   ├── tools/
│   │   ├── index.ts          # Tool exports
│   │   ├── users.ts          # User-related tools
│   │   └── projects.ts       # Project-related tools
│   ├── schemas/
│   │   ├── index.ts          # Schema exports
│   │   ├── users.ts          # User Zod schemas
│   │   └── common.ts         # Shared schemas
│   ├── utils/
│   │   ├── api-client.ts     # HTTP client wrapper
│   │   ├── formatting.ts     # Response formatting
│   │   └── pagination.ts     # Pagination helpers
│   ├── types.ts              # TypeScript interfaces
│   └── config.ts             # Configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Server Naming Convention

TypeScript MCP servers use hyphenated format: `{service}-mcp-server`

Examples:
- `github-mcp-server`
- `slack-mcp-server`
- `stripe-mcp-server`
- `notion-mcp-server`

---

## Tool Implementation

### Basic Tool with Zod

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "example-mcp-server",
  version: "1.0.0"
});

// Define input schema with Zod
const GetUserInputSchema = z.object({
  userId: z.string()
    .min(1)
    .describe("The unique identifier of the user (e.g., 'U123456')")
}).strict();

// Infer TypeScript type from schema
type GetUserInput = z.infer<typeof GetUserInputSchema>;

server.registerTool(
  "example_get_user",
  {
    title: "Get User",
    description: `Get detailed information about a specific user.

Args:
  - userId (string): The user's unique identifier (e.g., "U123456")

Returns:
  User details in markdown format including:
  - Name and ID
  - Email address
  - Department
  - Status (active/inactive)

Use this tool when you have a user ID and need their details.
Don't use when you need to find a user (use example_search_users instead).`,
    inputSchema: GetUserInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetUserInput) => {
    const user = await apiClient.getUser(params.userId);
    
    const text = [
      `# ${user.name}`,
      ``,
      `- **ID**: ${user.id}`,
      `- **Email**: ${user.email}`,
      `- **Department**: ${user.department ?? 'N/A'}`,
      `- **Status**: ${user.active ? 'Active' : 'Inactive'}`
    ].join('\n');
    
    return {
      content: [{ type: "text", text }]
    };
  }
);
```

### Complex Tool with Validation

```typescript
import { z } from "zod";

// Response format enum
const ResponseFormat = z.enum(["markdown", "json"]);
type ResponseFormatType = z.infer<typeof ResponseFormat>;

// Search input schema with comprehensive validation
const SearchUsersInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against names, emails, or departments"),
  
  limit: z.number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must not exceed 100")
    .default(20)
    .describe("Maximum results to return (1-100, default: 20)"),
  
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  
  format: ResponseFormat
    .default("markdown")
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
  
  includeInactive: z.boolean()
    .default(false)
    .describe("Whether to include deactivated users")
}).strict();

type SearchUsersInput = z.infer<typeof SearchUsersInputSchema>;

server.registerTool(
  "example_search_users",
  {
    title: "Search Users",
    description: `Search for users in the Example system by name, email, or department.

This tool searches across all user profiles, supporting partial matches
and filtering options. It does NOT create or modify users.

Args:
  - query (string): Search string, minimum 2 characters
  - limit (number): Maximum results, 1-100 (default: 20)
  - offset (number): Skip results for pagination (default: 0)
  - format ('markdown' | 'json'): Output format (default: 'markdown')
  - includeInactive (boolean): Include deactivated users (default: false)

Returns:
  For markdown format: Formatted list with name, email, department
  For JSON format:
  {
    "total": number,
    "count": number,
    "offset": number,
    "users": [{ "id", "name", "email", "department", "active" }],
    "has_more": boolean,
    "next_offset": number
  }

Examples:
  - Find by name: { "query": "john smith" }
  - Find by department: { "query": "engineering", "limit": 50 }
  - Paginate: { "query": "smith", "offset": 20 }

Error Handling:
  - Returns error if query is less than 2 characters
  - Returns "Rate limit exceeded" on 429 (wait and retry)`,
    inputSchema: SearchUsersInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: SearchUsersInput) => {
    try {
      const data = await apiClient.searchUsers({
        query: params.query,
        limit: params.limit,
        offset: params.offset,
        includeInactive: params.includeInactive
      });
      
      const text = params.format === "markdown"
        ? formatUsersMarkdown(data.users, data.total, params.offset)
        : formatUsersJson(data.users, data.total, params.offset);
      
      return {
        content: [{ type: "text", text }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: formatError(error) }],
        isError: true
      };
    }
  }
);
```

### Tool Annotations Reference

| Annotation | Type | Default | Description |
|------------|------|---------|-------------|
| `title` | string | - | Human-readable tool title |
| `readOnlyHint` | boolean | false | Tool does not modify environment |
| `destructiveHint` | boolean | true | Tool may perform destructive updates |
| `idempotentHint` | boolean | false | Repeated calls have same effect |
| `openWorldHint` | boolean | true | Interacts with external systems |

---

## Advanced Features

### Resources

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";

// Register a resource with URI template
server.registerResource(
  {
    uri: "config://settings/{key}",
    name: "Configuration Settings",
    description: "Access configuration settings by key",
    mimeType: "application/json"
  },
  async (uri: string) => {
    const match = uri.match(/^config:\/\/settings\/(.+)$/);
    if (!match) {
      throw new Error("Invalid URI format");
    }
    
    const key = match[1];
    const value = await getConfigValue(key);
    
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2)
      }]
    };
  }
);

// List available resources dynamically
server.registerResourceList(async () => {
  const settings = await listSettings();
  return {
    resources: settings.map(s => ({
      uri: `config://settings/${s.key}`,
      name: s.name,
      description: s.description,
      mimeType: "application/json"
    }))
  };
});
```

### Multiple Transports

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamable-http.js";

// Stdio transport (default - for CLI tools)
async function runStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Streamable HTTP transport (for remote servers)
async function runHTTP(port: number) {
  const transport = new StreamableHTTPServerTransport({
    port,
    endpoint: "/mcp"
  });
  await server.connect(transport);
  console.log(`MCP server running on http://localhost:${port}/mcp`);
}

// Select based on environment
const transport = process.env.MCP_TRANSPORT === "http" ? "http" : "stdio";
if (transport === "http") {
  runHTTP(parseInt(process.env.PORT || "8000"));
} else {
  runStdio();
}
```

### Notifications

```typescript
// Notify clients when tools change
server.notification({
  method: "notifications/tools/list_changed"
});

// Notify when resources change
server.notification({
  method: "notifications/resources/list_changed"
});
```

---

## API Client Pattern

### Type-Safe HTTP Client

```typescript
import axios, { AxiosInstance, AxiosError } from "axios";

interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  active: boolean;
}

interface SearchResult<T> {
  items: T[];
  total: number;
}

class APIClient {
  private client: AxiosInstance;
  
  constructor(baseURL: string, apiKey: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });
  }
  
  async getUser(userId: string): Promise<User> {
    try {
      const response = await this.client.get<User>(`/users/${userId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  async searchUsers(params: {
    query: string;
    limit: number;
    offset: number;
    includeInactive: boolean;
  }): Promise<SearchResult<User> & { total: number }> {
    try {
      const response = await this.client.get<SearchResult<User>>("/users/search", {
        params: {
          q: params.query,
          limit: params.limit,
          offset: params.offset,
          include_inactive: params.includeInactive
        }
      });
      return {
        ...response.data,
        total: response.data.total
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>;
      const status = axiosError.response?.status;
      const message = axiosError.response?.data?.message || axiosError.message;
      
      switch (status) {
        case 401:
          return new AuthenticationError("Invalid or expired API credentials");
        case 403:
          return new PermissionError("Insufficient permissions");
        case 404:
          return new NotFoundError("Resource not found");
        case 429:
          const retryAfter = axiosError.response?.headers["retry-after"] || "60";
          return new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter}s`);
        default:
          return new APIError(`API error (${status}): ${message}`);
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

// Custom error classes
class MCPError extends Error {
  constructor(public type: string, message: string, public suggestion?: string) {
    super(message);
    this.name = "MCPError";
  }
}

class AuthenticationError extends MCPError {
  constructor(message: string) {
    super("AuthenticationError", message, "Check your API credentials");
  }
}

class PermissionError extends MCPError {
  constructor(message: string) {
    super("PermissionError", message);
  }
}

class NotFoundError extends MCPError {
  constructor(message: string) {
    super("NotFoundError", message, "Verify the resource exists");
  }
}

class RateLimitError extends MCPError {
  constructor(message: string) {
    super("RateLimitError", message, "Wait and retry");
  }
}

class APIError extends MCPError {
  constructor(message: string) {
    super("APIError", message, "Try again or contact support");
  }
}
```

---

## Response Formatting

### Dual-Format Support

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  active: boolean;
}

const CHARACTER_LIMIT = 25000;

function formatUsersMarkdown(users: User[], total: number, offset: number): string {
  if (!users.length) {
    return "No users found matching your search.";
  }
  
  const lines: string[] = [
    "# User Search Results",
    "",
    `Found ${total} users (showing ${users.length} starting at ${offset})`,
    ""
  ];
  
  for (const user of users) {
    lines.push(
      `## ${user.name} (${user.id})`,
      `- **Email**: ${user.email}`,
      `- **Department**: ${user.department ?? "N/A"}`,
      `- **Status**: ${user.active ? "Active" : "Inactive"}`,
      ""
    );
  }
  
  if (total > offset + users.length) {
    lines.push(`*Use offset=${offset + users.length} to see more results*`);
  }
  
  return truncateIfNeeded(lines.join("\n"));
}

function formatUsersJson(users: User[], total: number, offset: number): string {
  const response = {
    total,
    count: users.length,
    offset,
    has_more: total > offset + users.length,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department ?? null,
      active: u.active
    })),
    ...(total > offset + users.length ? { next_offset: offset + users.length } : {})
  };
  
  return truncateIfNeeded(JSON.stringify(response, null, 2));
}

function truncateIfNeeded(content: string): string {
  if (content.length <= CHARACTER_LIMIT) {
    return content;
  }
  
  return content.slice(0, CHARACTER_LIMIT - 100) + 
    "\n\n**Response truncated.** Use filters or pagination to reduce results.";
}
```

### Error Formatting

```typescript
function formatError(error: unknown): string {
  if (error instanceof MCPError) {
    const lines = [
      `**Error**: ${error.type}`,
      "",
      error.message
    ];
    
    if (error.suggestion) {
      lines.push("", `**Suggestion**: ${error.suggestion}`);
    }
    
    return lines.join("\n");
  }
  
  return `**Error**: Unexpected error\n\n${String(error)}`;
}
```

---

## Complete Example

```typescript
/**
 * Example MCP Server for User Management
 * 
 * Provides tools for searching and managing users
 * in an external service.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosInstance, AxiosError } from "axios";

// Configuration
const API_BASE_URL = process.env.API_URL || "https://api.example.com";
const API_KEY = process.env.API_KEY;
const CHARACTER_LIMIT = 25000;

// Types
interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  active: boolean;
  createdAt?: string;
}

interface SearchResponse {
  users: User[];
  total: number;
}

// Schemas
const ResponseFormat = z.enum(["markdown", "json"]);

const SearchUsersInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against names or emails"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results (1-100, default: 20)"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Results to skip for pagination"),
  format: ResponseFormat
    .default("markdown")
    .describe("Output format")
}).strict();

const GetUserInputSchema = z.object({
  userId: z.string()
    .min(1)
    .describe("User's unique identifier")
}).strict();

const CreateUserInputSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .describe("User's full name"),
  email: z.string()
    .email()
    .describe("User's email address"),
  department: z.string()
    .max(50)
    .optional()
    .describe("User's department (optional)")
}).strict();

type SearchUsersInput = z.infer<typeof SearchUsersInputSchema>;
type GetUserInput = z.infer<typeof GetUserInputSchema>;
type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

// API Client
class APIClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });
  }
  
  async searchUsers(query: string, limit: number, offset: number): Promise<SearchResponse> {
    const response = await this.client.get<SearchResponse>("/users/search", {
      params: { q: query, limit, offset }
    });
    return response.data;
  }
  
  async getUser(userId: string): Promise<User> {
    const response = await this.client.get<User>(`/users/${userId}`);
    return response.data;
  }
  
  async createUser(data: CreateUserInput): Promise<User> {
    const response = await this.client.post<User>("/users", data);
    return response.data;
  }
}

const apiClient = new APIClient();

// Formatting utilities
function formatUsersMarkdown(users: User[], total: number, offset: number): string {
  if (!users.length) {
    return "No users found matching your search.";
  }
  
  const lines = [
    "# User Search Results",
    "",
    `Found ${total} users (showing ${users.length} starting at ${offset})`,
    ""
  ];
  
  for (const user of users) {
    lines.push(
      `## ${user.name} (${user.id})`,
      `- **Email**: ${user.email}`,
      `- **Department**: ${user.department ?? "N/A"}`,
      ""
    );
  }
  
  if (total > offset + users.length) {
    lines.push(`*Use offset=${offset + users.length} for more results*`);
  }
  
  let result = lines.join("\n");
  if (result.length > CHARACTER_LIMIT) {
    result = result.slice(0, CHARACTER_LIMIT - 100) + "\n\n**Truncated**";
  }
  
  return result;
}

function formatUsersJson(users: User[], total: number, offset: number): string {
  const response = {
    total,
    count: users.length,
    offset,
    has_more: total > offset + users.length,
    users,
    ...(total > offset + users.length ? { next_offset: offset + users.length } : {})
  };
  return JSON.stringify(response, null, 2);
}

function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 404) {
      return "**Error**: Not Found\n\nThe requested resource was not found.";
    }
    if (status === 429) {
      return "**Error**: Rate Limit\n\nPlease wait before retrying.";
    }
    return `**Error**: API Error (${status})\n\n${error.message}`;
  }
  return `**Error**: ${String(error)}`;
}

// Server setup
const server = new McpServer({
  name: "example-mcp-server",
  version: "1.0.0"
});

// Register tools
server.registerTool(
  "example_search_users",
  {
    title: "Search Users",
    description: `Search for users by name, email, or department.

Args:
  - query (string): Search string (min 2 chars)
  - limit (number): Max results, 1-100 (default: 20)
  - offset (number): Skip results for pagination
  - format ('markdown' | 'json'): Output format

Returns matching users with pagination support.`,
    inputSchema: SearchUsersInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: SearchUsersInput) => {
    try {
      const data = await apiClient.searchUsers(
        params.query,
        params.limit,
        params.offset
      );
      
      const text = params.format === "markdown"
        ? formatUsersMarkdown(data.users, data.total, params.offset)
        : formatUsersJson(data.users, data.total, params.offset);
      
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: formatError(error) }],
        isError: true
      };
    }
  }
);

server.registerTool(
  "example_get_user",
  {
    title: "Get User",
    description: `Get detailed information about a user by ID.

Args:
  - userId (string): The user's unique identifier

Returns user details including name, email, department, and status.`,
    inputSchema: GetUserInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetUserInput) => {
    try {
      const user = await apiClient.getUser(params.userId);
      
      const text = [
        `# ${user.name}`,
        "",
        `- **ID**: ${user.id}`,
        `- **Email**: ${user.email}`,
        `- **Department**: ${user.department ?? "N/A"}`,
        `- **Status**: ${user.active ? "Active" : "Inactive"}`
      ].join("\n");
      
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: formatError(error) }],
        isError: true
      };
    }
  }
);

server.registerTool(
  "example_create_user",
  {
    title: "Create User",
    description: `Create a new user in the system.

Args:
  - name (string): User's full name
  - email (string): User's email address
  - department (string, optional): User's department

Returns confirmation with the new user's ID.`,
    inputSchema: CreateUserInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: CreateUserInput) => {
    try {
      const user = await apiClient.createUser(params);
      
      const text = [
        "✅ **User Created**",
        "",
        `- **ID**: ${user.id}`,
        `- **Name**: ${user.name}`,
        `- **Email**: ${user.email}`
      ].join("\n");
      
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: formatError(error) }],
        isError: true
      };
    }
  }
);

// Main
async function main() {
  if (!API_KEY) {
    console.error("ERROR: API_KEY environment variable required");
    process.exit(1);
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Example MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
```

---

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### package.json

```json
{
  "name": "example-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "npx ts-node src/index.ts",
    "lint": "eslint src/**/*.ts",
    "test": "jest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Quality Checklist

### Implementation
- [ ] All tools use Zod schemas with `.strict()`
- [ ] TypeScript types inferred from Zod schemas
- [ ] Tool annotations correctly configured
- [ ] Comprehensive descriptions with Args/Returns
- [ ] Error handling with actionable messages

### TypeScript Quality
- [ ] Strict mode enabled in tsconfig.json
- [ ] No use of `any` type
- [ ] All functions have explicit return types
- [ ] Type guards for error handling

### Build & Test
- [ ] `npm run build` completes without errors
- [ ] `dist/index.js` created and executable
- [ ] All imports resolve correctly

### Documentation
- [ ] README with setup instructions
- [ ] Environment variables documented
- [ ] Example usage included

---

*Node/TypeScript MCP Server Reference v2.0 — January 2026*
*Covers MCP TypeScript SDK and specification 2025-11-25*
