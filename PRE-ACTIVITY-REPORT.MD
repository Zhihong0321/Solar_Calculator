# PRE Activity Report V2

## Core Intention

PRE Activity Report V2 is not a replacement for the current Activity Report system.

The current Activity Report system is a POST activity report:

- The agent does work first.
- The agent reports the activity later.
- The manager reviews what was already reported.

PRE Activity Report V2 is different:

- The agent declares the next activity before starting it.
- The system records the start time immediately.
- The manager can see what everyone is doing now.
- The same entries become a continuous daily timeline later.

The main goal is not only reporting. The main goal is live operational visibility.

## Product Definition

PRE Activity Report V2 answers this question:

> What is every team member doing right now, and when did they start?

The system must support real working behavior. If an agent is rushing to meet a client, they should be able to open Agent OS and tap one preset button such as "Meeting Client". That is enough to create the PRE entry.

Details can be added later.

The key rule is:

> The entry must be created before execution. Details may be completed after execution.

## Why PRE Instead Of POST

POST reports are useful for history, but they do not show live status.

PRE reports create live awareness:

- Managers can see current activity by employee.
- Managers can see who is on break, in meeting, travelling, doing roadshow, or idle.
- Managers can detect overdue or forgotten entries.
- Managers can understand team deployment without asking everyone manually.
- The daily report becomes a natural by-product of real-time activity switching.

This changes the system from a report form into a live work-state board.

## V1 And V2 Boundary

Activity Report V1 must remain unchanged at first.

V1 remains responsible for:

- Existing KPI points.
- Existing after-activity submission.
- Existing manager review.
- Existing routes and pages.

V2 should be built as a separate module:

- New page.
- New API endpoints.
- New database tables.
- New manager live board.
- New agent quick action experience.

Suggested routes:

```text
/activity-report-v2
/activity-live-board
/api/activity-v2/...
```

V2 may later feed KPI or V1-style summaries, but that should not be part of the first implementation.

## Mental Model

V2 has four separate concepts.

```text
Task Preset
Status Category
Current Activity
Timeline Entry
```

### Task Preset

A task preset is the button the agent clicks.

Examples:

```text
Planning the Day
Follow Up Call
Telemarketing
Meeting Client
Site Visit
Roadshow
Customer Home Welcoming
Travel
Documentation
Lunch Break
Other Task
```

### Status Category

A status category is how the manager dashboard interprets the task.

Examples:

```text
working
break
travel
meeting
admin
unavailable
other
```

The task name and status category must be separate.

Example:

```text
Task Preset: Lunch Break
Status Category: break
```

```text
Task Preset: Meeting Client
Status Category: meeting
```

This allows the manager view to show clean status icons and grouping without guessing from text.

### Current Activity

The current activity is the latest open PRE entry for an agent.

Only one activity should be active per agent at a time.

When a new task starts, the previous active task is automatically ended.

### Timeline Entry

Every PRE entry becomes one row in the agent's timeline.

Example:

```text
09:32 Planning the Day
10:31 Follow Up Call
11:20 Meeting Client
12:45 Lunch Break
13:35 Site Visit
15:10 Telemarketing
```

## Agent Experience

The agent experience must be fast.

The ideal flow:

```text
Open Agent OS -> tap preset -> activity starts
```

The first action should not require a form.

Agent dashboard should show:

```text
Current: Meeting Client
Started: 10:31 AM
Duration: 42 min

[Add Detail]
[Switch Task]

Quick Start:
[Planning] [Follow Up Call] [Meeting Client]
[Site Visit] [Roadshow] [Telemarketing]
[Lunch Break] [Travel] [Other Task]
```

When the agent taps a preset:

1. The current open entry is closed.
2. A new entry is created immediately.
3. The manager live board updates.
4. The agent can continue working without filling extra fields.

## Detail Later Rule

Details are allowed later because the PRE entry is about intent and timing first.

Recommended rule:

```text
Task selection: required before activity starts
Details: optional at start
Detail edit window: 24 hours
```

Details may include:

- Customer name.
- Linked customer record.
- Location.
- Remarks.
- Outcome.
- Attachments later if needed.

Detail status should be tracked separately:

```text
not_required
pending
completed
late
```

Example:

```text
10:31 Meeting Client
Detail: pending
```

Later:

```text
10:31 Meeting Client
Detail: Met Mr Tan at Klang, discussed 12kW proposal.
```

After the allowed edit window, missing details can be marked late.

## Manager Live Board

The manager view is the strongest reason for PRE reporting.

The live board should group employees by department and task/status.

Example:

```text
Sales Department

Roadshow
David   09:10 - now
Robert  09:18 - now
Chang   09:45 - now
Zairul  10:02 - now

Follow Up Call
Denise  10:15 - now
Amanda  10:22 - now

Customer Home Welcoming
Jason   10:30 - now

Lunch Break
Mei Ling 12:41 - now

Overdue
Farid   Site Visit, 4h 20m
```

Manager filters:

```text
By Department
By Task Type
By Status Category
By Agent
Overdue Only
Detail Pending
No Active Task
```

