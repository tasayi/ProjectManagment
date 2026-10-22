/**
 * Main Application Bootstrap & State Controller for Project Management Tool
 */

import { Task } from './models/taskModel.js';
import { Resource, DEFAULT_RESOURCES } from './models/resourceModel.js';
import { ProjectCalendar } from './models/calendarModel.js';
import { DependencyEngine } from './engine/dependencyEngine.js';
import { BaselineEngine } from './engine/baselineEngine.js';
import { WbsGridView } from './views/wbsGridView.js';
import { GanttView } from './views/ganttView.js';
import { MilestonesView } from './views/milestonesView.js';
import { ResourceView } from './views/resourceView.js';
import { CalendarModalView } from './views/calendarModalView.js';
import { DependencyTreeView } from './views/dependencyTreeView.js';
import { InfoGuideView } from './views/infoGuideView.js';
import { ProjectStore } from './storage/projectStore.js';
import { ExcelExporter } from './export/excelExporter.js';
import { PrintEngine } from './export/printEngine.js';

class ProjectManagementApp {
    constructor() {
        this.projectTitle = 'Project Management Schedule';
        this.tasks = [];
        this.resources = DEFAULT_RESOURCES;
        this.calendar = new ProjectCalendar();

        this.activeView = 'split'; // 'split', 'resources', 'deptree', 'milestones', or 'info'
        this.selectedTaskId = null;

        // View Instances
        this.wbsView = null;
        this.ganttView = null;
        this.milestonesView = null;
        this.resourceView = null;
        this.calendarModalView = null;
        this.deptreeView = null;
        this.infoGuideView = null;
    }

    init() {
        console.log('Initializing Project Management Application...');

        // Load saved state or default sample preset
        const saved = ProjectStore.loadFromLocalStorage();
        if (saved && saved.tasks && saved.tasks.length > 0) {
            this.projectTitle = saved.title;
            this.tasks = saved.tasks;
            if (saved.resources && saved.resources.length > 0) this.resources = saved.resources;
            if (saved.calendar) this.calendar = saved.calendar;
        } else {
            const preset = ProjectStore.getSamplePreset('iot_device');
            this.projectTitle = preset.title;
            this.tasks = preset.tasks;
            this.resources = preset.resources;
            this.calendar = preset.calendar;
        }

        // Initialize Engine & View Components
        DependencyEngine.scheduleProject(this.tasks, this.calendar);

        const wbsContainer = document.getElementById('wbs-pane');
        const ganttContainer = document.getElementById('gantt-pane');
        const milestonesContainer = document.getElementById('milestones-view-container');
        const resourceContainer = document.getElementById('resource-view-container');
        const deptreeContainer = document.getElementById('deptree-view-container');
        const infoGuideContainer = document.getElementById('info-guide-view-container');
        const calendarModalContainer = document.getElementById('calendar-modal-container');

        this.wbsView = new WbsGridView(wbsContainer, (taskId, action, value) => this.handleTaskChange(taskId, action, value), (taskId) => this.handleTaskSelect(taskId));
        this.ganttView = new GanttView(ganttContainer, (taskId) => this.handleGanttUpdate(taskId));
        this.milestonesView = new MilestonesView(milestonesContainer);
        this.deptreeView = new DependencyTreeView(deptreeContainer);
        this.infoGuideView = new InfoGuideView(infoGuideContainer);
        
        this.resourceView = new ResourceView(resourceContainer, (updatedRes) => {
            this.resources = updatedRes;
            this.renderAllViews();
        });
        
        this.calendarModalView = new CalendarModalView(calendarModalContainer, (updatedCal) => {
            this.calendar = updatedCal;
            DependencyEngine.scheduleProject(this.tasks, this.calendar);
            this.renderAllViews();
        });

        // Bind DOM Controls & Splitter
        this.bindHeaderControls();
        this.initSplitPaneResizer();

        // Render Initial UI
        this.renderAllViews();
    }

