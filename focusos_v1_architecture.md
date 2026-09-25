# FocusOS — Full V1 Architecture

## 1. Product Definition

FocusOS is a personal AI productivity operating system.

Its purpose is to help one user:

1. Choose what matters today.
2. Start and complete focused work sessions.
3. Record real work evidence.
4. Reflect on distractions and progress.
5. Restart quickly after losing momentum.

### Core Loop

Mission → Focus → Evidence → Reflection → Improvement

### V1 Success Criteria

FocusOS V1 is successful if the user can:

- Choose one meaningful daily mission.
- Break the mission into a small next action.
- Start and complete a focus session.
- Record what was accomplished.
- Write a short daily reflection.
- Ask the AI coach for planning or restart support.
- Review weekly consistency.

---

## 2. Product Principles

### Principle 1: One Main Mission

The user should select one main outcome per day.

Supporting tasks are allowed, but the system should not encourage an overloaded task list.

### Principle 2: Action Before Motivation

The system should help the user start a small action instead of showing endless motivational content.

### Principle 3: Evidence Over Intention

The system should distinguish between:

- What the user planned.
- What the user started.
- What the user completed.
- What the user actually recorded as evidence.

### Principle 4: Restart Without Shame

A missed day should not destroy the system's usefulness.

The AI coach should help the user choose a small restart action.

### Principle 5: Local-First and Single-User

V1 can run locally and use a single user profile.

Authentication, billing, and multi-user permissions are not required initially.

---

## 3. V1 Scope

### Included

- Project management
- Daily mission creation
- Small task breakdown
- Focus session tracking
- Work evidence recording
- Daily reflection
- Weekly progress summary
- AI planning support
- AI task breakdown
- AI reflection support
- AI restart support

### Excluded

- Automatic app blocking
- Browser extension
- Automatic activity surveillance
- Social features
- Leaderboards
- Complex gamification
- Fully autonomous scheduling
- Multi-agent orchestration
- Multi-user billing
- Mobile native application

---

## 4. Recommended Technology Stack

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- A simple component library if needed

### Backend

Start with Next.js Route Handlers or Server Actions.

Do not create a separate backend service until the application needs it.

### Database

- PostgreSQL
- Prisma ORM or Drizzle ORM

Choose one ORM and stay consistent. Prisma may be easier for a beginner because its schema and generated client are clear.

### AI

- OpenAI-compatible LLM API
- Structured JSON output
- Server-side AI calls only
- Environment variables for API keys

The AI provider should be replaceable through a small service layer.

### Validation

- Zod for validating API inputs and AI outputs

### Development

- Local development first
- Git for version control
- `.env.local` for secrets
- Seed data for testing

---

## 5. System Architecture

```text
FocusOS
├── Frontend
│   ├── Dashboard
│   ├── Daily Mission
│   ├── Focus Session
│   ├── Reflection
│   └── Progress
│
├── Application Layer
│   ├── Project Service
│   ├── Mission Service
│   ├── Focus Session Service
│   ├── Evidence Service
│   ├── Reflection Service
│   └── Progress Service
│
├── AI Layer
│   ├── Planning Assistant
│   ├── Task Breakdown Assistant
│   ├── Reflection Assistant
│   └── Restart Assistant
│
└── Data Layer
    ├── PostgreSQL
    ├── Database Schema
    └── Repository/ORM Access
```

The AI layer should call application services or read controlled data. It should not directly modify the database without validation.

---

## 6. Main User Flow

### Flow A: Start the Day

1. User opens FocusOS.
2. Dashboard shows the active project.
3. User chooses one main mission.
4. User selects available working time.
5. AI optionally suggests a realistic plan.
6. Mission is saved.

### Flow B: Focus Session

1. User selects a next action.
2. User starts a focus session.
3. Timer runs.
4. User can pause or stop the session.
5. User records an outcome.
6. Session and evidence are saved.

