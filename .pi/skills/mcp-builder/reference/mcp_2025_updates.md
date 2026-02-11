# MCP 2025 Updates Reference

This reference covers major MCP specification updates from 2025, focusing on features that significantly change how MCP servers are built and deployed.


## Specification Timeline

| Version | Date | Key Features |
|---------|------|--------------|
| 2024-11-05 | Nov 2024 | Initial release (HTTP+SSE transport) |
| 2025-03-26 | Mar 2025 | Streamable HTTP, tool annotations, OAuth foundation |
| 2025-06-18 | Jun 2025 | Structured outputs, elicitation, enhanced OAuth security |
| 2025-11-25 | Nov 2025 | Tasks (async operations), extensions framework, OAuth enhancements |


## Tasks (Background Operations)

**Specification**: SEP-1686 (2025-11-25)

Tasks provide a protocol-native way to handle long-running operations. Instead of blocking until completion, clients receive a task handle immediately and can poll for progress.

### Task Lifecycle States

```
working → completed
working → failed
working → cancelled
working → input_required → working → completed
```

### Python Implementation (FastMCP 2.14+)

```python
from fastmcp import FastMCP
from fastmcp.dependencies import Progress

mcp = FastMCP("MyServer")

@mcp.tool(task=True)
async def train_model(data: str, progress: Progress) -> str:
    """Long-running model training operation."""
    
    for i in range(100):
        await progress.report(i / 100, f"Training step {i}/100")
        await do_training_step(i)
    
    return "Training complete"
```

### Client Behavior

1. Client calls tool with task hint
2. Server returns task ID immediately
3. Client polls `tasks/status` for progress
4. Client retrieves results via `tasks/result` when complete

### When to Use Tasks

- Operations taking >30 seconds
- Data processing pipelines
- External API calls with unpredictable latency
- Any operation where progress tracking is valuable

### Configuration (FastMCP)

```python
# In-memory backend (default)
mcp = FastMCP("Server")

# Redis backend for persistence and scaling
mcp = FastMCP("Server", task_backend="redis://localhost:6379")
```


## Elicitation

**Specification**: 2025-06-18

Elicitation allows servers to request additional information from users during tool execution. This enables "human-in-the-loop" workflows.

### Form Mode (Structured Data)

Collect non-sensitive data using JSON schemas:

```python
from pydantic import BaseModel, Field
from mcp.server.fastmcp import Context, FastMCP

mcp = FastMCP("Booking Server")

class BookingPreferences(BaseModel):
    check_alternative: bool = Field(description="Try another date?")
    alternative_date: str = Field(default="2024-12-26")

@mcp.tool()
async def book_table(date: str, party_size: int, ctx: Context) -> str:
    """Book a restaurant table with availability check."""
    
    if not is_available(date, party_size):
        result = await ctx.elicit(
            message=f"No tables for {party_size} on {date}. Try another date?",
            schema=BookingPreferences
        )
        
        if result.action == "accept" and result.data:
            if result.data.check_alternative:
                return book(result.data.alternative_date)
        
        return "Booking cancelled"
    
    return book(date)
```

### URL Mode (Sensitive Operations)

Direct users to external URLs for OAuth, payments, or credential collection:

```python
@mcp.tool()
async def secure_payment(amount: float, ctx: Context) -> str:
    """Process payment requiring user confirmation."""
    
    payment_url = create_payment_session(amount)
    
    result = await ctx.elicit_url(
        message=f"Please complete payment of ${amount}",
        url=payment_url,
        timeout=300  # 5 minute timeout
    )
    
    if result.completed:
        return "Payment successful"
    return "Payment cancelled or timed out"
```

### Elicitation Result

```python
class ElicitationResult:
    action: Literal["accept", "cancel", "timeout"]
    data: Optional[BaseModel]  # For form mode
    completed: bool            # For URL mode
```

### Security Constraints

- Only primitive types in form schemas (string, number, boolean)
- Never request sensitive data (passwords, SSNs) via form elicitation
- Use URL mode for any sensitive operations


## OAuth 2.1 Authorization

**Specification**: 2025-03-26, enhanced 2025-06-18

MCP servers using HTTP transports are classified as OAuth Resource Servers with specific security requirements.

### Resource Indicators (RFC 8707)

Mandatory for MCP clients to prevent token mis-redemption:

```python
# Server declares itself as a protected resource
server_metadata = {
    "resource": "https://api.example.com/mcp",
    "authorization_servers": ["https://auth.example.com"]
}
```

### Token Handling

```python
from fastmcp import FastMCP
from fastmcp.auth import oauth_provider

# Configure OAuth provider
mcp = FastMCP(
    "Secure Server",
    auth=oauth_provider(
        issuer="https://auth.example.com",
        audience="https://api.example.com/mcp"
    )
)
```

### Supported OAuth Flows

| Flow | Use Case | Spec Reference |
|------|----------|----------------|
| Authorization Code + PKCE | Interactive user auth | OAuth 2.1 |
| Client Credentials | Machine-to-machine | SEP-1046 (2025-11-25) |
| Token Refresh | Long-lived sessions | RFC 6749 |

### Security Best Practices

1. Always validate tokens before processing requests
2. Use HTTPS for all HTTP transports
3. Validate Origin header to prevent DNS rebinding
4. Implement token introspection for enterprise deployments
5. Use short-lived tokens with refresh capability


## Transports