Manager status examples:

```text
Active
On Break
Travelling
Meeting
Overdue
Auto-ended
No active task
Detail pending
Detail late
```

## Department Presets

Each department should have its own default task presets.

Sales Department default presets:

```text
Planning the Day
Follow Up Call
Telemarketing
Meeting Client
Site Visit
Roadshow
Customer Home Welcoming
Travel
Documentation
Lunch Break
Other Task
```

Operations Department future examples:

```text
Installation
Site Inspection
Troubleshooting
Warehouse Pickup
Travel
Lunch Break
Admin
Other Task
```

Each preset should define:

```text
Task name
Department
Status category
Default max duration
Whether it counts as work
Whether details are expected later
Detail edit window
Display order
Icon/color
Active/inactive
```

## Max Duration And Auto Cutoff

Each preset can define a maximum length.

This prevents one forgotten task from appearing to last forever.

Examples:

```text
Lunch Break: 60 minutes
Follow Up Call: 90 minutes
Meeting Client: 180 minutes
Site Visit: 240 minutes
Roadshow: 480 minutes
```

If the agent starts another task, the previous task ends at the new task start time.

If the agent does not start another task, the system should calculate an effective end time:

```text
effective_end_at = started_at + max_minutes
```

The stored row can remain open, but the live board and reports should show it as overdue or auto-ended depending on the rule chosen.

Recommended first version:

- Show overdue while the entry exceeds max duration.
- In daily report, cap the displayed duration at max duration if no real end exists.
- Keep the original open state visible so manager can identify forgotten updates.

## Suggested Database Schema

Use new tables. Do not overload `agent_daily_report`.

### activity_v2_task_preset

```text
id
bubble_id
department_name
task_name
status_category
default_max_minutes
counts_as_work
requires_later_detail
detail_edit_window_hours
display_order
icon
color
is_active
created_by
created_at
updated_at
```

### activity_v2_entry

```text
id
bubble_id
linked_user
linked_agent
department_name
preset_id
task_name
status_category
started_at
ended_at
end_reason
max_minutes
detail_status
detail_text
linked_customer
location_text
edited_after_start
created_at
updated_at
```

Recommended `end_reason` values:

```text
next_entry
manual_stop
auto_cutoff
manager_adjusted
system_adjusted
```

Recommended `detail_status` values:

```text
not_required
pending
completed
late
```

Optional future audit table:

```text
activity_v2_detail_audit
- id
- entry_id
- changed_by
- old_detail
- new_detail
- changed_at
```

## API Plan

Suggested first endpoints:

```text
GET /api/activity-v2/presets
POST /api/activity-v2/start
GET /api/activity-v2/current
GET /api/activity-v2/timeline
PUT /api/activity-v2/entries/:id/detail
GET /api/activity-v2/live-board
```

## Confirmed Implementation Clarifications

Date confirmed: 2026-04-24

These clarifications override any more complex interpretation in the earlier draft for the first backend/database build.

### Implementation Priority

Build the backend and database foundation first.

The UI should not be started until the backend and database behavior are solid.

Activity Report V1 must remain untouched.

V2 must use the same PostgreSQL connection that the existing application already uses.

### Simple Table Model

The first version should use two core V2 tables:

```text
activity_v2_task_preset
activity_v2_report
```

`activity_v2_task_preset` stores reusable task buttons/templates.

`activity_v2_report` stores the actual activity rows created when a user starts a task.

Do not overcomplicate the database with heavy constraints or report-generation logic. The system/backend logic controls task start, task replacement, and task ending.

### Task Preset Definition

A task preset is a predefined task button.

Task presets are set per department and per task.

Each task preset should include:

```text
task title
max length
department
task point
scope
created by user
owner user
active/inactive
created at
updated at
```

Max length rules:

```text
default max length: 2 hours
maximum allowed max length: 12 hours
```

Task point is used for activity point counting.

### Preset Ownership And Scope

Task presets can be created by:

```text
HoD
Admin
Superadmin
Agent
```

Presets created by HoD, Admin, or Superadmin are department presets.

Presets created by an Agent are personal presets for that agent's own routine tasks.

Recommended scope values:

```text
department
personal
```

Department preset rules:

```text
scope = department
department = target department
created_by_user = HoD/Admin/Superadmin user
owner_user = null
```

Personal preset rules:

```text
scope = personal
department = user's department
created_by_user = agent user
owner_user = agent user
```

### Task Quick Entry Ordering

For an agent, the Task Quick Entry list should show:

```text
1. All active preset tasks for the user's department created by HoD/Admin/Superadmin
2. All active preset tasks created by the user
```

The API should return this in grouped order so the UI can display it simply:

```text
Department Tasks
- Meeting Client
- Follow Up Call
- Site Visit

My Tasks
- Morning CRM Cleanup
- Daily WhatsApp Follow Up
```

Backend filters:

```text
Department Tasks:
scope = department
department = current user's department
is_active = true

My Tasks:
scope = personal
owner_user = current linked_user
is_active = true
```

