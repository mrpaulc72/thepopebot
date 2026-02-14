Create a new file `event_handler/job_scheduler.js` that implements a simple job queue. It should:
1. Maintain an internal queue of job descriptions.
2. Process jobs one at a time to avoid conflicts.
3. Use the existing `createJob` function from `event_handler/tools/github.js`.
4. Log the status of the queue.

Update `event_handler/server.js` to:
1. Import and initialize the `job_scheduler`.
2. Modify the `/webhook` and `/telegram/webhook` (where it calls `create_job` tool) to push jobs to the scheduler instead of calling `createJob` directly.
3. Add a new endpoint `/jobs/queue` to view the current queue status.

Ensure all existing functionality (like environment variables and error handling) remains intact.