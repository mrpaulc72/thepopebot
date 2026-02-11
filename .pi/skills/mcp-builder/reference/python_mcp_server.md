# Python MCP Server Implementation Guide

This reference provides Python-specific patterns and examples for implementing MCP servers using FastMCP (the standard Python MCP framework). It covers project setup, tool implementation, advanced features, and complete working examples.

---

## Framework Overview

### FastMCP

FastMCP is the standard framework for building Python MCP servers. It provides:

- Decorator-based tool, resource, and prompt registration
- Automatic schema generation from type hints and Pydantic models
- Built-in support for all MCP transports (stdio, Streamable HTTP)
- Context management for advanced features (elicitation, sampling, tasks)
- Server composition and proxying capabilities

**Installation**:
```bash
pip install fastmcp
# Or with extras
pip install fastmcp[anthropic,openai]
```

**Version Note**: This guide covers FastMCP 2.14+ which supports MCP specification 2025-11-25.

---

## Quick Start

### Minimal Server

```python
from fastmcp import FastMCP

mcp = FastMCP("my-service")

@mcp.tool()
def hello(name: str) -> str:
    """Say hello to someone."""
    return f"Hello, {name}!"

if __name__ == "__main__":
    mcp.run()
```

### Running the Server

```bash
# Stdio transport (default)
python server.py

# Streamable HTTP transport
python server.py --transport streamable-http --port 8000

# Or configure in code
mcp.run(transport="streamable-http", port=8000)
```

---

## Project Structure

```
{service}_mcp/
├── server.py              # Main FastMCP server entry point
├── tools/
│   ├── __init__.py
│   ├── users.py           # User-related tools
│   ├── projects.py        # Project-related tools
│   └── search.py          # Search tools
├── schemas/
│   ├── __init__.py
│   ├── users.py           # User Pydantic models
│   └── common.py          # Shared schemas (ResponseFormat, etc.)
├── utils/
│   ├── __init__.py
│   ├── api_client.py      # HTTP client wrapper
│   ├── formatting.py      # Response formatting utilities
│   └── pagination.py      # Pagination helpers
├── config.py              # Configuration and constants
├── requirements.txt
└── README.md
```

### Server Naming Convention

Python MCP servers use underscore format: `{service}_mcp`

Examples:
- `github_mcp`
- `slack_mcp`
- `stripe_mcp`
- `notion_mcp`

---

## Tool Implementation

### Basic Tool

```python
from fastmcp import FastMCP

mcp = FastMCP("example-service")

@mcp.tool()
def get_user(user_id: str) -> str:
    """Get user details by ID.
    
    Args:
        user_id: The unique identifier of the user (e.g., "U123456")
    
    Returns:
        User details in markdown format including name, email, and status
    """
    user = api.get_user(user_id)
    return f"**{user.name}** ({user_id})\n- Email: {user.email}\n- Status: {user.status}"
```

### Tool with Pydantic Validation

```python
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

class SearchUsersInput(BaseModel):
    """Input parameters for user search."""
    
    query: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Search string to match against names or emails"
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum results to return (1-100)"
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of results to skip for pagination"
    )
    format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' or 'json'"
    )
    include_inactive: bool = Field(
        default=False,
        description="Whether to include deactivated users"
    )
    
    model_config = {"extra": "forbid"}

@mcp.tool()
def search_users(params: SearchUsersInput) -> str:
    """Search for users in the system.
    
    Searches across all user profiles by name, email, or department.
    Supports pagination for large result sets.
    
    Args:
        params: Search parameters including query, limit, offset, and format
    
    Returns:
        For markdown: Formatted list of matching users
        For JSON: Structured data with users array and pagination info
    
    Examples:
        - Find by name: params={"query": "john smith"}
        - Find by email: params={"query": "@example.com"}
        - With pagination: params={"query": "eng", "limit": 10, "offset": 20}
    
    Use when you need to find users without knowing their exact ID.
    Don't use when you already have the user ID (use get_user instead).
    """
    users = api.search_users(
        query=params.query,
        limit=params.limit,
        offset=params.offset,
        include_inactive=params.include_inactive
    )
    
    return format_response(users, params.format)
```

### Tool Annotations

```python
from fastmcp import FastMCP
from fastmcp.tools import ToolAnnotations

mcp = FastMCP("example-service")

@mcp.tool(
    annotations=ToolAnnotations(
        title="Search Users",
        read_only_hint=True,      # Does not modify data
        destructive_hint=False,   # No destructive operations
        idempotent_hint=True,     # Same params = same result
        open_world_hint=True      # Interacts with external API
    )
)
def search_users(query: str) -> str:
    """Search for users."""
    ...
```