### Current Transport Options

| Transport | Use Case | Status |
|-----------|----------|--------|
| stdio | Local tools, CLI integration | Supported |
| Streamable HTTP | Remote servers, multi-client | Recommended |
| HTTP+SSE | Legacy remote servers | Deprecated (2025-03-26) |

### Streamable HTTP

The standard transport for remote MCP connections:

```python
# Python
mcp.run(transport="streamable-http", port=8000)
```

```typescript
// TypeScript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamable-http.js";

const transport = new StreamableHTTPServerTransport({ port: 8000 });
await server.connect(transport);
```

### Session Management

Streamable HTTP supports optional stateful sessions:

```
Client                           Server
  |                                |
  |------ Initialize ------------>|
  |<----- MCP-Session-Id: xyz ----|
  |                                |
  |------ Request --------------->|
  |       (MCP-Session-Id: xyz)   |
  |<----- Response ---------------|
```

### Protocol Version Header

```
MCP-Protocol-Version: 2025-11-25
```

Servers should check this header and respond appropriately for backwards compatibility.


## Extensions Framework

**Specification**: 2025-11-25

Extensions allow the MCP ecosystem to grow without bloating the core specification.

### Extension Discovery

```python
# Server declares supported extensions
server_capabilities = {
    "extensions": {
        "com.example.custom-feature": {
            "version": "1.0.0",
            "settings": {...}
        }
    }
}
```

### Authorization Extensions

Two authorization extensions ship with 2025-11-25:

1. **OAuth Client Credentials** (SEP-1046): Machine-to-machine authentication
2. **Enhanced Token Validation**: RFC 7662 introspection support


## Structured Tool Outputs

**Specification**: 2025-06-18

Tools can return structured, predictable data formats:

```python
from pydantic import BaseModel

class UserSearchResult(BaseModel):
    users: list[User]
    total: int
    has_more: bool

@mcp.tool(output_schema=UserSearchResult)
async def search_users(query: str) -> UserSearchResult:
    """Search users with structured output."""
    ...
```

Benefits:
- Clients can parse outputs programmatically
- Schema validation ensures consistency
- Better integration with downstream systems


## Sampling (Server-Side LLM Calls)

Servers can request LLM completions from the client:

```python
@mcp.tool()
async def summarize_document(doc_id: str, ctx: Context) -> str:
    """Summarize a document using the client's LLM."""
    
    content = await fetch_document(doc_id)
    
    result = await ctx.sample(
        messages=[
            {"role": "user", "content": f"Summarize this document:\n\n{content}"}
        ],
        max_tokens=500
    )
    
    return result.content.text
```

### Sampling with Tools (SEP-1577)

FastMCP 2.14+ supports passing tools to sampling calls for agentic workflows:

```python
@mcp.tool()
async def complex_analysis(query: str, ctx: Context) -> str:
    """Perform analysis using LLM with tool access."""
    
    result = await ctx.sample(
        messages=[{"role": "user", "content": query}],
        tools=[analyze_data, fetch_reference, calculate],
        max_iterations=5
    )
    
    return result.content.text
```


## MCP Registry

**Launched**: September 2025 (Preview)

The official catalog for publicly available MCP servers.

### Registry URL

```
https://registry.modelcontextprotocol.io
```

### Server Metadata Schema

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
  "name": "io.github.username/server-name",
  "description": "Server description",
  "version": "1.0.0",
  "packages": [
    {
      "registry_type": "npm",
      "identifier": "package-name",
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

### Namespace Rules

| Namespace | Authentication | URL Restrictions |
|-----------|----------------|------------------|
| `io.github.username/*` | GitHub OAuth | None |
| `com.company/*` | DNS/HTTP challenge | URLs on company domain |

### Publishing

```bash
# Install CLI
curl -sSL https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_darwin_arm64.tar.gz | tar xz

# Authenticate
mcp-publisher login github

# Create metadata
mcp-publisher init

# Publish
mcp-publisher publish
```

### Subregistries

Organizations can create custom subregistries that:
- Ingest from the official registry
- Add curation, ratings, security scanning
- Implement enterprise policies
- Support private/internal servers


## Tool Name Standardization

**Specification**: SEP-986 (2025-11-25)

Tool names now have a canonical format:

```
{service}_{action}_{resource}
```

Examples:
- `github_create_issue`
- `slack_send_message`
- `stripe_create_customer`

Benefits:
- Consistent display across clients
- Reliable sorting and referencing
- Better SDK codegen


## Well-Known URL Discovery

**Coming Soon**: Servers can advertise capabilities via `.well-known` URLs:

```
https://api.example.com/.well-known/mcp.json
```

This enables:
- Pre-connection capability discovery
- Registry auto-cataloging
- Client capability matching


## Migration Notes

### From HTTP+SSE to Streamable HTTP

1. Update transport configuration
2. Implement session handling (if stateful)
3. Add protocol version header handling
4. Test backwards compatibility

### Enabling Tasks

1. Upgrade FastMCP to 2.14+
2. Add `task=True` to long-running tools
3. Implement progress reporting
4. Configure task backend (optional)

### Adding Elicitation

1. Enable elicitation capability in server
2. Define Pydantic schemas for form inputs
3. Implement elicitation flows in tools
4. Handle all result states (accept/cancel/timeout)


---

*MCP 2025 Updates Reference v1.0 — January 2026*
*Covers specifications through 2025-11-25*
