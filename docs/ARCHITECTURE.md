# Technical Architecture Documentation

This document provides a comprehensive technical overview of the **Project Management Application** architecture, data flow, calculation engines, SVG rendering pipeline, and production bundling system.

---

## 🏗️ High-Level System Architecture

The application is structured as a decoupled, event-driven frontend web app. It operates completely client-side in the browser, requiring no backend database or server infrastructure.

```mermaid
flowchart TD
    subgraph PRESENTATION["Presentation Layer (Views)"]
        WBS["WbsGridView (Task Spreadsheet)"]
        GANTT["GanttView (SVG Timeline)"]
        RES["ResourceView (Engineer Heatmap)"]
        PERT["DependencyTreeView (PERT Graph)"]
        MILE["MilestonesView (Stage Roadmap)"]
        INFO["InfoGuideView (Glossary & Help)"]
    end

    APP["HardwarePMApp (State Controller)"]

    subgraph ENGINES["Calculation & Scheduling Engines"]
        DEP["DependencyEngine (CPM Scheduler)"]
        CAL["CalendarEngine (Holidays & Overtime)"]
        BASE["BaselineEngine (Variance & Delays)"]
    end

    subgraph DATA["Data & Persistence Layer"]
        MODELS["Task, Resource & Calendar Models"]
        STORE["ProjectStore (LocalStorage & .prj JSON)"]
        EXPORT["Excel & Print Exporters"]
    end

    WBS <--> APP
    GANTT <--> APP
    RES <--> APP
    PERT <--> APP
    MILE <--> APP
    INFO <--> APP

    APP --> DEP
    APP --> CAL
    APP --> BASE

    DEP --> MODELS
    CAL --> MODELS
    BASE --> MODELS

    APP <--> STORE
    APP --> EXPORT
```

---

## 📦 1. Data Model Layer

### Task Model (`js/models/taskModel.js`)
The `Task` class represents individual activities, summary tasks, and milestones.
- **Key Attributes**:
  - `id`: Unique task identifier (`task_xxx`).
  - `wbs`: Hierarchical WBS string (e.g., `1`, `1.1`, `1.1.2`).
  - `name`: Task description.
  - `duration`: Working days count ($d \ge 0$). Tasks with `duration === 0` or `isMilestone = true` render as milestone diamonds.
   - `start`, `finish`: Display mirror of the currently selected baseline dates; not mutated by scheduling.
   - `plannedStart`, `plannedFinish`: Current baseline planning anchor, updated when a new baseline is captured.
   - `projectedStart`, `projectedFinish`: Recomputed current schedule dates.
   - `actualStart`, `actualFinish`: User-entered execution dates.
   - `delayDays`: User-entered additional delay in working days.
   - `forecastStart`, `forecastFinish`: Backward-compatible aliases for the projected date fields.
   - `isOverdue`, `overdueDays`: Date-derived indicators for incomplete tasks whose planned finish is before local today.
  - `predecessors`: Dependency string (e.g. `1FS+2d, 3SS`).
  - `progress`: Completion percentage ($0 \dots 100$).
  - `stage`: Stage gate category (`Concept`, `EVT`, `DVT`, `PVT`, `MP`, or custom).
  - `workstream`: Functional discipline (`HW`, `EE`, `ME`, `FW`, `SYS`, `PROC`, `TEST`, `MFG`, or custom).
  - `status`: Execution status (`Not Started`, `In Design`, `In Fab`, `Testing`, `Blocked`, `Delayed`, `Complete`, or custom).
  - `assignedResources`: Array of fractional assignments: `[{ name: "Alex Rivera", units: 100 }, { name: "Sarah Chen", units: 50 }]`.
  - `leadTime`: Procurement/vendor lead-time in days.
  - `baseline`: Snapshot object `{ start, finish, duration }` or `null`.
  - `slack`, `isCritical`: Calculated CPM transient properties.

### Resource Model (`js/models/resourceModel.js`)
Represents team engineers and resource pool profiles.
- `id`: Resource identifier.
- `name`: Engineer name.
- `role`: Role title (e.g. *Lead PCB Engineer*).
- `workstream`: Primary discipline.
- `capacity`: Standard daily capacity percentage (default: `100%`).

### Calendar Model (`js/models/calendarModel.js`)
Defines the project work schedule.
- `workingDays`: Array of standard weekly working days (e.g. `[1, 2, 3, 4, 5]` for Mon–Fri).
- `holidays`: Array of festive/company holiday objects: `[{ date: '2026-10-02', name: 'Gandhi Jayanti' }]`.
- `overtimeDays`: Array of exception working dates: `[{ date: '2026-10-10', note: 'EVT Crunch Saturday' }]`.

---

## ⚙️ 2. Calculation Engines

### Calendar Engine (`js/engine/calendarEngine.js`)
Replaces naive weekend skipping with dynamic calendar evaluation:
1. **`isWorkingDay(dateStr, calendar)`**:
   - Returns `true` if `dateStr` is explicitly in `overtimeDays`.
   - Returns `false` if `dateStr` is in `holidays`.
   - Returns `true` if day of week is in `workingDays`.
2. **`addWorkingDays(startDateStr, days, calendar)`**: Advances date step-by-step counting only valid working days according to `isWorkingDay`.
3. **`getWorkingDays(startDateStr, endDateStr, calendar)`**: Counts exact working days between two dates inclusive.