### Annotation Reference

| Annotation | Type | Default | Description |
|------------|------|---------|-------------|
| `title` | str | None | Human-readable tool title |
| `read_only_hint` | bool | False | Tool does not modify environment |
| `destructive_hint` | bool | True | Tool may perform destructive updates |
| `idempotent_hint` | bool | False | Repeated calls have same effect |
| `open_world_hint` | bool | True | Interacts with external systems |

---

## Advanced Features

### Context Access

The `Context` object provides access to advanced MCP features:

```python
from fastmcp import FastMCP, Context

mcp = FastMCP("example-service")

@mcp.tool()
async def advanced_tool(query: str, ctx: Context) -> str:
    """Tool with context access."""
    
    # Access request metadata
    client_info = ctx.client_info
    
    # Log messages (visible to client)
    await ctx.info(f"Processing query: {query}")
    
    # Report progress
    await ctx.report_progress(0.5, "Halfway done...")
    
    return result
```

### Elicitation (User Input)

Request additional information from users during tool execution:

```python
from pydantic import BaseModel, Field
from fastmcp import FastMCP, Context

mcp = FastMCP("booking-service")

class AlternativeDateInput(BaseModel):
    """Schema for alternative date selection."""
    try_alternative: bool = Field(description="Try another date?")
    alternative_date: str = Field(
        default="",
        description="Alternative date in YYYY-MM-DD format"
    )

@mcp.tool()
async def book_appointment(
    date: str,
    time: str,
    service: str,
    ctx: Context
) -> str:
    """Book an appointment with availability checking.
    
    If the requested slot is unavailable, will ask user for
    an alternative date preference.
    """
    
    # Check availability
    if not is_available(date, time):
        # Request user input via elicitation
        result = await ctx.elicit(
            message=f"No availability on {date} at {time}. Would you like to try another date?",
            schema=AlternativeDateInput
        )
        
        if result.action == "cancel":
            return "Booking cancelled by user."
        
        if result.action == "accept" and result.data:
            if result.data.try_alternative and result.data.alternative_date:
                date = result.data.alternative_date
                if not is_available(date, time):
                    return f"Sorry, {date} at {time} is also unavailable."
            else:
                return "Booking cancelled - no alternative date provided."
    
    # Create booking
    booking = create_booking(date, time, service)
    return f"✅ Appointment booked for {date} at {time}\nConfirmation: {booking.id}"
```

### URL Elicitation (Sensitive Operations)

For OAuth flows, payments, or credential collection:

```python
@mcp.tool()
async def connect_oauth_service(service: str, ctx: Context) -> str:
    """Connect to an external service via OAuth."""
    
    # Generate OAuth URL
    auth_url = generate_oauth_url(service)
    
    # Direct user to OAuth flow
    result = await ctx.elicit_url(
        message=f"Please authorize access to {service}",
        url=auth_url,
        timeout=300  # 5 minute timeout
    )
    
    if result.completed:
        # OAuth callback was received
        token = get_oauth_token_from_callback()
        return f"✅ Successfully connected to {service}"
    else:
        return "❌ Authorization cancelled or timed out"
```

### Background Tasks

For long-running operations:

```python
from fastmcp import FastMCP
from fastmcp.dependencies import Progress

mcp = FastMCP("data-service")

@mcp.tool(task=True)
async def process_large_dataset(
    dataset_id: str,
    progress: Progress
) -> str:
    """Process a large dataset with progress tracking.
    
    This is a long-running operation. The client will receive
    a task ID immediately and can poll for progress.
    """
    
    dataset = load_dataset(dataset_id)
    total_rows = len(dataset)
    
    results = []
    for i, row in enumerate(dataset):
        # Report progress
        await progress.report(
            (i + 1) / total_rows,
            f"Processing row {i + 1} of {total_rows}"
        )
        
        result = process_row(row)
        results.append(result)
    
    summary = generate_summary(results)
    return f"✅ Processed {total_rows} rows\n\n{summary}"
```

### Sampling (Server-Side LLM Calls)

Request LLM completions from the client:

```python
from fastmcp import FastMCP, Context

mcp = FastMCP("analysis-service")

@mcp.tool()
async def analyze_and_summarize(
    document_id: str,
    ctx: Context
) -> str:
    """Analyze a document and provide AI-generated summary."""
    
    # Fetch document content
    document = fetch_document(document_id)
    
    # Request LLM completion from client
    result = await ctx.sample(
        messages=[
            {
                "role": "user",
                "content": f"Please analyze and summarize this document:\n\n{document.content}"
            }
        ],
        max_tokens=500,
        system="You are a document analyst. Provide concise, actionable summaries."
    )
    
    return f"# Analysis of {document.title}\n\n{result.content.text}"
```

### Sampling with Tools (Agentic Workflows)

FastMCP 2.14+ supports passing tools to sampling calls:

```python
@mcp.tool()
async def research_topic(topic: str, ctx: Context) -> str:
    """Research a topic using multiple data sources."""
    
    # Define tools the LLM can use during research
    async def search_web(query: str) -> str:
        return await web_search(query)
    
    async def search_database(query: str) -> str:
        return await db_search(query)
    
    # Let the LLM orchestrate the research
    result = await ctx.sample(
        messages=[
            {"role": "user", "content": f"Research this topic thoroughly: {topic}"}
        ],
        tools=[search_web, search_database],
        max_iterations=5  # Maximum tool call rounds
    )
    
    return result.content.text
```

---

## Resources

### Basic Resource

```python
@mcp.resource("config://settings/{key}")
async def get_setting(key: str) -> str:
    """Get a configuration setting by key."""
    value = settings.get(key)
    if value is None:
        raise ValueError(f"Setting '{key}' not found")
    return json.dumps(value)
```

### Resource with Metadata

```python
from fastmcp.resources import ResourceMetadata

@mcp.resource(
    "docs://readme",
    metadata=ResourceMetadata(
        name="README",
        description="Project documentation",
        mime_type="text/markdown"
    )
)
async def get_readme() -> str:
    """Get the project README."""
    with open("README.md") as f:
        return f.read()
```

### Dynamic Resource List

```python
@mcp.resource_list()
async def list_documents() -> list[dict]:
    """List available documents."""
    documents = await fetch_documents()
    return [
        {
            "uri": f"docs://{doc.id}",
            "name": doc.title,
            "description": doc.summary,
            "mimeType": "text/markdown"
        }
        for doc in documents
    ]
```

---

## Prompts

### Basic Prompt

```python
@mcp.prompt()
def code_review_prompt(language: str, code: str) -> str:
    """Generate a code review prompt."""
    return f"""Please review this {language} code for:
- Bugs and potential issues
- Performance improvements
- Code style and best practices

```{language}
{code}
```

Provide specific, actionable feedback."""
```

### Prompt with Messages

```python
from fastmcp.prompts import Message

@mcp.prompt()
def analysis_prompt(topic: str) -> list[Message]:
    """Generate an analysis prompt with system context."""
    return [
        Message(
            role="system",
            content="You are an expert analyst. Provide thorough, evidence-based analysis."
        ),
        Message(
            role="user",
            content=f"Please analyze: {topic}"
        )
    ]
```

---

## Server Composition

### Mounting Servers

```python
from fastmcp import FastMCP

# Main server
main = FastMCP("main-service")

# Sub-servers
users_server = FastMCP("users")
projects_server = FastMCP("projects")

# Mount with prefixes
main.mount("/users", users_server)
main.mount("/projects", projects_server)

# Tools become: users_get_user, projects_create_project, etc.
```

### Importing Servers

```python
# Static import (copies components)
main.import_server(users_server, prefix="users")

# Dynamic mount (live-links)
main.mount("/users", users_server)
```

### Proxying Remote Servers

```python
from fastmcp import FastMCP
from fastmcp.client import Client

main = FastMCP("aggregator")

# Proxy a remote MCP server
async def setup():
    remote_client = await Client.connect("https://api.example.com/mcp")
    main.mount("/remote", remote_client.as_server())
```

---

## Transport Configuration

### Stdio (Default)

```python
if __name__ == "__main__":
    mcp.run()  # Default stdio
```

### Streamable HTTP

```python
if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=8000
    )
```

### With Authentication

```python
from fastmcp import FastMCP
from fastmcp.auth import oauth_provider

mcp = FastMCP(
    "secure-service",
    auth=oauth_provider(
        issuer="https://auth.example.com",
        audience="https://api.example.com/mcp"
    )
)
```

---

## Error Handling

### Custom Exceptions

