const path = require('path');
const { render_md } = require('../utils/render-md');

const DEFAULT_MODELS = {
    anthropic: 'claude-3-5-sonnet-20240620',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
};

const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', '..', 'operating_system', 'CHATBOT.md');

/**
 * Common chat function that routes to the appropriate provider
 */
async function chat(userMessage, history, toolDefinitions, toolExecutors) {
    const provider = process.env.AI_PROVIDER || 'anthropic';

    switch (provider.toLowerCase()) {
        case 'gemini':
            return chatGemini(userMessage, history, toolDefinitions, toolExecutors);
        case 'groq':
            return chatGroq(userMessage, history, toolDefinitions, toolExecutors);
        case 'anthropic':
        default:
            // Reuse existing claude logic but generalized
            return chatAnthropic(userMessage, history, toolDefinitions, toolExecutors);
    }
}

/**
 * Anthropic Implementation
 */
async function chatAnthropic(userMessage, history, toolDefinitions, toolExecutors) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.EVENT_HANDLER_MODEL || DEFAULT_MODELS.anthropic;
    const systemPrompt = render_md(SYSTEM_PROMPT_PATH);

    const messages = [...history, { role: 'user', content: userMessage }];

    const callApi = async (msgs) => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: msgs,
                tools: toolDefinitions,
            }),
        });
        if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
        return res.json();
    };

    let response = await callApi(messages);
    let assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    while (response.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of assistantContent) {
            if (block.type === 'tool_use') {
                const result = await (toolExecutors[block.name] ? toolExecutors[block.name](block.input) : { error: `Unknown tool: ${block.name}` });
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
            }
        }
        messages.push({ role: 'user', content: toolResults });
        response = await callApi(messages);
        assistantContent = response.content;
        messages.push({ role: 'assistant', content: assistantContent });
    }

    return {
        response: assistantContent.filter(b => b.type === 'text').map(b => b.text).join('\n'),
        history: messages
    };
}

/**
 * Gemini Implementation
 */
async function chatGemini(userMessage, history, toolDefinitions, toolExecutors) {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.EVENT_HANDLER_MODEL || DEFAULT_MODELS.gemini;
    const systemPrompt = render_md(SYSTEM_PROMPT_PATH);

    // Convert history to Gemini format
    const contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: Array.isArray(m.content)
            ? m.content.map(c => c.type === 'text' ? { text: c.text } : { text: JSON.stringify(c) })
            : [{ text: m.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    // Map tools to Gemini format
    const tools = [{
        function_declarations: toolDefinitions.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }))
    }];

    const callApi = async (conts) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: conts, tools, system_instruction: { parts: [{ text: systemPrompt }] } })
        });
        if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
        return res.json();
    };

    let response = await callApi(contents);
    let candidate = response.candidates[0];

    while (candidate.content.parts.some(p => p.functionCall)) {
        contents.push(candidate.content);
        const toolParts = [];
        for (const part of candidate.content.parts) {
            if (part.functionCall) {
                const result = await (toolExecutors[part.functionCall.name] ? toolExecutors[part.functionCall.name](part.functionCall.args) : { error: `Unknown tool: ${part.functionCall.name}` });
                toolParts.push({ functionResponse: { name: part.functionCall.name, response: { result } } });
            }
        }
        contents.push({ role: 'user', parts: toolParts });
        response = await callApi(contents);
        candidate = response.candidates[0];
    }

    return {
        response: candidate.content.parts.map(p => p.text).join(''),
        history: contents.map(c => ({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts.map(p => p.text || JSON.stringify(p)).join('\n') }))
    };
}

/**
 * Groq Implementation (OpenAI compatible)
 */
async function chatGroq(userMessage, history, toolDefinitions, toolExecutors) {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.EVENT_HANDLER_MODEL || DEFAULT_MODELS.groq;
    const systemPrompt = render_md(SYSTEM_PROMPT_PATH);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
            role: m.role,
            content: Array.isArray(m.content) ? m.content.map(c => c.text || JSON.stringify(c)).join('\n') : m.content
        })),
        { role: 'user', content: userMessage }
    ];

    const tools = toolDefinitions.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }
    }));

    const callApi = async (msgs) => {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages: msgs, tools, tool_choice: 'auto' })
        });
        if (!res.ok) throw new Error(`Groq error: ${res.status} ${await res.text()}`);
        return res.json();
    };

    let response = await callApi(messages);
    let choice = response.choices[0];

    while (choice.message.tool_calls) {
        messages.push(choice.message);
        for (const toolCall of choice.message.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await (toolExecutors[toolCall.function.name] ? toolExecutors[toolCall.function.name](args) : { error: `Unknown tool: ${toolCall.function.name}` });
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: JSON.stringify(result)
            });
        }
        response = await callApi(messages);
        choice = response.choices[0];
    }

    return {
        response: choice.message.content,
        history: messages.filter(m => m.role !== 'system')
    };
}

/**
 * Get the current API key based on provider
 */
function getApiKey() {
    const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
    switch (provider) {
        case 'gemini': return process.env.GEMINI_API_KEY;
        case 'groq': return process.env.GROQ_API_KEY;
        case 'anthropic':
        default: return process.env.ANTHROPIC_API_KEY;
    }
}

module.exports = { chat, getApiKey };