### Flow C: End the Day

1. User opens daily reflection.
2. User records completed work.
3. User records distractions or blockers.
4. User writes one lesson.
5. AI summarizes the reflection.
6. System suggests the next day's starting action.

### Flow D: Restart After Distraction

1. User clicks “I lost focus.”
2. System asks what happened.
3. User chooses a restart duration, such as 5 or 10 minutes.
4. AI suggests one small action.
5. User starts a short focus session.

---

## 7. Database Design

The first version can use the following tables.

### 7.1 projects

Stores the user's active and archived projects.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | string | Project name |
| description | text | Project purpose |
| status | enum | active, paused, completed, archived |
| priority | enum | low, medium, high |
| created_at | datetime | Creation time |
| updated_at | datetime | Last update |

Example project:

```text
Name: FocusOS
Description: Build and use my personal AI productivity tool
Status: active
Priority: high
```

### 7.2 daily_missions

Stores one daily mission.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| project_id | UUID | Related project |
| mission_date | date | Date of mission |
| title | string | Main outcome |
| description | text | Additional context |
| status | enum | planned, active, completed, skipped |
| available_minutes | integer | Planned time |
| success_definition | text | How success is measured |
| created_at | datetime | Creation time |
| updated_at | datetime | Last update |

Recommended database rule:

```text
One main mission per day in V1.
```

This can be enforced in application logic initially.

### 7.3 tasks

Stores small actions related to a mission.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| mission_id | UUID | Related mission |
| title | string | Action title |
| description | text | Optional detail |
| status | enum | todo, in_progress, completed, skipped |
| estimated_minutes | integer | Estimated effort |
| order_index | integer | Display order |
| created_at | datetime | Creation time |
| completed_at | datetime | Completion time |

Example:

```text
Mission: Create FocusOS architecture

Tasks:
1. Create project structure — 20 minutes
2. Create database schema — 30 minutes
3. Build dashboard layout — 45 minutes
```

### 7.4 focus_sessions

Stores focused work sessions.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| task_id | UUID | Related task, nullable |
| started_at | datetime | Start time |
| ended_at | datetime | End time |
| planned_minutes | integer | Planned duration |
| actual_minutes | integer | Actual duration |
| status | enum | running, completed, cancelled, interrupted |
| interruption_note | text | Optional reason |
| outcome | text | What happened during the session |

The server should calculate actual duration where possible.

### 7.5 work_evidence

Stores proof or notes about completed work.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| task_id | UUID | Related task, nullable |
| session_id | UUID | Related session, nullable |
| evidence_type | enum | note, link, file_reference, result |
| content | text | Evidence content |
| created_at | datetime | Creation time |

Examples:

- “Created the database schema.”
- A Git commit URL.
- A local file reference.
- A short description of a completed result.

### 7.6 reflections

Stores daily reflections.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| reflection_date | date | Reflection date |
| completed_work | text | What was completed |
| blockers | text | What blocked progress |
| distractions | text | Main distractions |
| energy_level | integer | Optional 1–5 value |
| lesson | text | What was learned |
| next_start_action | text | First action for next session |
| ai_summary | text | AI-generated summary |
| created_at | datetime | Creation time |

### 7.7 ai_interactions

Stores AI requests and responses for debugging and personal review.

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| interaction_type | enum | planning, breakdown, reflection, restart |
| input_summary | text | Safe summary of user input |
| output_summary | text | AI result |
| model_name | string | Model used |
| created_at | datetime | Creation time |

Do not store sensitive data unnecessarily. Avoid storing API keys or raw private information.

---

## 8. Entity Relationships

```text
Project
  └── DailyMission
        └── Task
              ├── FocusSession
              └── WorkEvidence

DailyMission
  └── Reflection

AIInteraction
  └── Records AI-related activity
```

Relationship summary:

- One project can have many daily missions.
- One daily mission can have many tasks.
- One task can have many focus sessions.
- One task can have many evidence records.
- One day can have one main reflection.
- AI interactions are stored independently for traceability.

---

## 9. Frontend Pages

### `/`

Dashboard

Displays:

- Today's mission
- Current task
- Start focus button
- Today's completed sessions
- Restart button
- Short progress summary

### `/projects`

Displays:

- Active projects
- Project status
- Project priority
- Create and edit project actions

### `/mission`

Displays:

- Today's main mission
- Success definition
- Available time
- Task list
- AI breakdown button

### `/focus`

Displays:

- Current task
- Timer
- Pause button
- Stop button
- Interruption option
- Session outcome input

### `/reflection`

Displays:

- Completed work
- Blockers
- Distractions
- Lesson
- Next starting action
- AI summary

### `/progress`

Displays:

- Focus minutes
- Completed sessions
- Completed tasks
- Active project progress
- Days with a recorded mission
- Days with a recorded focus session

---

## 10. API Design

Use clear resource-oriented endpoints.

### Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
```

### Daily Missions

```text
GET    /api/missions/today
POST   /api/missions
PATCH  /api/missions/:id
```

### Tasks

```text
POST   /api/missions/:id/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
```

### Focus Sessions

```text
POST   /api/focus-sessions/start
POST   /api/focus-sessions/:id/finish
POST   /api/focus-sessions/:id/interrupt
```

### Evidence

```text
POST   /api/evidence
GET    /api/evidence
```

### Reflections

```text
GET    /api/reflections/:date
POST   /api/reflections
PATCH  /api/reflections/:id
```

### AI

```text
POST   /api/ai/plan
POST   /api/ai/breakdown
POST   /api/ai/reflection
POST   /api/ai/restart
```

---

## 11. AI Architecture

The AI should not control the entire application.

It should provide suggestions that the user can accept, edit, or reject.

### AI Capability 1: Daily Planning

Input:

```json
{
  "active_project": "FocusOS",
  "available_minutes": 90,
  "energy_level": 3,
  "unfinished_tasks": [
    "Create database schema",
    "Build dashboard layout"
  ]
}
```

Output:

```json
{
  "main_mission": "Create the first database schema",
  "success_definition": "Schema contains projects, missions, tasks, and focus sessions",
  "suggested_tasks": [
    {
      "title": "Define core entities",
      "estimated_minutes": 20
    },
    {
      "title": "Write the initial schema",
      "estimated_minutes": 40
    }
  ],
  "reason": "The plan fits the available time and creates a concrete result."
}
```

### AI Capability 2: Task Breakdown

Input:

```text
Create the FocusOS dashboard.
```

Output:

```json
{
  "next_action": "Create a dashboard page with a static mission card",
  "estimated_minutes": 25,
  "definition_of_done": "The page displays one mission card in the browser"
}
```

### AI Capability 3: Reflection

Input:

```text
I completed the database schema but watched YouTube for 90 minutes.
```

Output:

```json
{
  "summary": "You completed a meaningful technical task but lost time during an unplanned media session.",
  "pattern": "Unplanned content consumption after finishing a difficult task",
  "suggestion": "Before opening YouTube, record the next 10-minute action.",
  "tomorrow_start_action": "Create the first migration and test the database connection."
}
```

### AI Capability 4: Restart

Input:

```text
I wasted the morning and feel unmotivated.
```

Output:

```json
{
  "support_message": "You do not need to recover the entire morning.",
  "restart_action": "Open the project and write one database table definition.",
  "duration_minutes": 10,
  "definition_of_done": "One table definition is written and saved."
}
```

### AI Safety and Reliability Rules

- Validate AI output with Zod.
- Never trust AI-generated IDs without checking them.
- Never allow the AI to execute arbitrary code.
- Never expose API keys to the browser.
- Treat AI output as a suggestion.
- Save important user actions through normal application logic.
- Provide fallback behavior if the AI API fails.

---

## 12. Business Rules

### Daily Mission Rules

- V1 supports one main mission per day.
- A mission must belong to a project.
- A mission should have a clear success definition.
- A mission can be completed manually by the user.
- The user can edit the mission.

### Focus Session Rules

- A session must have a start time.
- A session can be completed, cancelled, or interrupted.
- A session should be linked to a task when possible.
- Actual duration should not be trusted from the browser alone.
- A completed session should allow an outcome note.

### Task Rules

- A task belongs to a mission.
- A completed task should have a completion timestamp.
- A task can be reopened if the user made a mistake.
- Tasks should remain simple and actionable.

### Reflection Rules

- One reflection per date in V1.
- A reflection can be edited.
- AI summaries are optional and can be regenerated.
- A missed reflection should not prevent the user from using the next day.

---

## 13. Suggested Folder Structure

```text
focusos/
├── app/
│   ├── page.tsx
│   ├── projects/
│   ├── mission/
│   ├── focus/
│   ├── reflection/
│   ├── progress/
│   └── api/
│       ├── projects/
│       ├── missions/
│       ├── tasks/
│       ├── focus-sessions/
│       ├── reflections/
│       └── ai/
│
├── components/
│   ├── dashboard/
│   ├── mission/
│   ├── focus/
│   ├── reflection/
│   └── ui/
│
├── lib/
│   ├── db.ts
│   ├── validation/
│   ├── services/
│   │   ├── project-service.ts
│   │   ├── mission-service.ts
│   │   ├── focus-service.ts
│   │   └── reflection-service.ts
│   └── ai/
│       ├── client.ts
│       ├── prompts.ts
│       ├── planning.ts
│       ├── breakdown.ts
│       ├── reflection.ts
│       └── restart.ts
│
├── prisma/
│   └── schema.prisma
│
├── types/
│   └── index.ts
│
├── public/
├── .env.example
├── package.json
└── README.md
```

Do not create every folder before it is needed. Start with the dashboard, database, and one working flow.

---

## 14. Development Phases

### Phase 1: Foundation

Goal: Run the application and connect the database.

Tasks:

1. Create Next.js project.
2. Configure TypeScript.
3. Add Tailwind CSS.
4. Configure PostgreSQL.
5. Add ORM.
6. Create the first schema.
7. Run the first migration.
8. Add a seed project.

Definition of done:

- App runs locally.
- Database connection works.
- One project exists in the database.

### Phase 2: Mission

Goal: Create and display today's mission.

Tasks:

1. Build dashboard page.
2. Create mission form.
3. Save mission through the server.
4. Display today's mission.
5. Add mission status.

Definition of done:

- You can create today's mission.
- Refreshing the page keeps the mission.
- The mission is stored in PostgreSQL.

### Phase 3: Tasks

Goal: Break the mission into small actions.

Tasks:

1. Add task creation.
2. Display task list.
3. Mark a task complete.
4. Add estimated minutes.
5. Add task ordering.

Definition of done:

- One mission can contain multiple actionable tasks.
- Tasks can be completed and reopened.

### Phase 4: Focus Sessions

Goal: Track actual focused work.

Tasks:

1. Build focus page.
2. Start a session.
3. Pause or stop a session.
4. Finish a session.
5. Save outcome notes.
6. Display session history.

Definition of done:

- A real session can be started and completed.
- The session is stored in the database.
- The user can see completed focus minutes.

### Phase 5: Reflection

Goal: Capture learning and distractions.

Tasks:

1. Build reflection form.
2. Save one reflection per day.
3. Display previous reflections.
4. Add next starting action.
5. Show reflection on the dashboard.

Definition of done:

- You can complete a daily reflection in under five minutes.

### Phase 6: AI Coach

Goal: Add AI only after the core workflow works.

Tasks:

1. Add server-side AI client.
2. Create structured output schemas.
3. Add daily planning endpoint.
4. Add task breakdown endpoint.
5. Add reflection summary endpoint.
6. Add restart endpoint.
7. Add error handling and fallback responses.

Definition of done:

- AI can suggest a plan.
- User can edit the suggestion before saving.
- AI failure does not break the application.

### Phase 7: Personal Usage

Goal: Use FocusOS yourself for seven days.

Record:

- Daily mission completion
- Focus sessions
- Distraction patterns
- Friction in the interface
- Features you actually need

Do not add major features until you have used the system.

---

## 15. Recommended First Implementation Slice

Do not start by building the entire architecture.

Build this vertical slice first:

```text
Create Project
    ↓