```python
class MCPError(Exception):
    """Base MCP error."""
    def __init__(self, error_type: str, message: str, suggestion: str = None):
        self.error_type = error_type
        self.message = message
        self.suggestion = suggestion
        super().__init__(message)

class ValidationError(MCPError):
    """Input validation error."""
    pass

class NotFoundError(MCPError):
    """Resource not found error."""
    pass

class RateLimitError(MCPError):
    """Rate limit exceeded error."""
    pass
```

### Error Formatting

```python
def format_error(error: MCPError) -> str:
    """Format error for agent consumption."""
    lines = [
        f"**Error**: {error.error_type}",
        "",
        error.message
    ]
    
    if error.suggestion:
        lines.extend(["", f"**Suggestion**: {error.suggestion}"])
    
    return "\n".join(lines)

@mcp.tool()
async def get_user(user_id: str) -> str:
    """Get user by ID."""
    try:
        user = await api.get_user(user_id)
        return format_user(user)
    except NotFoundError as e:
        return format_error(e)
    except RateLimitError as e:
        return format_error(e)
    except Exception as e:
        return format_error(MCPError(
            "UnexpectedError",
            str(e),
            "Please try again or contact support"
        ))
```

---

## Complete Example

```python
"""
Example MCP Server for a User Management Service

This server provides tools for searching and managing users
in an external system.
"""

import json
import os
from enum import Enum
from typing import Optional

import httpx
from pydantic import BaseModel, Field
from fastmcp import FastMCP, Context
from fastmcp.tools import ToolAnnotations

# Configuration
API_BASE_URL = os.environ.get("API_URL", "https://api.example.com")
API_KEY = os.environ.get("API_KEY")
CHARACTER_LIMIT = 25000

# Schemas
class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

class SearchUsersInput(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    format: ResponseFormat = Field(default=ResponseFormat.MARKDOWN)
    
    model_config = {"extra": "forbid"}

class CreateUserInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    department: Optional[str] = Field(default=None, max_length=50)
    
    model_config = {"extra": "forbid"}

# API Client
class APIClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=API_BASE_URL,
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=30.0
        )
    
    async def search_users(self, query: str, limit: int, offset: int) -> dict:
        response = await self.client.get(
            "/users/search",
            params={"q": query, "limit": limit, "offset": offset}
        )
        response.raise_for_status()
        return response.json()
    
    async def get_user(self, user_id: str) -> dict:
        response = await self.client.get(f"/users/{user_id}")
        response.raise_for_status()
        return response.json()
    
    async def create_user(self, data: dict) -> dict:
        response = await self.client.post("/users", json=data)
        response.raise_for_status()
        return response.json()

api = APIClient()

# Formatting Utilities
def format_users_markdown(users: list, total: int, offset: int) -> str:
    if not users:
        return "No users found matching your search."
    
    lines = [
        "# User Search Results",
        "",
        f"Found {total} users (showing {len(users)} starting at {offset})",
        ""
    ]
    
    for user in users:
        lines.extend([
            f"## {user['name']} ({user['id']})",
            f"- **Email**: {user['email']}",
            f"- **Department**: {user.get('department', 'N/A')}",
            ""
        ])
    
    if total > offset + len(users):
        lines.append(f"*Use offset={offset + len(users)} to see more results*")
    
    return "\n".join(lines)

def format_users_json(users: list, total: int, offset: int) -> str:
    response = {
        "total": total,
        "count": len(users),
        "offset": offset,
        "has_more": total > offset + len(users),
        "users": users
    }
    if response["has_more"]:
        response["next_offset"] = offset + len(users)
    return json.dumps(response, indent=2)

# Server
mcp = FastMCP("user-service")

@mcp.tool(
    annotations=ToolAnnotations(
        title="Search Users",
        read_only_hint=True,
        idempotent_hint=True
    )
)
async def user_search(params: SearchUsersInput) -> str:
    """Search for users by name, email, or department.
    
    Args:
        params: Search parameters
            - query: Search string (min 2 chars)
            - limit: Max results (1-100, default 20)
            - offset: Skip results for pagination
            - format: 'markdown' or 'json'
    
    Returns:
        Matching users with name, email, and department.
        Use offset parameter to paginate through results.
    
    Examples:
        - Find by name: {"query": "john doe"}
        - Find by department: {"query": "engineering"}
        - Paginate: {"query": "smith", "offset": 20}
    """
    try:
        data = await api.search_users(
            params.query,
            params.limit,
            params.offset
        )
        
        users = data.get("users", [])
        total = data.get("total", 0)
        
        if params.format == ResponseFormat.MARKDOWN:
            result = format_users_markdown(users, total, params.offset)
        else:
            result = format_users_json(users, total, params.offset)
        
        # Truncate if needed
        if len(result) > CHARACTER_LIMIT:
            result = result[:CHARACTER_LIMIT - 100]
            result += "\n\n**Truncated** - use filters or smaller limit"
        
        return result
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            return "**Error**: Rate limit exceeded\n\nPlease wait before retrying."
        return f"**Error**: API error ({e.response.status_code})"
    except Exception as e:
        return f"**Error**: {str(e)}"

@mcp.tool(
    annotations=ToolAnnotations(
        title="Get User",
        read_only_hint=True,
        idempotent_hint=True
    )
)
async def user_get(user_id: str) -> str:
    """Get detailed information about a specific user.
    
    Args:
        user_id: The user's unique identifier (e.g., "U123456")
    
    Returns:
        User details including name, email, department, and status.
    
    Use this when you have a user ID from search results.
    """
    try:
        user = await api.get_user(user_id)
        
        return "\n".join([
            f"# {user['name']}",
            "",
            f"- **ID**: {user['id']}",
            f"- **Email**: {user['email']}",
            f"- **Department**: {user.get('department', 'N/A')}",
            f"- **Status**: {user.get('status', 'active')}",
            f"- **Created**: {user.get('created_at', 'Unknown')}"
        ])
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return f"**Error**: User '{user_id}' not found\n\nUse user_search to find valid user IDs."
        return f"**Error**: API error ({e.response.status_code})"

@mcp.tool(
    annotations=ToolAnnotations(
        title="Create User",
        read_only_hint=False,
        destructive_hint=False,
        idempotent_hint=False
    )
)
async def user_create(params: CreateUserInput, ctx: Context) -> str:
    """Create a new user in the system.
    
    Args:
        params: User data
            - name: Full name (required)
            - email: Email address (required, must be valid format)
            - department: Department name (optional)
    
    Returns:
        Confirmation with the new user's ID.
    
    Note: This creates a real user. Use with caution.
    """
    try:
        # Log the operation
        await ctx.info(f"Creating user: {params.name}")
        
        user = await api.create_user(params.model_dump(exclude_none=True))
        
        return "\n".join([
            "✅ **User Created Successfully**",
            "",
            f"- **ID**: {user['id']}",
            f"- **Name**: {user['name']}",
            f"- **Email**: {user['email']}"
        ])
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 409:
            return f"**Error**: User with email '{params.email}' already exists"
        return f"**Error**: Failed to create user ({e.response.status_code})"

# Entry point
if __name__ == "__main__":
    if not API_KEY:
        print("ERROR: API_KEY environment variable required")
        exit(1)
    
    mcp.run()
```

