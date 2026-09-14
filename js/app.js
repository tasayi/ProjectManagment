/**
 * Main Application Bootstrap & State Controller for Hardware PM Tool
 */

import { Task } from './models/taskModel.js';
import { DependencyEngine } from './engine/dependencyEngine.js';
import { BaselineEngine } from './engine/baselineEngine.js';
import { WbsGridView } from './views/wbsGridView.js';
import { GanttView } from './views/ganttView.js';
import { MilestonesView } from './views/milestonesView.js';
import { ProjectStore } from './storage/projectStore.js';
import { ExcelExporter } from './export/excelExporter.js';
import { PrintEngine } from './export/printEngine.js';

class HardwarePMApp {
    constructor() {
        this.projectTitle = 'Hardware & Firmware R&D Project';
        this.tasks = [];
        this.activeView = 'split'; // 'split' or 'milestones'
        this.selectedTaskId = null;

        // View Instances
        this.wbsView = null;
        this.ganttView = null;
        this.milestonesView = null;
    }

    init() {
        console.log('Initializing Hardware PM Application...');

        // Load saved state or default sample preset
        const saved = ProjectStore.loadFromLocalStorage();
        if (saved && saved.tasks && saved.tasks.length > 0) {
            this.projectTitle = saved.title;
            this.tasks = saved.tasks;
        } else {
            const preset = ProjectStore.getSamplePreset('iot_device');
            this.projectTitle = preset.title;
            this.tasks = preset.tasks;
        }

        // Initialize Engine & View Components
        DependencyEngine.scheduleProject(this.tasks);

        const wbsContainer = document.getElementById('wbs-pane');
        const ganttContainer = document.getElementById('gantt-pane');
        const milestonesContainer = document.getElementById('milestones-view-container');

        this.wbsView = new WbsGridView(wbsContainer, (taskId, action, value) => this.handleTaskChange(taskId, action, value), (taskId) => this.handleTaskSelect(taskId));
        this.ganttView = new GanttView(ganttContainer, (taskId) => this.handleGanttUpdate(taskId));
        this.milestonesView = new MilestonesView(milestonesContainer);

        // Bind DOM Events
        this.bindHeaderControls();
        this.initSplitPaneResizer();

        // Render Initial UI
        this.renderAllViews();
    }

    renderAllViews() {
        // Update Title Input
        const titleInput = document.getElementById('project-title-input');
        if (titleInput) titleInput.value = this.projectTitle;

        // Update Baseline KPI Summary Pill in Header
        const metrics = BaselineEngine.getProjectBaselineMetrics(this.tasks);
        const kpiBadge = document.getElementById('header-baseline-kpi');
        if (kpiBadge) {
            if (metrics.hasBaseline) {
                if (metrics.delayedTasksCount > 0) {
                    kpiBadge.className = 'px-2.5 py-1 bg-red-100 text-red-700 rounded font-semibold text-xs border border-red-300';
                    kpiBadge.textContent = `Baseline: ${metrics.delayedTasksCount} tasks delayed (Max +${metrics.maxDelayDays}d)`;
                } else {
                    kpiBadge.className = 'px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded font-semibold text-xs border border-emerald-300';
                    kpiBadge.textContent = 'Baseline: All tasks on schedule';
                }
            } else {
                kpiBadge.className = 'px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-xs border border-slate-300';
                kpiBadge.textContent = 'Baseline: Not Set';
            }
        }

        if (this.activeView === 'split') {
            document.getElementById('split-view-container').style.display = 'flex';
            document.getElementById('milestones-view-container').style.display = 'none';

            this.wbsView.render(this.tasks);
            this.ganttView.render(this.tasks);
        } else {
            document.getElementById('split-view-container').style.display = 'none';
            document.getElementById('milestones-view-container').style.display = 'block';

            this.milestonesView.render(this.tasks);
        }

        // Auto-save to LocalStorage
        ProjectStore.saveToLocalStorage(this.projectTitle, this.tasks);
    }

    handleTaskChange(taskId, actionOrField, value) {
        if (!actionOrField) return;

        if (actionOrField === 'add-task') {
            const newTask = new Task({
                name: 'New Hardware Task',
                stage: 'EVT',
                workstream: 'HW',
                duration: 5,
                start: new Date().toISOString().split('T')[0]
            });
            this.tasks.push(newTask);
        } else if (actionOrField === 'add-subtask' && taskId) {
            const parent = this.tasks.find(t => t.id === taskId);
            if (parent) {
                parent.isSummary = true;
                parent.expanded = true;
                const subtask = new Task({
                    name: `Subtask of ${parent.name}`,
                    stage: parent.stage,
                    workstream: parent.workstream,
                    parentId: parent.id,
                    duration: 3,
                    start: parent.start
                });
                this.tasks.push(subtask);
            }
        } else if (actionOrField === 'indent' && taskId) {
            this.indentTask(taskId);
        } else if (actionOrField === 'outdent' && taskId) {
            this.outdentTask(taskId);
        } else if (actionOrField === 'delete' && taskId) {
            if (confirm('Delete selected activity and any subtasks?')) {
                this.deleteTaskRecursive(taskId);
            }
        } else {
            // Field edit (e.g. name, duration, start, predecessors, workstream, status)
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task[actionOrField] = value;
                if (actionOrField === 'duration' || actionOrField === 'start') {
                    task.finish = task.calculateFinishDate(task.start, task.duration);
                }
            }
        }

