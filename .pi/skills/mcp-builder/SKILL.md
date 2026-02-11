---
name: mcp-builder
description: Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK). Covers MCP 2025-11-25 specification including Tasks, elicitation, OAuth authorization, and Registry publication.
license: Apache-2.0
---

# MCP Server Development Guide

## Overview

This skill guides the creation of high-quality MCP (Model Context Protocol) servers that enable LLMs to effectively interact with external services. An MCP server provides tools, resources, and prompts that allow LLMs to access external services and APIs in a standardized way.

MCP is now governed by the Agentic AI Foundation (AAIF) under the Linux Foundation, co-founded by Anthropic, Block, and OpenAI. The protocol has become the de-facto standard for connecting LLMs to external context.

**Current Specification**: 2025-11-25 (November 2025 Anniversary Release)

**Quality Measure**: The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks using the tools provided—not by how comprehensively it wraps API endpoints.


## Reference Files

Load these reference files as needed during development:

| File | Purpose | When to Load |
|------|---------|--------------|
| `reference/mcp_best_practices.md` | Universal MCP guidelines, naming, response formats, pagination | Phase 1 (always) |
| `reference/python_mcp_server.md` | Python/FastMCP implementation patterns | Phase 2 (Python) |
| `reference/node_mcp_server.md` | TypeScript/Node SDK patterns | Phase 2 (TypeScript) |
| `reference/evaluation.md` | Creating evaluation test suites | Phase 4 |
| `reference/mcp_2025_updates.md` | Latest spec features: Tasks, elicitation, OAuth, Registry | Phase 1 (review new features) |

**External Documentation** (fetch with WebFetch):
- MCP Protocol: `https://modelcontextprotocol.io/llms-full.txt`
- Python SDK: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- TypeScript SDK: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- FastMCP: `https://gofastmcp.com/llms-full.txt`


---

# Development Process

## Phase 1: Research and Planning

### 1.1 Agent-Centric Design Principles

Before implementation, internalize these principles that distinguish excellent MCP servers:

**Build for Workflows, Not API Endpoints**
- Don't simply wrap existing API endpoints—build thoughtful, high-impact workflow tools
- Consolidate related operations (e.g., `schedule_event` that checks availability AND creates the event)
- Focus on tools that enable complete tasks, not individual API calls
- Consider what workflows agents actually need to accomplish

**Optimize for Limited Context**
- Agents have constrained context windows—make every token count
- Return high-signal information, not exhaustive data dumps
- Provide "concise" vs "detailed" response format options
- Default to human-readable identifiers over technical codes (names over IDs)
- Consider the agent's context budget as a scarce resource

**Design Actionable Error Messages**
- Error messages should guide agents toward correct usage patterns
- Suggest specific next steps: "Try using filter='active_only' to reduce results"
- Make errors educational, not just diagnostic
- Help agents learn proper tool usage through clear feedback

**Follow Natural Task Subdivisions**
- Tool names should reflect how humans think about tasks
- Group related tools with consistent prefixes for discoverability
- Design tools around natural workflows, not API structure

**Use Evaluation-Driven Development**
- Create realistic evaluation scenarios early
- Let agent feedback drive tool improvements
- Prototype quickly and iterate based on actual agent performance


### 1.2 Study Protocol Documentation

Fetch and review the complete MCP specification:
```
WebFetch: https://modelcontextprotocol.io/llms-full.txt
```

Also load [reference/mcp_2025_updates.md](./reference/mcp_2025_updates.md) to understand:
- **Tasks**: Async/background operations with progress tracking
- **Elicitation**: Requesting additional user information during tool execution
- **OAuth 2.1**: Authorization requirements for HTTP transports
- **Extensions**: Protocol extension framework
- **Registry**: Publishing and distributing servers


### 1.3 Study Framework Documentation

**For Python implementations**:
- Fetch: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`
- Fetch: `https://gofastmcp.com/llms-full.txt` (FastMCP 2.14+ documentation)
- Load: [reference/python_mcp_server.md](./reference/python_mcp_server.md)

**For Node/TypeScript implementations**:
- Fetch: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- Load: [reference/node_mcp_server.md](./reference/node_mcp_server.md)


### 1.4 Study API Documentation

Exhaustively read ALL available API documentation for the service you're integrating:
- Official API reference documentation
- Authentication and authorization requirements
- Rate limiting and pagination patterns
- Error responses and status codes
- Available endpoints and their parameters
- Data models and schemas
- Webhooks and real-time features (if applicable)

