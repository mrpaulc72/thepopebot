# MCP Server Evaluation Guide

This reference provides guidelines for creating evaluation test suites that measure how effectively LLMs can use your MCP server to accomplish real-world tasks.

---

## Evaluation Philosophy

### Why Evaluations Matter

Evaluations are the ultimate quality measure for MCP servers. They test not just whether your tools work, but whether they enable agents to succeed at realistic tasks.

**Traditional Testing** (necessary but insufficient):
- Does the function execute without errors?
- Does it return the correct data type?
- Does validation work?

**MCP Evaluation** (measures true quality):
- Can an agent find the right tool for a given task?
- Can an agent use the tool correctly based on its documentation?
- Can an agent interpret results and take appropriate next steps?
- Can an agent recover from errors using error messages?
- Can an agent complete multi-step workflows?

### The Evaluation Mindset

Think of evaluations as simulating a real user asking an agent for help:

> "Hey, I need to find out who's responsible for the mobile app project and get their contact info. Can you help?"

A good MCP server enables an agent to:
1. Identify this as a search + lookup task
2. Search for the project
3. Find the responsible person
4. Look up their contact information
5. Present a clear, useful answer

---

## Evaluation Requirements

### Question Characteristics

Each evaluation question must be:

| Requirement | Description | Example |
|-------------|-------------|---------|
| **Independent** | Not dependent on other questions | ✓ "Who owns Project X?" ✗ "Now find their email" |
| **Read-Only** | Only requires non-destructive operations | ✓ Search, list, get ✗ Create, update, delete |
| **Complex** | Requires multiple tool calls and reasoning | ✓ Multi-step research ✗ Single lookup |
| **Realistic** | Based on actual use cases | ✓ "Find the budget owner" ✗ "List all users" |
| **Verifiable** | Single, clear answer | ✓ "john.doe@example.com" ✗ "Various people" |
| **Stable** | Answer won't change over time | ✓ Historical data ✗ "Current status" |

### Complexity Guidelines

Questions should require **2-5 tool calls** to answer:

**Too Simple** (1 call):
```
Q: What is the email for user U123456?
A: john@example.com
```
This just tests basic tool execution, not agent capability.

**Appropriate Complexity** (3-4 calls):
```
Q: Who is the primary contact for the Q3 Marketing Campaign project, 
   and what department are they in?
A: Sarah Chen, Marketing Department
```
Requires: search projects → get project details → get user details

**Potentially Too Complex** (5+ calls):
Questions requiring excessive calls may be unreliable due to error accumulation.

---

## Creating Evaluation Questions

### Step 1: Identify Realistic Use Cases

Start with actual questions users might ask:

**User Management Service:**
- "Who's the most senior engineer on the Platform team?"
- "Find the email for whoever manages the API integration project"
- "What projects is the Design department working on?"

**Project Management Service:**
- "Which project has the closest deadline and who owns it?"
- "Find all high-priority bugs assigned to the mobile team"
- "Who approved the budget for Project Phoenix?"

**Communication Service:**
- "Find the channel where the product launch was announced"
- "Who sent the most messages in #engineering last month?"
- "What topics were discussed in the Q3 planning meeting?"

### Step 2: Verify Answer Stability

Before finalizing a question, ensure the answer won't change:

**Unstable** (avoid):
- "How many active users are there?" → Changes constantly
- "What's the current project status?" → Status updates
- "Who's online right now?" → Real-time state

**Stable** (good):
- "Who created the Alpha project?" → Historical fact
- "What was the original budget for Project X?" → Point-in-time data
- "Who sent the first message in #announcements?" → Historical event

### Step 3: Design Multi-Step Reasoning

Structure questions to require chains of reasoning:

```
Question: "Which department has the most members working on 
          high-priority projects, and who leads that department?"

Agent reasoning:
1. Search for high-priority projects
2. Get details for each project (team members)
3. Group team members by department
4. Count members per department
5. Find department with most members
6. Look up department lead

Answer: "Engineering (15 members), led by James Wilson"
```

### Step 4: Craft Precise Answers

Answers should be:
- **Specific**: Exact names, numbers, or values
- **Verifiable**: Can be checked against tool output
- **Unambiguous**: Only one correct interpretation

**Good Answers:**
- "john.doe@example.com"
- "Project Phoenix, created 2024-03-15"
- "Engineering Department (12 members)"
- "$150,000"

**Poor Answers:**
- "John Doe's email" (not specific)
- "A recent project" (not verifiable)
- "The largest department" (ambiguous)

---

## Evaluation Output Format

### XML Structure

```xml
<evaluation>
  <qa_pair>
    <question>Your evaluation question here</question>
    <answer>The exact expected answer</answer>
  </qa_pair>
  
  <qa_pair>
    <question>Another evaluation question</question>
    <answer>Another exact answer</answer>
  </qa_pair>
  
  <!-- Continue for all 10 questions -->
</evaluation>
```

### Complete Example

```xml
<evaluation>
  <qa_pair>
    <question>
      Who is the project lead for the "Customer Portal Redesign" project, 
      and what is their email address?
    </question>
    <answer>Emily Zhang, emily.zhang@example.com</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      Which team has the most members assigned to high-priority projects, 
      and how many members do they have assigned?
    </question>
    <answer>Platform Engineering, 8 members</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      What is the total budget allocated to projects owned by the 
      Marketing department?
    </question>
    <answer>$425,000</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      Who created the earliest project in the system, and what 
      was the project name?
    </question>
    <answer>Michael Torres created "Infrastructure Setup" on 2023-01-15</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      How many projects are in "In Progress" status that have a 
      deadline within the next 30 days?
    </question>
    <answer>4 projects</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      What department does the user with the most project assignments 
      belong to, and how many projects are they assigned to?
    </question>
    <answer>Sarah Chen is in Engineering, assigned to 7 projects</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      Which project has the largest budget, and who approved that budget?
    </question>
    <answer>"Enterprise Migration" ($2.5M), approved by David Park</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      Find the contact information for the Design team lead.
    </question>
    <answer>Alex Rivera, alex.rivera@example.com, +1-555-0142</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      How many users are in the Engineering department, and how many 
      of them are currently assigned to active projects?
    </question>
    <answer>24 users in Engineering, 18 assigned to active projects</answer>
  </qa_pair>
  
  <qa_pair>
    <question>
      What is the average budget of projects in the "Planning" phase?
    </question>
    <answer>$175,000 average across 6 projects</answer>
  </qa_pair>
</evaluation>
```