    renderAllViews() {
        // Update Title Input
        const titleInput = document.getElementById('project-title-input');
        if (titleInput) titleInput.value = this.projectTitle;

        // Update Baseline selector and KPI Summary Pill in Header
        const baselineSelect = document.getElementById('baseline-select');
        if (baselineSelect) {
            const list = BaselineEngine.getBaselines(this.tasks);
            const activeId = BaselineEngine.getActiveBaselineId(this.tasks);
            baselineSelect.innerHTML = '<option value="">No baseline</option>' + list.map(b =>
                `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${b.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</option>`
            ).join('');
        }
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

        // View Visibility Routing
        const splitContainer = document.getElementById('split-view-container');
        const milestonesContainer = document.getElementById('milestones-view-container');
        const resourceContainer = document.getElementById('resource-view-container');
        const deptreeContainer = document.getElementById('deptree-view-container');
        const infoGuideContainer = document.getElementById('info-guide-view-container');

        if (this.activeView === 'split') {
            if (splitContainer) splitContainer.style.display = 'flex';
            if (milestonesContainer) milestonesContainer.style.display = 'none';
            if (resourceContainer) resourceContainer.style.display = 'none';
            if (deptreeContainer) deptreeContainer.style.display = 'none';
            if (infoGuideContainer) infoGuideContainer.style.display = 'none';

            this.wbsView.render(this.tasks, this.resources);
            this.ganttView.render(this.tasks, this.calendar);
        } else if (this.activeView === 'resources') {
            if (splitContainer) splitContainer.style.display = 'none';
            if (milestonesContainer) milestonesContainer.style.display = 'none';
            if (resourceContainer) resourceContainer.style.display = 'block';
            if (deptreeContainer) deptreeContainer.style.display = 'none';
            if (infoGuideContainer) infoGuideContainer.style.display = 'none';

            this.resourceView.render(this.resources, this.tasks);
        } else if (this.activeView === 'deptree') {
            if (splitContainer) splitContainer.style.display = 'none';
            if (milestonesContainer) milestonesContainer.style.display = 'none';
            if (resourceContainer) resourceContainer.style.display = 'none';
            if (deptreeContainer) deptreeContainer.style.display = 'block';
            if (infoGuideContainer) infoGuideContainer.style.display = 'none';

            this.deptreeView.render(this.tasks);
        } else if (this.activeView === 'info') {
            if (splitContainer) splitContainer.style.display = 'none';
            if (milestonesContainer) milestonesContainer.style.display = 'none';
            if (resourceContainer) resourceContainer.style.display = 'none';
            if (deptreeContainer) deptreeContainer.style.display = 'none';
            if (infoGuideContainer) infoGuideContainer.style.display = 'block';

            this.infoGuideView.render();
        } else {
            if (splitContainer) splitContainer.style.display = 'none';
            if (milestonesContainer) milestonesContainer.style.display = 'block';
            if (resourceContainer) resourceContainer.style.display = 'none';
            if (deptreeContainer) deptreeContainer.style.display = 'none';
            if (infoGuideContainer) infoGuideContainer.style.display = 'none';

            this.milestonesView.render(this.tasks);
        }

        // Auto-save to LocalStorage
        ProjectStore.saveToLocalStorage(this.projectTitle, this.tasks, this.resources, this.calendar);
    }

    handleTaskChange(taskId, actionOrField, value) {
        if (!actionOrField) return;

        if (actionOrField === 'add-task' || actionOrField === 'add-milestone') {
            const isMs = actionOrField === 'add-milestone';
            let parentId = null;
            let stage = 'EVT';
            let workstream = 'HW';
            let insertIndex = this.tasks.length;
            let startDate = new Date().toISOString().split('T')[0];

            if (this.selectedTaskId) {
                const selectedIndex = this.tasks.findIndex(t => t.id === this.selectedTaskId);
                if (selectedIndex !== -1) {
                    const selectedTask = this.tasks[selectedIndex];
                    parentId = selectedTask.parentId || null;
                    stage = selectedTask.stage || 'EVT';
                    workstream = selectedTask.workstream || 'HW';
                    startDate = selectedTask.start || startDate;

                    // Insert after selected task and all of its recursive child descendants
                    insertIndex = selectedIndex + 1;
                    while (insertIndex < this.tasks.length) {
                        if (this.isDescendantOf(this.tasks[insertIndex], selectedTask.id)) {
                            insertIndex++;
                        } else {
                            break;
                        }
                    }
                }
            } else if (this.tasks.length > 0) {
                const lastTask = this.tasks[this.tasks.length - 1];
                parentId = lastTask.parentId || null;
                stage = lastTask.stage || 'EVT';
                workstream = lastTask.workstream || 'HW';
                startDate = lastTask.start || startDate;
            }

            const newTask = new Task({
                name: isMs ? 'New Milestone' : 'New Activity',
                stage: stage,
                workstream: workstream,
                parentId: parentId,
                duration: isMs ? 0 : 5,
                isMilestone: isMs,
                start: startDate
            });

            this.tasks.splice(insertIndex, 0, newTask);
            this.selectedTaskId = newTask.id;
        } else if (actionOrField === 'indent' && taskId) {
            this.indentTask(taskId);
        } else if (actionOrField === 'outdent' && taskId) {
            this.outdentTask(taskId);
        } else if (actionOrField === 'move' && taskId) {
            this.moveTask(taskId, value.targetId, value.position);
        } else if (actionOrField === 'delete' && taskId) {
            if (confirm('Delete selected activity and any subtasks?')) {
                this.deleteTaskRecursive(taskId);
            }
        } else {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task[actionOrField] = value;
                if (actionOrField === 'duration') task.isMilestone = value === 0;
            }
        }