Use web search and WebFetch as needed to gather comprehensive information.


### 1.5 Create Implementation Plan

Based on research, create a detailed plan including:

**Tool Selection**
- List the most valuable operations to implement
- Prioritize tools enabling common and important use cases
- Consider which tools work together to enable complex workflows
- Identify candidates for background Tasks (long-running operations)

**Architecture Decisions**
- Transport type: stdio (local) vs Streamable HTTP (remote)
- Statefulness requirements
- Authentication approach (OAuth, API key, etc.)
- Whether to support elicitation for user input

**Shared Utilities**
- API request patterns
- Pagination helpers
- Filtering and formatting utilities
- Error handling strategies

**Input/Output Design**
- Input validation models (Pydantic for Python, Zod for TypeScript)
- Response formats (JSON and Markdown options)
- Character limits and truncation strategies (typically 25,000)
- Output schemas for structured tool outputs


---

## Phase 2: Implementation

### 2.1 Project Structure

**Python (FastMCP)**
```
{service}_mcp/
├── server.py          # Main FastMCP server
├── tools/             # Tool implementations
├── schemas/           # Pydantic models
├── utils/             # Shared utilities
├── requirements.txt   # Dependencies
└── README.md
```

**Node/TypeScript**
```
{service}-mcp-server/
├── src/
│   ├── index.ts       # Main entry point
│   ├── tools/         # Tool implementations
│   ├── schemas/       # Zod schemas
│   └── utils/         # Shared utilities
├── package.json
├── tsconfig.json
└── README.md
```

### 2.2 Server Naming Conventions

| Language | Format | Examples |
|----------|--------|----------|
| Python | `{service}_mcp` | `github_mcp`, `slack_mcp`, `stripe_mcp` |
| Node/TypeScript | `{service}-mcp-server` | `github-mcp-server`, `slack-mcp-server` |


### 2.3 Implement Core Infrastructure First

Before implementing tools, create shared utilities:

1. **API Client** - Centralized HTTP request handling
2. **Error Handling** - Consistent error formatting
3. **Response Formatting** - JSON and Markdown output functions
4. **Pagination Helpers** - Cursor/offset pagination utilities
5. **Authentication** - Token management, refresh logic


### 2.4 Implement Tools Systematically

For each tool:

1. **Define Input Schema**
   - Use Pydantic (Python) or Zod (TypeScript)
   - Include constraints (min/max, patterns, enums)
   - Write clear field descriptions with examples

2. **Write Comprehensive Documentation**
   - One-line summary
   - Detailed explanation of purpose
   - Parameter types with examples
   - Return type schema
   - Usage examples (when to use, when NOT to use)
   - Error handling guidance

3. **Add Tool Annotations**
   ```
   readOnlyHint: true/false      # Does not modify environment
   destructiveHint: true/false   # May perform destructive updates
   idempotentHint: true/false    # Repeated calls have same effect
   openWorldHint: true/false     # Interacts with external systems
   ```

4. **Implement Tool Logic**
   - Use shared utilities
   - Follow async/await patterns
   - Support multiple response formats
   - Respect pagination parameters
   - Check character limits and truncate appropriately


### 2.5 Implement Advanced Features (As Needed)

**Background Tasks** (for long-running operations):
```python
# Python with FastMCP
@mcp.tool(task=True)
async def long_operation(data: str) -> str:
    # Client receives task handle immediately
    # Can poll for progress and results
    ...
```

**Elicitation** (for user input during execution):
```python
@mcp.tool()
async def book_table(date: str, ctx: Context) -> str:
    if not available(date):
        result = await ctx.elicit(
            message="No tables available. Try another date?",
            schema=AlternativeDateSchema
        )
        if result.action == "accept":
            return book(result.data.alternative_date)
    return book(date)
```

**Resources** (for data access via URI templates):
```python
@mcp.resource("config://settings/{key}")
async def get_setting(key: str) -> str:
    return json.dumps(settings.get(key))
```

**Sampling** (for server-side LLM calls):
```python
@mcp.tool()
async def summarize(content: str, ctx: Context) -> str:
    result = await ctx.sample(
        messages=[{"role": "user", "content": f"Summarize: {content}"}],
        max_tokens=200
    )
    return result.content.text
```


### 2.6 Configure Transport