Create Today's Mission
    ↓
Create One Task
    ↓
Start Focus Session
    ↓
Complete Focus Session
    ↓
Save Outcome
```

This slice gives you a complete working loop without requiring the AI.

### Why this is the first slice

It teaches you:

- Database relationships
- Form handling
- API design
- Server-side validation
- State management
- Date and time handling
- Basic business rules
- How to test a real workflow

After this works, add reflection and then AI.

---

## 16. Testing Strategy

### Manual Tests

- Create a project.
- Create today's mission.
- Refresh the page.
- Create a task.
- Complete a task.
- Start and finish a focus session.
- Interrupt a focus session.
- Enter an outcome.
- Create a reflection.
- Try an invalid form.
- Try using the app when the AI API is unavailable.

### Important Edge Cases

- User starts two sessions at the same time.
- User refreshes during a running session.
- User closes the browser during a session.
- User creates an empty mission.
- User enters negative minutes.
- User submits the reflection twice.
- AI returns invalid JSON.
- Database connection fails.

V1 does not need perfect handling for every case, but important failures should be visible and should not silently corrupt data.

---

## 17. Security and Data Rules

- Keep API keys in environment variables.
- Do not put secret keys in client components.
- Validate all user inputs.
- Validate AI outputs.
- Use server-side authorization logic even if V1 is single-user.
- Do not log private reflection content unnecessarily.
- Use database constraints where practical.
- Keep backups once personal data becomes important.

---

## 18. Definition of Done for FocusOS V1

FocusOS V1 is complete when you can:

- Create an active project.
- Define one main daily mission.
- Break the mission into tasks.
- Start and complete a focus session.
- Record real work evidence.
- Write a daily reflection.
- View basic weekly progress.
- Ask AI for planning help.
- Ask AI to break down a task.
- Ask AI for restart support.
- Use the application for at least seven consecutive calendar days or seven actual usage days.
- Identify at least three improvements based on real usage.

---

## 19. Product Roadmap After V1

Only consider these after personal usage:

### V1.1

- Better weekly insights
- Recurring project goals
- Improved restart workflow
- Keyboard shortcuts
- Better session history

### V1.2

- Browser extension for intentional YouTube sessions
- Optional website blocking
- Learning session tracking
- Calendar integration

### V2

- More advanced personal memory
- Pattern detection across weeks
- Smarter planning based on actual energy and time
- Optional voice input
- Optional mobile interface

The roadmap should be driven by observed problems, not by feature excitement.

---

## 20. Immediate Next Action

Start with the first vertical slice:

1. Create a Next.js application.
2. Configure PostgreSQL and Prisma.
3. Add `Project`, `DailyMission`, `Task`, and `FocusSession` models.
4. Seed one project named `FocusOS`.
5. Build a simple dashboard.
6. Create today's mission.
7. Create one task.
8. Start and complete a focus session.

Do not build the AI coach until this workflow is usable without AI.

### First Practical Mission

**Mission:** Create the FocusOS project foundation.

**Success definition:**

> A local Next.js app connects to PostgreSQL, contains the four core models, and allows me to create today's mission and one task.

**Suggested first focus session:** 45 minutes.

**Minimum version if energy is low:** Create the Next.js project and write the initial database schema.