---

## Testing

### Unit Tests

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_search_users_success():
    mock_data = {
        "users": [{"id": "U1", "name": "John", "email": "john@test.com"}],
        "total": 1
    }
    
    with patch.object(api, 'search_users', new_callable=AsyncMock) as mock:
        mock.return_value = mock_data
        
        from schemas import SearchUsersInput
        params = SearchUsersInput(query="john")
        result = await user_search(params)
        
        assert "John" in result
        mock.assert_called_once()

@pytest.mark.asyncio
async def test_search_users_empty():
    with patch.object(api, 'search_users', new_callable=AsyncMock) as mock:
        mock.return_value = {"users": [], "total": 0}
        
        from schemas import SearchUsersInput
        params = SearchUsersInput(query="nonexistent")
        result = await user_search(params)
        
        assert "No users found" in result
```

### Testing with MCP Inspector

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run server
python server.py &

# Connect inspector (for HTTP transport)
mcp-inspector http://localhost:8000/mcp
```

---

## Quality Checklist

### Implementation
- [ ] All tools use Pydantic models for input validation
- [ ] Tool annotations set correctly (read_only_hint, etc.)
- [ ] Comprehensive docstrings with Args, Returns, Examples
- [ ] Error handling with actionable messages
- [ ] Response formatting (markdown and JSON options)

### Code Quality
- [ ] Type hints on all functions
- [ ] No code duplication (shared utilities)
- [ ] Constants defined (CHARACTER_LIMIT, etc.)
- [ ] Environment variables for configuration

### Testing
- [ ] Unit tests for all tools
- [ ] Error case coverage
- [ ] Validation tests

### Documentation
- [ ] README with setup instructions
- [ ] Environment variable documentation
- [ ] Example usage

---

*Python MCP Server Reference v2.0 — January 2026*
*Covers FastMCP 2.14+ and MCP 2025-11-25*