**Stdio** (default, for local/CLI tools):
```python
if __name__ == "__main__":
    mcp.run()  # Default stdio transport
```

**Streamable HTTP** (for remote/multi-client):
```python
if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=8000)
```

Note: SSE transport is deprecated as of 2025-03-26. Use Streamable HTTP for all new remote deployments.


---

## Phase 3: Review and Refine

### 3.1 Code Quality Review

Verify:
- **DRY**: No duplicated code between tools
- **Composability**: Shared logic extracted into functions
- **Consistency**: Similar operations return similar formats
- **Error Handling**: All external calls have error handling
- **Type Safety**: Full type coverage
- **Documentation**: Every tool has comprehensive descriptions


### 3.2 Test and Build

**Important**: MCP servers are long-running processes. Running directly will cause your process to hang indefinitely.

**Safe testing approaches**:
- Use the evaluation harness (Phase 4)
- Run server in tmux/background
- Use timeout: `timeout 5s python server.py`

**Python**:
```bash
python -m py_compile server.py  # Syntax check
python server.py --help         # If CLI mode supported
```

**Node/TypeScript**:
```bash
npm run build                   # Must succeed
node dist/index.js --help       # If CLI mode supported
```


### 3.3 Security Review

Before deployment, verify:
- [ ] Input validation on all parameters
- [ ] No sensitive data in error messages
- [ ] OAuth tokens handled securely (if applicable)
- [ ] Origin header validation for HTTP transport
- [ ] Rate limiting implemented
- [ ] Credential rotation supported


---

## Phase 4: Create Evaluations

Load [reference/evaluation.md](./reference/evaluation.md) for complete guidelines.

### 4.1 Evaluation Purpose

Evaluations test whether LLMs can effectively use your MCP server to answer realistic, complex questions. They measure tool quality, not just implementation correctness.


### 4.2 Create 10 Evaluation Questions

Each question must be:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases humans care about
- **Verifiable**: Single, clear answer verifiable by string comparison
- **Stable**: Answer won't change over time


### 4.3 Evaluation Output Format

```xml
<evaluation>
  <qa_pair>
    <question>Your complex question here</question>
    <answer>Single verifiable answer</answer>
  </qa_pair>
  <!-- More qa_pairs... -->
</evaluation>
```


---

## Phase 5: Publish to MCP Registry (Optional)

The MCP Registry (registry.modelcontextprotocol.io) is the official catalog for publicly available MCP servers.

### 5.1 Create server.json

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
  "name": "io.github.username/your-mcp-server",
  "description": "Your server description",
  "version": "1.0.0",
  "packages": [
    {
      "registry_type": "npm",
      "identifier": "your-package-name",
      "version": "1.0.0",
      "transport": { "type": "stdio" }
    }
  ],
  "repository": {
    "url": "https://github.com/username/repo",
    "source": "github"
  }
}
```

### 5.2 Publish

1. Install mcp-publisher CLI
2. Authenticate: `mcp-publisher login github`
3. Publish: `mcp-publisher publish`

See MCP Registry documentation for complete publishing guide.


---

## Quick Reference

### Tool Annotations Reference

| Annotation | Type | Default | Purpose |
|------------|------|---------|---------|
| `title` | string | - | Human-readable tool title |
| `readOnlyHint` | boolean | false | Tool does not modify environment |
| `destructiveHint` | boolean | true | Tool may perform destructive updates |
| `idempotentHint` | boolean | false | Repeated calls have no additional effect |
| `openWorldHint` | boolean | true | Tool interacts with external entities |


### Response Format Guidelines

**Markdown** (default, human-readable):
- Use headers, lists, formatting for clarity
- Convert timestamps to human-readable format
- Show names with IDs in parentheses: `@john.doe (U123456)`

**JSON** (machine-readable):
- Include all fields and metadata
- Consistent field names and types
- Suitable for programmatic processing


### Character Limits

```python
CHARACTER_LIMIT = 25000  # Module-level constant

if len(result) > CHARACTER_LIMIT:
    # Truncate and add notice
    response["truncated"] = True
    response["truncation_message"] = "Use filters or pagination..."
```


### Pagination Response Structure

```json
{
  "total": 150,
  "count": 20,
  "offset": 0,
  "items": [...],
  "has_more": true,
  "next_offset": 20
}
```


---

*MCP Builder Skill v2.0 — January 2026*
*Supports MCP Specification 2025-11-25*