---

## Question Categories

### Information Retrieval (2-3 questions)

Test finding and returning specific information:

```xml
<qa_pair>
  <question>
    What is the email address of the Engineering department manager?
  </question>
  <answer>james.wilson@example.com</answer>
</qa_pair>
```

### Aggregation (2-3 questions)

Test combining information from multiple sources:

```xml
<qa_pair>
  <question>
    How many projects total are owned by users in the Marketing department?
  </question>
  <answer>12 projects</answer>
</qa_pair>
```

### Comparison/Ranking (2-3 questions)

Test evaluating and comparing entities:

```xml
<qa_pair>
  <question>
    Which project has the earliest deadline among those in "In Progress" status?
  </question>
  <answer>"Mobile App v2.0" with deadline 2024-04-15</answer>
</qa_pair>
```

### Relationship Navigation (2-3 questions)

Test following relationships between entities:

```xml
<qa_pair>
  <question>
    Who is the manager of the person who created the "API Gateway" project?
  </question>
  <answer>Lisa Park</answer>
</qa_pair>
```

---

## Evaluation Anti-Patterns

### Avoid These Question Types

**Trivial Questions** (single tool call):
```xml
<!-- Bad: Too simple -->
<qa_pair>
  <question>What is the name of user U12345?</question>
  <answer>John Doe</answer>
</qa_pair>
```

**Ambiguous Questions** (multiple valid answers):
```xml
<!-- Bad: Ambiguous -->
<qa_pair>
  <question>Who works in Engineering?</question>
  <answer>Various people</answer>
</qa_pair>
```

**Time-Sensitive Questions** (answers change):
```xml
<!-- Bad: Unstable -->
<qa_pair>
  <question>How many users are currently online?</question>
  <answer>42</answer>
</qa_pair>
```

**Dependent Questions** (rely on previous state):
```xml
<!-- Bad: Depends on previous question -->
<qa_pair>
  <question>Now find their manager's email.</question>
  <answer>manager@example.com</answer>
</qa_pair>
```

**Write Operations** (modifies data):
```xml
<!-- Bad: Not read-only -->
<qa_pair>
  <question>Create a new project and tell me its ID.</question>
  <answer>P12346</answer>
</qa_pair>
```

---

## Running Evaluations

### Manual Evaluation

1. Start a fresh conversation with the MCP server connected
2. Ask each question without providing hints
3. Record whether the agent arrived at the correct answer
4. Note any tool usage issues or failures

### Automated Evaluation

```python
from mcp_evaluation import evaluate_server

results = evaluate_server(
    server_path="./server.py",
    evaluation_file="./evaluation.xml",
    model="claude-sonnet-4-20250514",
    timeout_per_question=120
)

print(f"Pass rate: {results.pass_rate:.1%}")
print(f"Average tool calls: {results.avg_tool_calls:.1f}")
print(f"Average time: {results.avg_time:.1f}s")

for q in results.questions:
    status = "✓" if q.passed else "✗"
    print(f"{status} Q{q.number}: {q.answer_given} (expected: {q.expected})")
```

### Evaluation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Pass Rate | % of questions answered correctly | >80% |
| Tool Error Rate | % of tool calls that failed | <5% |
| Avg Tool Calls | Average calls per question | 2-5 |
| Timeout Rate | % of questions that timed out | <10% |

---

## Iterating on Your MCP Server

### When Evaluations Fail

Use evaluation failures to improve your server:

**Tool Discovery Issues**:
- Agent couldn't find the right tool
- Fix: Improve tool descriptions, add "Use when" guidance

**Parameter Errors**:
- Agent passed wrong parameters
- Fix: Improve parameter descriptions, add examples

**Result Interpretation**:
- Agent misunderstood tool output
- Fix: Improve response format, add context

**Multi-Step Failures**:
- Agent lost track in long chains
- Fix: Consolidate tools, improve intermediate outputs

### Continuous Improvement Cycle

```
1. Run evaluation suite
2. Identify failure patterns
3. Update tools/documentation
4. Re-run evaluations
5. Repeat until >80% pass rate
```

---

## Evaluation Checklist

Before finalizing your evaluation suite:

### Questions (10 total)
- [ ] All questions are independent
- [ ] All questions are read-only
- [ ] All questions require 2-5 tool calls
- [ ] All questions are realistic use cases
- [ ] All answers are specific and verifiable
- [ ] All answers are stable over time

### Coverage
- [ ] 2-3 information retrieval questions
- [ ] 2-3 aggregation questions
- [ ] 2-3 comparison/ranking questions
- [ ] 2-3 relationship navigation questions

### Quality
- [ ] No trivial single-call questions
- [ ] No ambiguous answers
- [ ] No time-sensitive questions
- [ ] No dependent questions
- [ ] No write operations

### Format
- [ ] Valid XML structure
- [ ] Proper encoding
- [ ] Clear, readable formatting

---

*MCP Evaluation Guide v2.0 — January 2026*
