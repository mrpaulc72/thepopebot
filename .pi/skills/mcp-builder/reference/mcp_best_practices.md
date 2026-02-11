# MCP Best Practices Reference

This reference provides universal guidelines for building high-quality MCP servers regardless of implementation language. These practices focus on tool design, naming conventions, response formatting, error handling, and patterns that enable LLMs to effectively accomplish tasks.

---

## Core Design Philosophy

### Agent-First Design

MCP servers exist to enable LLM agents to accomplish real-world tasks. Every design decision should be evaluated against this question: **"Does this help an agent succeed?"**

**Key Principles**:

1. **Workflows over Endpoints**: Don't just wrap API endpoints—build tools that enable complete workflows
2. **Context Efficiency**: Agents have limited context windows; make every token count
3. **Actionable Errors**: Error messages should guide agents toward correct usage
4. **Natural Task Boundaries**: Tool boundaries should match how humans think about tasks
5. **Evaluation-Driven**: Let real agent performance guide tool improvements


### Quality Metrics

| Metric | Description |
|--------|-------------|
| Task Completion Rate | Can agents complete realistic tasks using your tools? |
| Context Efficiency | How much context budget do responses consume? |
| Error Recovery Rate | Can agents recover from errors using your error messages? |
| Tool Discoverability | Can agents find the right tool for their task? |
| Response Utility | Do responses contain the information agents need? |

---

## Tool Design

### Tool Granularity

**Too Granular** (Anti-pattern):
```
get_user_id()
get_user_name()
get_user_email()
get_user_department()
```

**Too Coarse** (Anti-pattern):
```
do_everything(action: str, params: dict)
```

**Just Right**:
```
get_user(user_id: str, fields: list[str] = None)
search_users(query: str, filters: dict = None)
update_user(user_id: str, updates: dict)
```

### Tool Selection Guidelines

**Include a tool when**:
- It enables a common, valuable workflow
- Multiple related operations can be consolidated
- It fills a gap that would require multiple tools otherwise
- Agent testing shows it's frequently needed

**Exclude a tool when**:
- It duplicates functionality of another tool
- It's rarely needed in realistic scenarios
- It adds complexity without clear value
- It can be composed from existing tools

### Workflow-Oriented Tools

Instead of exposing every API endpoint, design tools around complete workflows:

**API-Centric** (Less Effective):
```
check_calendar_availability(date, time)
create_calendar_event(title, date, time, attendees)
send_event_invitations(event_id)
```

**Workflow-Centric** (More Effective):
```
schedule_meeting(
    title: str,
    preferred_times: list[str],
    attendees: list[str],
    duration_minutes: int = 60
) -> Meeting
# Automatically checks availability, finds best slot, creates event, sends invites
```

---

## Naming Conventions

### Tool Names

**Format**: `{service}_{action}_{resource}` (snake_case)

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `{service}_{verb}_{noun}` | `github_create_issue` | Standard CRUD operations |
| `{service}_{verb}_{noun}_{qualifier}` | `slack_send_message_dm` | Specialized variants |
| `{service}_{compound_action}` | `jira_transition_issue` | Complex operations |

**Good Examples**:
- `github_create_issue`
- `slack_search_messages`
- `stripe_create_customer`
- `asana_list_tasks`

**Avoid**:
- `create_issue` (ambiguous without service context)
- `githubCreateIssue` (wrong case)
- `github-create-issue` (wrong separator)
- `do_github_stuff` (vague)

### Service Prefixes

Always include service prefixes to prevent naming collisions when multiple MCP servers are used together:

```python
# Good - clear service context
@mcp.tool()
def slack_send_message(channel: str, text: str): ...

@mcp.tool()
def teams_send_message(channel: str, text: str): ...

# Bad - will collide
@mcp.tool()
def send_message(channel: str, text: str): ...
```

### Parameter Names

Use clear, descriptive parameter names:

| Avoid | Prefer | Reason |
|-------|--------|--------|
| `q` | `query` | Clarity |
| `n` | `limit` or `count` | Descriptive |
| `id` | `user_id`, `project_id` | Specific |
| `data` | `user_data`, `config` | Typed |
| `opts` | `options` or specific fields | Explicit |

---

## Tool Documentation

### Documentation Template

Every tool must have comprehensive documentation:

```python
@mcp.tool()
def example_search_users(
    query: str,
    limit: int = 20,
    include_inactive: bool = False
) -> str:
    """Search for users in the Example system.
    
    Searches across all user profiles by name, email, or department.
    Returns matching users with their basic profile information.
    
    Args:
        query: Search string to match against names, emails, or departments.
               Supports partial matching. Minimum 2 characters.
        limit: Maximum number of results to return (1-100, default: 20)
        include_inactive: Whether to include deactivated users (default: False)
    
    Returns:
        Markdown-formatted list of matching users with:
        - Name and user ID
        - Email address
        - Department
        - Status (active/inactive)
        
        Returns "No users found matching '{query}'" if no matches.
    
    Examples:
        - Find marketing team: query="department:marketing"
        - Find user by name: query="john smith"
        - Find by email domain: query="@example.com"
    
    Use this tool when:
        - You need to find a user's ID for other operations
        - You need to look up user contact information
        - You need to verify a user exists
    
    Don't use this tool when:
        - You already have the user ID (use example_get_user instead)
        - You need to create a new user (use example_create_user instead)
    
    Error Handling:
        - Returns error message if query is less than 2 characters
        - Returns error message if limit is out of range
        - Returns "Rate limit exceeded" if too many requests (wait and retry)
    """
```

### Documentation Requirements

| Section | Required | Purpose |
|---------|----------|---------|
| One-line summary | Yes | Quick understanding |
| Detailed description | Yes | Full context |
| Args with types | Yes | Parameter documentation |
| Returns | Yes | Output format and schema |
| Examples | Yes | Usage patterns |
| Use/Don't use | Recommended | Tool selection guidance |
| Error Handling | Recommended | Recovery guidance |

---

## Input Validation

### Schema Design

Use strict validation schemas with clear constraints:

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"

class SearchParams(BaseModel):
    """Parameters for user search."""
    
    query: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Search string (2-200 characters)"
    )
    
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum results (1-100)"
    )
    
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of results to skip"
    )
    
    format: ResponseFormat = Field(
        default=ResponseFormat.MARKDOWN,
        description="Output format: 'markdown' or 'json'"
    )
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Query cannot be empty or whitespace only")
        return v.strip()
    
    model_config = {"extra": "forbid"}  # Reject unknown fields
```

### Validation Best Practices

1. **Fail Fast**: Validate inputs before making API calls
2. **Clear Messages**: Validation errors should explain what's wrong and how to fix it
3. **Sensible Defaults**: Provide defaults for optional parameters
4. **Strict Mode**: Reject unknown fields to catch typos
5. **Type Safety**: Use enums for constrained values

---

## Response Formatting

### Dual-Format Responses

Support both human-readable and machine-readable formats:

```python
def format_users_response(
    users: list[dict],
    total: int,
    offset: int,
    format: ResponseFormat
) -> str:
    """Format user search results."""
    
    if format == ResponseFormat.MARKDOWN:
        return format_users_markdown(users, total, offset)
    else:
        return format_users_json(users, total, offset)

def format_users_markdown(users: list[dict], total: int, offset: int) -> str:
    """Human-readable markdown format."""
    lines = [
        f"# User Search Results",
        f"",
        f"Found {total} users (showing {len(users)} starting at {offset})",
        f""
    ]
    
    for user in users:
        lines.extend([
            f"## {user['name']} ({user['id']})",
            f"- **Email**: {user['email']}",
            f"- **Department**: {user.get('department', 'N/A')}",
            f"- **Status**: {'Active' if user.get('active', True) else 'Inactive'}",
            f""
        ])
    
    if total > offset + len(users):
        lines.append(f"*Use offset={offset + len(users)} to see more results*")
    
    return "\n".join(lines)