        // Run Predecessor Engine & Schedule
        DependencyEngine.scheduleProject(this.tasks);
        this.renderAllViews();
    }

    handleGanttUpdate(taskId) {
        // Called when dates are modified via Gantt drag and drop
        DependencyEngine.scheduleProject(this.tasks);
        this.renderAllViews();
    }

    handleTaskSelect(taskId) {
        this.selectedTaskId = taskId;
    }

    indentTask(taskId) {
        const index = this.tasks.findIndex(t => t.id === taskId);
        if (index <= 0) return;

        const task = this.tasks[index];
        const prevTask = this.tasks[index - 1];

        if (prevTask) {
            task.parentId = prevTask.id;
            prevTask.isSummary = true;
            prevTask.expanded = true;
        }
    }

    outdentTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task || !task.parentId) return;

        const parent = this.tasks.find(t => t.id === task.parentId);
        task.parentId = parent ? parent.parentId : null;
    }

    deleteTaskRecursive(taskId) {
        const toDelete = new Set([taskId]);
        let added = true;
        while (added) {
            added = false;
            this.tasks.forEach(t => {
                if (t.parentId && toDelete.has(t.parentId) && !toDelete.has(t.id)) {
                    toDelete.add(t.id);
                    added = true;
                }
            });
        }
        this.tasks = this.tasks.filter(t => !toDelete.has(t.id));
    }

    bindHeaderControls() {
        // Project Title Change
        const titleInput = document.getElementById('project-title-input');
        if (titleInput) {
            titleInput.onchange = (e) => {
                this.projectTitle = e.target.value;
                ProjectStore.saveToLocalStorage(this.projectTitle, this.tasks);
            };
        }

        // View Mode Toggle (Split View vs Milestones Roadmap)
        const btnSplit = document.getElementById('view-btn-split');
        const btnMilestones = document.getElementById('view-btn-milestones');

        if (btnSplit) {
            btnSplit.onclick = () => {
                this.activeView = 'split';
                btnSplit.className = 'px-3 py-1 bg-indigo-600 text-white rounded font-medium text-xs shadow-sm';
                if (btnMilestones) btnMilestones.className = 'px-3 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded font-medium text-xs';
                this.renderAllViews();
            };
        }

        if (btnMilestones) {
            btnMilestones.onclick = () => {
                this.activeView = 'milestones';
                btnMilestones.className = 'px-3 py-1 bg-indigo-600 text-white rounded font-medium text-xs shadow-sm';
                if (btnSplit) btnSplit.className = 'px-3 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded font-medium text-xs';
                this.renderAllViews();
            };
        }

        // Baseline Controls
        const btnSetBaseline = document.getElementById('btn-set-baseline');
        if (btnSetBaseline) {
            btnSetBaseline.onclick = () => {
                if (confirm('Set current project schedule as the target Baseline?')) {
                    BaselineEngine.captureBaseline(this.tasks);
                    this.renderAllViews();
                }
            };
        }

        // Import / Export Controls
        const btnExportPrj = document.getElementById('btn-export-prj');
        if (btnExportPrj) {
            btnExportPrj.onclick = () => ProjectStore.exportProjectFile(this.projectTitle, this.tasks);
        }

        const btnExportExcel = document.getElementById('btn-export-excel');
        if (btnExportExcel) {
            btnExportExcel.onclick = () => ExcelExporter.exportToExcel(this.projectTitle, this.tasks);
        }

        const btnImportPrj = document.getElementById('btn-import-prj');
        const fileInput = document.getElementById('prj-file-input');

        if (btnImportPrj && fileInput) {
            btnImportPrj.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const imported = ProjectStore.importProjectFile(evt.target.result);
                        if (imported) {
                            this.projectTitle = imported.title;
                            this.tasks = imported.tasks;
                            this.renderAllViews();
                        }
                    };
                    reader.readAsText(file);
                }
            };
        }

        // Presets Dropdown
        const presetSelect = document.getElementById('preset-select');
        if (presetSelect) {
            presetSelect.onchange = (e) => {
                const presetId = e.target.value;
                if (presetId) {
                    if (confirm('Load sample project preset? Any unsaved changes will be replaced.')) {
                        const preset = ProjectStore.getSamplePreset(presetId);
                        this.projectTitle = preset.title;
                        this.tasks = preset.tasks;
                        this.renderAllViews();
                    }
                    e.target.value = '';
                }
            };
        }

        // Targeted Print Dropdown
        const printSelect = document.getElementById('print-select');
        if (printSelect) {
            printSelect.onchange = (e) => {
                const target = e.target.value;
                if (target) {
                    PrintEngine.printView(target);
                    e.target.value = '';
                }
            };
        }
    }

    initSplitPaneResizer() {
        const resizer = document.getElementById('split-resizer');
        const leftPane = document.getElementById('wbs-pane');
        const container = document.getElementById('split-view-container');

        if (!resizer || !leftPane || !container) return;

        let isDragging = false;

        resizer.onmousedown = (e) => {
            isDragging = true;
            resizer.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';

            document.onmousemove = (evt) => {
                if (!isDragging) return;
                const containerRect = container.getBoundingClientRect();
                const newLeftWidth = evt.clientX - containerRect.left;
                const clampedWidth = Math.max(300, Math.min(newLeftWidth, containerRect.width - 300));
                leftPane.style.width = `${clampedWidth}px`;
            };

            document.onmouseup = () => {
                isDragging = false;
                resizer.classList.remove('is-dragging');
                document.body.style.cursor = 'default';
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
    }
}

// Bootstrap App when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HardwarePMApp();
    window.app.init();
});

