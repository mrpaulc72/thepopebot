Perform a self-reflective audit of thepopebot codebase to generate a comprehensive documentation guide. 

Tasks:
1. List all skills in `.pi/skills/`.
2. Identify default models for chat and agent in the code.
3. Verify Telegram commands/tools in `event_handler/claude/tools.js`.
4. Identify external service integrations.
5. Save the final audit report as `docs/SELF_REFLECTIVE_AUDIT.md`.

The report should include:
- Core Identity (Architecture & Models)
- Feature Catalog (Telegram commands & Pi skills)
- Top 5 Power Plays (Unique capabilities)
- Operational How-To (Health, model switching, triggering jobs)
- Integration Map (External services)