def format_users_json(users: list[dict], total: int, offset: int) -> str:
    """Machine-readable JSON format."""
    response = {
        "total": total,
        "count": len(users),
        "offset": offset,
        "has_more": total > offset + len(users),
        "users": [
            {
                "id": u["id"],
                "name": u["name"],
                "email": u["email"],
                "department": u.get("department"),
                "active": u.get("active", True)
            }
            for u in users
        ]
    }
    
    if response["has_more"]:
        response["next_offset"] = offset + len(users)
    
    return json.dumps(response, indent=2)
```

### Response Guidelines

| Guideline | Markdown | JSON |
|-----------|----------|------|
| Primary Use | Human reading, reports | Programmatic processing |
| Structure | Headers, lists, emphasis | Consistent schema |
| IDs | Show with names: `John (U123)` | Include as fields |
| Timestamps | Human-readable: `Jan 15, 2025` | ISO 8601: `2025-01-15T10:30:00Z` |
| Pagination | Natural language hint | Explicit `has_more`, `next_offset` |

### Character Limits

Implement truncation to respect context budgets:

```python
CHARACTER_LIMIT = 25000

def safe_response(content: str, format: ResponseFormat) -> str:
    """Ensure response doesn't exceed character limit."""
    
    if len(content) <= CHARACTER_LIMIT:
        return content
    
    truncated = content[:CHARACTER_LIMIT - 500]  # Leave room for message
    
    if format == ResponseFormat.MARKDOWN:
        return (
            truncated + 
            "\n\n---\n" +
            "**Response truncated.** Use filters or pagination to reduce results."
        )
    else:
        return json.dumps({
            "truncated": True,
            "partial_content": truncated,
            "message": "Response truncated. Use filters or pagination."
        })
```

---

## Pagination

### Pagination Patterns

**Offset-based** (simple, most common):
```python
def list_items(limit: int = 20, offset: int = 0) -> dict:
    items = fetch_items(limit=limit, offset=offset)
    total = get_total_count()
    
    return {
        "total": total,
        "count": len(items),
        "offset": offset,
        "items": items,
        "has_more": offset + len(items) < total,
        "next_offset": offset + len(items) if offset + len(items) < total else None
    }
```

**Cursor-based** (for large/dynamic datasets):
```python
def list_items(limit: int = 20, cursor: str = None) -> dict:
    items, next_cursor = fetch_items_with_cursor(limit=limit, cursor=cursor)
    
    return {
        "count": len(items),
        "items": items,
        "has_more": next_cursor is not None,
        "next_cursor": next_cursor
    }
```

### Pagination Best Practices

1. **Sensible Defaults**: Default limit of 20-50 items
2. **Maximum Limits**: Cap at 100 to prevent memory issues
3. **Clear Indicators**: Always include `has_more` flag
4. **Next Page Hint**: Provide `next_offset` or `next_cursor`
5. **Total Count**: Include when efficient to compute

---

## Error Handling

### Error Response Format

```python
def format_error(
    error_type: str,
    message: str,
    suggestion: str = None,
    details: dict = None
) -> str:
    """Format error for agent consumption."""
    
    lines = [f"**Error**: {error_type}", f"", message]
    
    if suggestion:
        lines.extend([f"", f"**Suggestion**: {suggestion}"])
    
    if details:
        lines.extend([f"", f"**Details**:"])
        for key, value in details.items():
            lines.append(f"- {key}: {value}")
    
    return "\n".join(lines)
```

### Error Categories

| Category | HTTP Status | Agent Action |
|----------|-------------|--------------|
| Validation Error | 400 | Fix parameters and retry |
| Authentication Error | 401 | Check credentials |
| Permission Error | 403 | Use different approach |
| Not Found | 404 | Verify resource exists |
| Rate Limit | 429 | Wait and retry |
| Server Error | 5xx | Retry with backoff |

### Actionable Error Messages

**Bad** (not actionable):
```
Error: Invalid request
```

**Good** (actionable):
```
**Error**: Invalid query parameter