### Dependency Engine & CPM Scheduler (`js/engine/dependencyEngine.js`)
1. **WBS Hierarchy Calculation**:
   - Recursively traverses task tree, assigning WBS strings (`1.1.1`).
   - Summary task progress is calculated from children; summary baseline dates remain snapshots and projected dates roll up separately.
2. **Predecessor String Parser**:
   - Parses regex `^([\w.]+)(FS|SS|FF|SF)?(?:([+-])(\d+)[dD]?)?$` supporting 4 dependency types and lead/lag offsets.
3. **Projected Scheduling (Forward Pass)**:
   - Recomputes projected dates from stable baseline planning anchors and predecessor projected dates; it never rewrites baseline display dates:
     - **FS (Finish-to-Start)**: $\text{Start} = \text{Pred.Finish} + 1 + \text{Lag}$
     - **SS (Start-to-Start)**: $\text{Start} = \text{Pred.Start} + \text{Lag}$
     - **FF (Finish-to-Finish)**: $\text{Finish} = \text{Pred.Finish} + \text{Lag} \implies \text{Start} = \text{Finish} - \text{Duration}$
     - **SF (Start-to-Finish)**: $\text{Finish} = \text{Pred.Start} + \text{Lag} \implies \text{Start} = \text{Finish} - \text{Duration}$
4. **Overdue Forecast and Actual Predecessors**:
   - Incomplete activities with planned finish before local today project from today using remaining duration estimated from duration/progress; manual delay days are applied.
   - Successors use an actual predecessor date when entered for completed work, otherwise projected dates. FS/SS/FF/SF constraints and summary rollups use the project calendar.
5. **Critical Path Method (CPM Backward Pass)**:
   - Computes float/slack. Tasks on the project path with zero float or driving the project finish date are flagged as `isCritical = true`.

### Baseline Engine (`js/engine/baselineEngine.js`)
- **`captureBaseline(tasks)`**: Captures actual dates for completed activities (projected fallback) and projected dates for unfinished activities; the new snapshot becomes the planning anchor.
- **`setActiveBaseline(tasks, id)`**: Changes the baseline snapshot displayed in `start`/`finish` without affecting projected dates.
- **`getVariance(task)`**: Compares actual dates for completed activities or projected dates for unfinished activities against the selected baseline.

---

## 🎨 3. View & Rendering Layer

### WBS Grid View (`js/views/wbsGridView.js`)
- Renders hierarchical spreadsheet table with expandable/collapsible summary rows.
- Inline input listeners update model state on field edits.
- Delay input triggers forecast recalculation; overdue status is shown separately from the editable status pill. The WBS-adjacent notes icon is conditional on saved notes, while the toolbar action creates/edits notes.
- Multi-engineer popover assignment modal allows checking engineers and assigning fractional units (`25%`, `50%`, `75%`, `100%`).
- `+ Add Custom...` inline option prompts user to write in custom Streams, Stages, or Status pills.

### Gantt View (`js/views/ganttView.js`)
- Custom SVG canvas timeline synchronized with WBS grid vertical scrolling.
- **Date-to-Pixel Projection**: $x = (\text{Date} - \text{StartDate}) \times \text{dayWidth}$.
- **SVG Dependency Connectors**: Renders orthogonal `<path>` lines with arrowhead markers (`#arrowhead-slate`, `#arrowhead-red`).
- **Baseline Shadow Ghost Bars**: Translucent shadow bars rendered below active task bars.
- **Projected/actual & overdue**: Bars show actual dates for completed tasks when recorded and projected dates otherwise; baseline shadows remain separate.
- **Projection-only Drag & Drop**: Drag/resize writes projection constraints/duration, never selected-baseline dates. Timeline bounds include today and both selected-baseline endpoints.

### Resource View (`js/views/resourceView.js`)
- Team Engineer Pool table + 21-day Fractional Workload Heatmap matrix.
- Iterates over `task.getAssignedResources()` and sums allocation `units` per engineer per date.
- Highlights overallocated cells ($>100\%$) in **Bold Red**.

### Dependency Tree / PERT View (`js/views/dependencyTreeView.js`)
- Renders an interactive Network Diagram (PERT flowchart) of tasks grouped by stage columns.
- Draws predecessor link badges and outlines Critical Path tasks in bold red outline.

### Info & Guide View (`js/views/infoGuideView.js`)
- Interactive help dashboard with a complete Glossary of Abbreviations and a 6-step User Manual.

---

## 💾 4. Storage, Export & Bundling

### Project Store (`js/storage/projectStore.js`)
- Auto-saves state to `localStorage` under `hardware_pm_project_data`.
- Export/Import `.prj` native JSON files containing version metadata, project title, tasks, resources, and calendar configuration.

### Excel Exporter (`js/export/excelExporter.js`)
- Integrates SheetJS (`xlsx.full.min.js`) to export multi-tab Excel (`.xlsx`) workbooks:
  1. `WBS Tasks`
  2. `Milestones`
  3. `Team Resources`
  4. `Project Calendar`

### Production Bundler (`build.py`)
- Reads `index.html` and `css/styles.css`.
- Topologically bundles all 17 JavaScript ES modules, strips module import/export keywords, and inlines CSS and JS into a single standalone distribution file: `dist/HardwarePM.html`.