        DependencyEngine.scheduleProject(this.tasks, this.calendar);
        this.renderAllViews();
    }

    isDescendantOf(candidateTask, ancestorId) {
        if (!candidateTask || !candidateTask.parentId) return false;
        let currentParentId = candidateTask.parentId;
        while (currentParentId) {
            if (currentParentId === ancestorId) return true;
            const parent = this.tasks.find(t => t.id === currentParentId);
            currentParentId = parent ? parent.parentId : null;
        }
        return false;
    }

    handleGanttUpdate(taskId) {
        DependencyEngine.scheduleProject(this.tasks, this.calendar);
        this.renderAllViews();
    }

    handleTaskSelect(taskId) {
        this.selectedTaskId = taskId;
    }

    /**
     * Move a task (with its subtasks) before/after a target task; predecessor references follow the new WBS numbers
     */
    moveTask(dragId, targetId, position) {
        if (dragId === targetId) return;
        const dragged = this.tasks.find(t => t.id === dragId);
        const target = this.tasks.find(t => t.id === targetId);
        if (!dragged || !target || this.isDescendantOf(target, dragId)) return;

        const parsed = new Map(this.tasks.map(t => [t.id, DependencyEngine.parsePredecessors(t.predecessors, this.tasks)]));

        const block = this.tasks.filter(t => t.id === dragId || this.isDescendantOf(t, dragId));
        const blockIds = new Set(block.map(t => t.id));
        const rest = this.tasks.filter(t => !blockIds.has(t.id));

        let insertAt = rest.findIndex(t => t.id === targetId);
        if (position === 'after') {
            insertAt++;
            while (insertAt < rest.length && this.isDescendantOf(rest[insertAt], targetId)) insertAt++;
        }

        dragged.parentId = target.parentId || null;
        rest.splice(insertAt, 0, ...block);
        this.tasks = rest;

        DependencyEngine.updateWBSHierarchy(this.tasks, this.calendar);
        this.tasks.forEach(t => {
            const preds = parsed.get(t.id) || [];
            if (preds.length === 0) return;
            t.predecessors = preds.map(p => {
                const lag = p.lag > 0 ? `+${p.lag}d` : (p.lag < 0 ? `${p.lag}d` : '');
                return `${p.targetTask.wbs}${p.type}${lag}`;
            }).join(', ');
        });
        this.selectedTaskId = dragId;
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
        // Project Title
        const titleInput = document.getElementById('project-title-input');
        if (titleInput) {
            titleInput.onchange = (e) => {
                this.projectTitle = e.target.value;
                ProjectStore.saveToLocalStorage(this.projectTitle, this.tasks, this.resources, this.calendar);
            };
        }

        // View Mode Switcher
        const btnSplit = document.getElementById('view-btn-split');
        const btnResources = document.getElementById('view-btn-resources');
        const btnDeptree = document.getElementById('view-btn-deptree');
        const btnMilestones = document.getElementById('view-btn-milestones');
        const btnInfo = document.getElementById('view-btn-info');

        const updateViewBtns = (active) => {
            this.activeView = active;
            [
                { btn: btnSplit, name: 'split' },
                { btn: btnResources, name: 'resources' },
                { btn: btnDeptree, name: 'deptree' },
                { btn: btnMilestones, name: 'milestones' },
                { btn: btnInfo, name: 'info' }
            ].forEach(item => {
                if (item.btn) {
                    item.btn.className = item.name === active
                        ? 'px-3 py-1 bg-indigo-600 text-white rounded font-medium text-xs shadow-sm'
                        : 'px-3 py-1 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded font-medium text-xs';
                }
            });
            this.renderAllViews();
        };

        if (btnSplit) btnSplit.onclick = () => updateViewBtns('split');
        if (btnResources) btnResources.onclick = () => updateViewBtns('resources');
        if (btnDeptree) btnDeptree.onclick = () => updateViewBtns('deptree');
        if (btnMilestones) btnMilestones.onclick = () => updateViewBtns('milestones');
        if (btnInfo) btnInfo.onclick = () => updateViewBtns('info');

        // Calendar Config Modal Trigger
        const btnCalendarConfig = document.getElementById('btn-calendar-config');
        if (btnCalendarConfig) {
            btnCalendarConfig.onclick = () => {
                this.calendarModalView.render(this.calendar);
            };
        }

        // Baseline Controls
        const btnSetBaseline = document.getElementById('btn-set-baseline');
        if (btnSetBaseline) {
            btnSetBaseline.onclick = () => {
                const next = BaselineEngine.getBaselines(this.tasks).length;
                const label = prompt('Name for the new baseline (previous baselines are kept):', `Baseline ${next}`);
                if (label === null) return;
                BaselineEngine.captureBaseline(this.tasks, label);
                this.renderAllViews();
            };
        }

        const baselineSelect = document.getElementById('baseline-select');
        if (baselineSelect) {
            baselineSelect.onchange = (e) => {
                const v = e.target.value;
                BaselineEngine.setActiveBaseline(this.tasks, v === '' ? null : parseInt(v, 10));
                this.renderAllViews();
            };
        }

        // Import / Export Controls
        const btnExportPrj = document.getElementById('btn-export-prj');
        if (btnExportPrj) {
            btnExportPrj.onclick = () => ProjectStore.exportProjectFile(this.projectTitle, this.tasks, this.resources, this.calendar);
        }

        const btnExportExcel = document.getElementById('btn-export-excel');
        if (btnExportExcel) {
            btnExportExcel.onclick = () => ExcelExporter.exportToExcel(this.projectTitle, this.tasks, this.resources, this.calendar);
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
                            this.resources = imported.resources;
                            this.calendar = imported.calendar;
                            DependencyEngine.scheduleProject(this.tasks, this.calendar);
                            this.renderAllViews();
                        }
                    };
                    reader.readAsText(file);
                }
            };
        }

        // Presets & New Project Dropdown
        const presetSelect = document.getElementById('preset-select');
        if (presetSelect) {
            presetSelect.onchange = (e) => {
                const presetId = e.target.value;
                if (!presetId) return;

                const loadPresetAction = () => {
                    const preset = ProjectStore.getSamplePreset(presetId);
                    if (preset) {
                        this.projectTitle = preset.title;
                        this.tasks = preset.tasks;
                        this.resources = preset.resources;
                        this.calendar = preset.calendar;
                        DependencyEngine.scheduleProject(this.tasks, this.calendar);
                        this.renderAllViews();
                    }
                };

                const saveFirst = confirm('WARNING: Creating a new project or loading a preset will replace current project data.\n\nClick "OK" to SAVE current project (.prj) first before proceeding, or "Cancel" to choose options.');
                if (saveFirst) {
                    ProjectStore.exportProjectFile(this.projectTitle, this.tasks, this.resources, this.calendar);
                    loadPresetAction();
                } else {
                    if (confirm('Proceed to load new project WITHOUT saving current data?')) {
                        loadPresetAction();
                    }
                }
                e.target.value = '';
            };
        }

        // Targeted Print Dropdown
        const printSelect = document.getElementById('print-select');
        if (printSelect) {
            printSelect.onchange = (e) => {
                const target = e.target.value;
                if (target) {
                    PrintEngine.printView(target, {
                        title: this.projectTitle,
                        tasks: this.tasks,
                        calendar: this.calendar,
                        zoom: this.ganttView ? this.ganttView.zoom : 'Week',
                        showCriticalPath: this.ganttView ? this.ganttView.showCriticalPath : false
                    });
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

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ProjectManagementApp();
    window.app.init();
});