The search query must be at least 2 characters long.
You provided: "a" (1 character)

**Suggestion**: Use a longer search term, e.g., query="john" or query="marketing team"
```

---

## API Client Patterns

### Centralized HTTP Client

```python
import httpx
from typing import Any, Optional

class APIClient:
    """Centralized API client with error handling."""
    
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=30.0
        )
    
    async def request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict] = None,
        json_data: Optional[dict] = None
    ) -> dict[str, Any]:
        """Make API request with error handling."""
        
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            response = await self.client.request(
                method=method,
                url=url,
                params=params,
                json=json_data
            )
            response.raise_for_status()
            return response.json()
            
        except httpx.HTTPStatusError as e:
            return self._handle_http_error(e)
        except httpx.RequestError as e:
            return self._handle_request_error(e)
    
    def _handle_http_error(self, error: httpx.HTTPStatusError) -> dict:
        """Convert HTTP errors to agent-friendly format."""
        status = error.response.status_code
        
        error_map = {
            401: ("AuthenticationError", "Invalid or expired API credentials"),
            403: ("PermissionError", "Insufficient permissions for this operation"),
            404: ("NotFoundError", "Requested resource not found"),
            429: ("RateLimitError", f"Rate limit exceeded. Retry after {error.response.headers.get('Retry-After', '60')} seconds"),
        }
        
        if status in error_map:
            error_type, message = error_map[status]
            raise MCPError(error_type, message)
        elif status >= 500:
            raise MCPError("ServerError", f"Server error ({status}). Please retry")
        else:
            raise MCPError("APIError", f"API error: {status}")
```

### Retry Logic

```python
import asyncio
from functools import wraps

def with_retry(max_attempts: int = 3, backoff_factor: float = 2.0):
    """Decorator for automatic retry with exponential backoff."""
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except (RateLimitError, ServerError) as e:
                    last_error = e
                    if attempt < max_attempts - 1:
                        wait_time = backoff_factor ** attempt
                        await asyncio.sleep(wait_time)
                except (AuthenticationError, PermissionError, NotFoundError):
                    raise  # Don't retry these
            
            raise last_error
        return wrapper
    return decorator
```

---

## Security Considerations

### Input Sanitization

```python
import re

def sanitize_query(query: str) -> str:
    """Sanitize user input for API queries."""
    sanitized = re.sub(r'[<>"\';]', '', query)
    sanitized = sanitized[:500]
    sanitized = sanitized.strip()
    return sanitized
```

### Credential Handling

1. **Never log credentials**: Exclude from all logging
2. **Environment variables**: Load credentials from environment
3. **Secure storage**: Use system keychain when available
4. **Token refresh**: Implement automatic refresh for OAuth tokens
5. **Minimal scope**: Request only necessary permissions

---

## Quality Checklist

Before finalizing any MCP server, verify:

### Tool Design
- [ ] Tools enable complete workflows, not just API wrappers
- [ ] Tool names follow `{service}_{action}_{resource}` pattern
- [ ] No naming conflicts with other potential MCP servers
- [ ] Reasonable number of tools (5-20 for most services)

### Documentation
- [ ] Every tool has comprehensive docstring
- [ ] Args documented with types and constraints
- [ ] Return format documented with examples
- [ ] "Use when" / "Don't use when" guidance provided

### Input/Output
- [ ] Strict input validation with clear error messages
- [ ] Both markdown and JSON response formats supported
- [ ] Pagination implemented for list operations
- [ ] Character limits enforced with truncation notices

### Error Handling
- [ ] All API errors caught and formatted
- [ ] Error messages are actionable
- [ ] Retry logic for transient failures
- [ ] Rate limit handling implemented

### Security
- [ ] Credentials loaded from environment
- [ ] Input sanitization in place
- [ ] Sensitive data not logged
- [ ] Minimal permission scope

---

*MCP Best Practices Reference v2.0 — January 2026*
