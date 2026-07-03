# 🎙️ Orator Academy Database

A management web app for a **public speaking tutoring company** — schedule, students, progress
tracking, and payments in one light, premium interface. Opens on an animated landing page, then
runs entirely on your machine.

## Run it

```bash
cd podium
npm install
npm run dev
```

Open http://localhost:5180 (it opens automatically).

## Saving

Saving is always permanent: the backend (when reachable) is the source of truth and the browser's
`localStorage` is the offline cache. (The old Test Mode / sessionStorage flow was removed when the
app went live; the **Reset classes** and **Factory reset** buttons in Settings remain.)

## Sections

### 🗓️ Schedule
- Google-Calendar-style weekly grid (8 AM – 9 PM). Navigate weeks; **Today** jumps back.
- **+ New class** or click any empty slot to create one.
- Class types: **Group** (recurring, billed $40/session), **1-on-1** (recurring, single student),
  **Makeup 1-on-1** (one-off, single student, not billed), **Summer lessons** (a Mon–Fri week
  during the break — see below).
- Classes are **recurring weekly** (e.g. "every Wednesday at 6 PM"). Name defaults to day + time
  and is editable.
- **Hover** a class to see its students; **click** to expand the full detail view.
- **Drag** a class to a new day/time → a popup confirms the date & time. Moving a recurring class
  only affects **that one week** — future weeks stay on the regular schedule, and that week's
  permanent slot is removed.
- **Delete** asks whether to remove just that session or all recurring sessions.
- **Summer break** (June 18 → start of October): regular classes can't be scheduled; recurring
  classes skip the window automatically. When you create a class, the calendar **jumps to its first
  real session** so you always see it immediately (e.g. a class made during the break lands on its
  first October week rather than seeming to vanish).

### ☀️ Summer lessons
- The only class type allowed **inside** the break window. Click any slot during the break (or
  ＋ New class → Summer lessons), pick any day of the week, and it snaps to a **Monday–Friday
  week** of **five separate daily sessions**.
- Each day is its own session: its **own goals, class notes, ratings, and attendance** — click
  Monday and you're editing Monday only.
- The roster is shared by the week: adding a **Permanent** student enrolls them for all five days
  (a **Temporary** student attends just that one day, and the per-session ✕ removes a student from
  one day only). Deleting offers "just this day" or "the whole summer week".
- Summer lessons are **free — never billed**. Money received for them is filed under the
  **Summer lessons** folder on the Payments page.

### Class detail
- Editable name & times, type, date.
- **Class goal(s)** — shared objectives that carry across sessions until marked *Met* (completed
  goals sink to the bottom). Each goal is stamped with the session date it was written.
- **Class notes** for the whole session.
- Per student: **individual goals** (same carry-over behavior), **attendance** (present/absent),
  **8 presentation metrics** rated out of 5 in half-star intervals (Body Language, Voice
  Modulation, Voice Projection, Eye Contact, General Confidence, Content Structure, Ease of
  Appearance, Audience Engagement), plus **presentation notes**.
- **Add students** with a Permanent / Temporary switch:
  - **Permanent** (black glow) — attends every session. Default right after a class is made.
  - **Temporary** (blue glow) — attends only that one session. Default when adding later.

### 👥 Students
- Add students (first name required, last name optional).
- **Hover a student** to reveal a red ✕ to archive them (kept in the **Archive** with all history;
  restore anytime).
- **Hover the avatar** to add or change a **profile photo** — it's used as their avatar everywhere.

### Goals
- **Class goals** belong to a class.
- **Individual goals are global to the student** — set one anywhere and it follows them into every
  class they attend (group, 1-on-1, makeup, or as a temporary student).

### 📈 Progress
- **Progress report requests** widget pinned to the top.
- Pick a student for a **6-month report**: averaged metrics, attendance visual, and every
  presentation note.
- All **ongoing class & individual goals** across active classes, on one page.

### 💳 Payments
- Studio totals: **Owed** (always shown) and **Outstanding** (unpaid past the 10th).
- Each student has one continuous **Statement of account** — a professional running ledger with
  **Date · Description · Charge · Payment/Credit · Balance** columns and a running balance, *not*
  split into separate month cards. Monthly charges post on the 1st (a cycle is only billed once the
  month has started), so you never see "owed" for a month that hasn't begun.
- Group classes bill **(price per class) × sessions that month** — usually $160 (4 weeks),
  sometimes **$200** (5-week months). The break window is excluded automatically; moved sessions
  are included.
- The **× N class count** on each charge row is editable — it defaults to the real number of
  sessions but you can click it to override a month (e.g. bump it to 5). The cost-per-class and the
  late-fee percentage are both set in **Settings → Billing**.
- A single **Record payment received** field and an **Add credit** field (a credit reduces what
  they owe). Both post dated, timestamped rows; payments/credits are removable.
- **Outstanding vs. owed:** the current month's charge is "owed but not due yet" until after the
  10th, then it becomes outstanding.
- **10% late fee** toggle in Settings (off by default) — when on, it posts a late-fee line on the
  outstanding balance.
- 1-on-1, makeup, and summer-lesson sessions are not billed automatically.

### 📒 Ledgers
- One **compiled document per month**: every charge billed that month plus every payment / credit
  that went through — student, reason (method, provider, memo), and a timestamp on each row, with
  month totals.
- A switch picks the layout: **All by time** (charges, then every transaction chronologically) or
  **By student** (each student's transactions in their own section with subtotals, one after the
  other; the Summer-lessons folder last).
- The **🖨️ Print** button prints just the document, so the teacher keeps a **physical backup** of
  each month's data.
- Each student's **statement of account** on the Payments page has its own **🖨️ Print statement**
  button too — it prints the running ledger with a proper document header.

### Simulate date (testing)
**Settings → Simulate date** lets you pretend it's any day. Everything time-based — billing cycles,
outstanding fees, the schedule's "today" — uses the simulated date. A purple banner shows when it's
active; "Use real date" turns it off.

### ⚙️ Settings
- Billing options (price per class, late fee), **Reset classes** — clears the schedule for the
  summer while keeping all students, metrics, notes, goals, and payment history — and **Factory
  reset**, which wipes all data back to an empty app.

## Tech
React 18 + Vite. State lives in a single reducer (`src/store.jsx`); domain logic is split into
`src/utils/` (calendar engine, dates, payments, progress aggregation).