### Custom Task Behavior

An activity can come from a preset task or a custom task.

For a preset task, the report row copies from the preset:

```text
task title
department
max length
task point
```

For a custom task:

```text
task_preset_id = null
task title is entered by the user
department is still required
max length defaults to 2 hours unless changed
max length cannot exceed 12 hours
task point is still stored
```

### Activity Ownership

Use `linked_user` as the main owner field for V2 activity reports.

### Running Task Logic

Only one task should be running for a user at a time, but this should be controlled by backend/system logic instead of complicated database constraints.

When a user clicks a task:

```text
1. The clicked task becomes the running task.
2. Any previous running task for the same linked_user is ended at that exact moment.
3. A new activity_v2_report row is created for the new running task.
```

If the user forgets to stop or replace the task:

```text
the task should auto cut off when max length is reached
```

When a task is still running:

```text
ended_at = null
```

When a task is replaced by the next task:

```text
ended_at = next task start time
end_reason = next_entry
```

When a task reaches max length without replacement:

```text
ended_at = started_at + max length
end_reason = auto_cutoff
```

### Daily Report Logic

The daily report should stay simple.

It should list all tasks entered today for the selected user/date/department.

Do not make the daily report logic overcomplicated in the first version.

### POST /api/activity-v2/start

Purpose:

Start a new PRE activity from a preset.

Behavior:

1. Validate preset.
2. Resolve current user and agent.
3. Start database transaction.
4. Find open entry for this agent.
5. Close open entry at new start time.
6. Insert new entry.
7. Commit transaction.
8. Return current activity.

### GET /api/activity-v2/current

Purpose:

Show the agent's active task on their dashboard.

Should return:

```text
Current task
Started at
Elapsed minutes
Max minutes
Status category
Overdue state
Detail status
```

### GET /api/activity-v2/timeline

Purpose:

Show the daily continuous timeline.

Filters:

```text
date
agent
department
detail_status
```

### GET /api/activity-v2/live-board

Purpose:

Manager live view.

Should return grouped data:

```text
Department -> Task Type -> Agents
Department -> Status Category -> Agents
Overdue list
No active task list
Detail pending list
```

## Reporting Output

Daily report should be timeline-first.

Example:

```text
09:32 - 10:31 Planning the Day
10:31 - 11:20 Follow Up Call
11:20 - 12:45 Meeting Client
12:45 - 13:35 Lunch Break
13:35 - 15:10 Site Visit
15:10 - 17:45 Telemarketing
```

Each row should include:

```text
Start time
End time
Duration
Task name
Status category
Detail
Detail status
End reason
```

## Build Plan

### Phase 1: Foundation

Goal:

Build the V2 data model and API without touching V1 behavior.

Deliverables:

- Create V2 preset table.
- Create V2 entry table.
- Seed Sales Department default presets.
- Add activity V2 backend module.
- Add start activity endpoint.
- Add current activity endpoint.
- Add today timeline endpoint.

Success condition:

An agent can start a PRE activity through API, and the previous activity closes automatically.

### Phase 2: Agent Quick Action

Goal:

Make PRE activity entry fast enough for real use.

Deliverables:

- Add V2 quick action panel to Agent OS dashboard.
- Show current activity.
- Show elapsed duration.
- Show quick preset buttons.
- Allow one-click switching.
- Allow detail editing after start.

Success condition:

An agent can start "Meeting Client" in one click and add details later.

### Phase 3: Manager Live Board

Goal:

Give managers live operational visibility.

Deliverables:

- Add manager live board page.
- Group agents by department.
- Group active agents by task type.
- Show break/unavailable/working states.
- Show overdue entries.
- Show agents with no active task.

Success condition:

A manager can open one page and understand what the team is doing now.

### Phase 4: Daily Timeline Report

Goal:

Turn PRE entries into a clean daily report.

Deliverables:

- Add daily timeline view.
- Show start/end/duration.
- Show detail pending or late markers.
- Add filter by agent/date/department.
- Add export or print view.

Success condition:

The system can generate a continuous day report from PRE entries.

### Phase 5: Governance And Audit

Goal:

Make the system reliable for management use.

Deliverables:

- Add detail edit window enforcement.
- Mark late details.
- Add manager adjustment ability.
- Add audit trail for detail changes.
- Add preset management UI.

Success condition:

Managers can trust the timeline and understand late, edited, or adjusted entries.

## Design Rules

- Do not replace Activity Report V1.
- Do not force long forms before task start.
- Do not infer status category from task name.
- Do not allow multiple active tasks for one agent.
- Do not let forgotten tasks run forever without warning.
- Do not make details mandatory at the moment of starting urgent work.
- Preserve the PRE nature of the system: the first entry must happen before execution.

## Final Product Vision

PRE Activity Report V2 should become:

```text
PRE intent capture
+ live workforce visibility
+ automatic daily timeline
+ detail completion workflow
```

The system should make it easy for agents to report honestly in the moment, and easy for managers to see the living shape of the workday.
