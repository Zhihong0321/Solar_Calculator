# Daily Work Report - Mar 30, 2026

## Repository: Solar Calculator v2

### Completed Tasks
- **System Bug Submission Channel**: 
    - Implemented a new, standalone chat module (`BugReport`) for users to report bugs.
    - Repurposed the existing WhatsApp-style chat codebase for a consistent UI/UX.
    - Integrated an AI Support Agent using the `AIRouter` (UniAPI) to guide users through the bug reporting process (asking for steps to reproduce, screenshots, etc.).
    - Created dedicated database tables (`bug_thread`, `bug_message`) for persistent, per-user chat history.
    - Built a Bug Dashboard for IT Admins (Head of IT) to review and reply to user submissions.
    - Secured admin routes with a dedicated `requireAdmin` middleware.
    - Updated the main Sales Hub dashboard with quick-access buttons for Bug Submission and IT Review.

- **AI Router Enhancements**:
    - Refactored `AIRouter` to support dynamic `response_format`, enabling both structured data extraction (JSON) and natural language chat (Text) within the same core logic.

### Status
- **Ready for Testing**: The feature is fully implemented and routed. Manual verification on the live system is recommended to confirm AI responsiveness and file upload handling in the production environment.
