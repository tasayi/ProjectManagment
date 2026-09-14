/**
 * WBS Grid View: Spreadsheet-like Activity Table with Tree Hierarchy, Inline Editing, Status Pills & Engineer Assignments
 */

import { WORKSTREAMS, HARDWARE_STAGES, STATUS_PILLS } from '../models/taskModel.js';
import { BaselineEngine } from '../engine/baselineEngine.js';

export class WbsGridView {
    constructor(containerElement, onTaskChange, onTaskSelect) {
        this.container = containerElement;
        this.onTaskChange = onTaskChange; // Callback when data changes
        this.onTaskSelect = onTaskSelect; // Callback when row selected
        this.selectedTaskId = null;
        this.resources = [];
        this.visibleColumns = {
            workstream: true,
            stage: true,
            status: true,
            assignedTo: true,
            duration: true,
            dates: true,
            predecessors: true,
            leadTime: true,
            variance: true
        };
    }

    render(tasks, resources = []) {
        if (!this.container) return;

        this.tasks = tasks;
        this.resources = resources;

        const html = `
            <div class="wbs-grid-container flex flex-col h-full bg-white border-r border-slate-200 overflow-hidden select-none">
                <!-- Grid Header Toolbar -->
                <div class="wbs-toolbar flex items-center justify-between p-2 bg-slate-50 border-b border-slate-200 text-xs gap-1 flex-wrap">
                    <div class="flex items-center gap-1">
                        <button id="btn-add-task" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium flex items-center gap-1 shadow-sm transition">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            Add Activity
                        </button>
                        <button id="btn-add-subtask" class="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium flex items-center gap-1 shadow-sm transition disabled:opacity-50" ${!this.selectedTaskId ? 'disabled' : ''}>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                            Subtask
                        </button>
                        <div class="h-4 w-px bg-slate-300 mx-1"></div>
                        <button id="btn-indent" title="Indent (Make Child)" class="p-1 hover:bg-slate-200 text-slate-600 rounded transition disabled:opacity-40" ${!this.selectedTaskId ? 'disabled' : ''}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                        </button>
                        <button id="btn-outdent" title="Outdent (Promote Parent)" class="p-1 hover:bg-slate-200 text-slate-600 rounded transition disabled:opacity-40" ${!this.selectedTaskId ? 'disabled' : ''}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
                        </button>
                        <button id="btn-delete" title="Delete Selected" class="p-1 hover:bg-red-100 text-red-600 rounded transition disabled:opacity-40" ${!this.selectedTaskId ? 'disabled' : ''}>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>

                    <!-- Filter / Search -->
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <input type="text" id="wbs-search" placeholder="Search tasks..." class="w-32 focus:w-44 transition-all text-xs pl-7 pr-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500">
                            <svg class="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        </div>
                    </div>
                </div>

                <!-- Table Content Container -->
                <div class="wbs-table-wrapper flex-1 overflow-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-100 sticky top-0 z-10 shadow-sm border-b border-slate-300 text-slate-600 font-semibold uppercase tracking-wider">
                            <tr>
                                <th class="py-2 px-2 w-12 text-center border-r border-slate-200">WBS</th>
                                <th class="py-2 px-3 min-w-[180px] border-r border-slate-200">Activity Name</th>
                                ${this.visibleColumns.workstream ? '<th class="py-2 px-2 w-24 border-r border-slate-200">Stream</th>' : ''}
                                ${this.visibleColumns.stage ? '<th class="py-2 px-2 w-16 border-r border-slate-200">Stage</th>' : ''}
                                ${this.visibleColumns.assignedTo ? '<th class="py-2 px-2 w-28 border-r border-slate-200">Assigned Engineer</th>' : ''}
                                ${this.visibleColumns.status ? '<th class="py-2 px-2 w-24 border-r border-slate-200">Status</th>' : ''}
                                ${this.visibleColumns.duration ? '<th class="py-2 px-2 w-16 text-center border-r border-slate-200">Dur (d)</th>' : ''}
                                ${this.visibleColumns.leadTime ? '<th class="py-2 px-2 w-16 text-center border-r border-slate-200" title="Procurement Lead Time">Lead (d)</th>' : ''}
                                ${this.visibleColumns.dates ? '<th class="py-2 px-2 w-24 border-r border-slate-200">Start</th>' : ''}
                                ${this.visibleColumns.dates ? '<th class="py-2 px-2 w-24 border-r border-slate-200">Finish</th>' : ''}
                                ${this.visibleColumns.predecessors ? '<th class="py-2 px-2 w-24 border-r border-slate-200">Predecessors</th>' : ''}
                                ${this.visibleColumns.variance ? '<th class="py-2 px-2 w-24 text-center border-r border-slate-200">Variance</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="wbs-tbody" class="divide-y divide-slate-200 font-normal text-slate-800 bg-white">
                            ${this.renderRows(tasks)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    renderRows(tasks) {
        if (!tasks || tasks.length === 0) {
            return `<tr><td colspan="12" class="p-6 text-center text-slate-400 italic">No tasks found. Click "Add Activity" to create one.</td></tr>`;
        }

        const hiddenIds = new Set();
        const idMap = new Map(tasks.map(t => [t.id, t]));

        tasks.forEach(t => {
            if (t.parentId) {
                let parent = idMap.get(t.parentId);
                while (parent) {
                    if (parent.expanded === false) {
                        hiddenIds.add(t.id);
                        break;
                    }
                    parent = parent.parentId ? idMap.get(parent.parentId) : null;
                }
            }
        });

        return tasks.map(t => {
            if (hiddenIds.has(t.id)) return '';

            const isSelected = t.id === this.selectedTaskId;
            const variance = BaselineEngine.getVariance(t);
            const indentLevel = (t.wbs.split('.').length - 1) * 14;
            const wsInfo = WORKSTREAMS[t.workstream] || WORKSTREAMS['HW'];
            const statusInfo = STATUS_PILLS[t.status] || STATUS_PILLS['Not Started'];

            return `
                <tr data-id="${t.id}" class="wbs-row hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600 font-medium' : ''} ${t.isSummary ? 'font-semibold bg-slate-50/70' : ''}">
                    <!-- WBS -->
                    <td class="py-1.5 px-2 text-center text-slate-500 text-[11px] font-mono border-r border-slate-200">
                        ${t.wbs}
                    </td>

                    <!-- Activity Name -->
                    <td class="py-1 px-2 border-r border-slate-200 overflow-hidden">
                        <div class="flex items-center gap-1" style="padding-left: ${indentLevel}px;">
                            ${t.isSummary ? `
                                <button data-action="toggle-expand" data-id="${t.id}" class="p-0.5 hover:bg-slate-200 rounded text-slate-500 transition">
                                    <svg class="w-3.5 h-3.5 transform ${t.expanded ? 'rotate-90' : ''} transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                                </button>
                            ` : `
                                <span class="w-4 inline-block"></span>
                            `}
                            ${t.isMilestone ? `
                                <svg class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>
                            ` : ''}
                            <input type="text" data-field="name" data-id="${t.id}" value="${this.escapeHtml(t.name)}" class="w-full bg-transparent hover:bg-white focus:bg-white border-b border-transparent focus:border-indigo-500 px-1 py-0.5 rounded focus:outline-none text-xs truncate">
                        </div>
                    </td>

                    <!-- Workstream -->
                    ${this.visibleColumns.workstream ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <select data-field="workstream" data-id="${t.id}" class="w-full text-[11px] font-medium rounded px-1.5 py-0.5 border border-slate-200 focus:outline-none" style="background-color: ${wsInfo.bg}; color: ${wsInfo.color};">
                                ${Object.keys(WORKSTREAMS).map(ws => `
                                    <option value="${ws}" ${t.workstream === ws ? 'selected' : ''}>${ws}</option>
                                `).join('')}
                            </select>
                        </td>
                    ` : ''}

                    <!-- Stage -->
                    ${this.visibleColumns.stage ? `
                        <td class="py-1 px-1 border-r border-slate-200 text-center">
                            <select data-field="stage" data-id="${t.id}" class="text-[11px] font-medium bg-slate-100 border border-slate-200 rounded px-1 py-0.5 focus:outline-none">
                                ${HARDWARE_STAGES.map(stg => `
                                    <option value="${stg}" ${t.stage === stg ? 'selected' : ''}>${stg}</option>
                                `).join('')}
                            </select>
                        </td>
                    ` : ''}

                    <!-- Assigned Engineer -->
                    ${this.visibleColumns.assignedTo ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <select data-field="assignedTo" data-id="${t.id}" class="w-full text-[11px] font-medium border border-slate-200 rounded px-1 py-0.5 focus:outline-none bg-white">
                                <option value="">-- Unassigned --</option>
                                ${this.resources.map(r => `
                                    <option value="${r.name}" ${t.assignedTo === r.name ? 'selected' : ''}>${r.name}</option>
                                `).join('')}
                            </select>
                        </td>
                    ` : ''}

                    <!-- Status -->
                    ${this.visibleColumns.status ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <select data-field="status" data-id="${t.id}" class="w-full text-[11px] font-medium rounded px-1 py-0.5 border ${statusInfo.class} focus:outline-none">
                                ${Object.keys(STATUS_PILLS).map(st => `
                                    <option value="${st}" ${t.status === st ? 'selected' : ''}>${STATUS_PILLS[st].label}</option>
                                `).join('')}
                            </select>
                        </td>
                    ` : ''}

                    <!-- Duration -->
                    ${this.visibleColumns.duration ? `
                        <td class="py-1 px-1 text-center border-r border-slate-200">
                            <input type="number" min="0" max="365" data-field="duration" data-id="${t.id}" value="${t.duration}" ${t.isSummary ? 'disabled class="w-12 text-center bg-slate-100 text-slate-500 font-semibold rounded py-0.5 text-xs"' : 'class="w-12 text-center border border-slate-200 focus:border-indigo-500 rounded py-0.5 text-xs focus:outline-none"'}>
                        </td>
                    ` : ''}

                    <!-- Procurement Lead Time -->
                    ${this.visibleColumns.leadTime ? `
                        <td class="py-1 px-1 text-center border-r border-slate-200">
                            <input type="number" min="0" max="180" data-field="leadTime" data-id="${t.id}" value="${t.leadTime || 0}" class="w-12 text-center border border-amber-200 bg-amber-50/50 rounded py-0.5 text-xs focus:outline-none" title="Procurement lead time in days">
                        </td>
                    ` : ''}

                    <!-- Start Date -->
                    ${this.visibleColumns.dates ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <input type="date" data-field="start" data-id="${t.id}" value="${t.start}" ${t.isSummary ? 'disabled class="w-full bg-slate-100 text-slate-600 rounded py-0.5 text-[11px] text-center"' : 'class="w-full border border-slate-200 rounded py-0.5 text-[11px] text-center focus:outline-none"'}>
                        </td>
                    ` : ''}

                    <!-- Finish Date -->
                    ${this.visibleColumns.dates ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <input type="date" data-field="finish" data-id="${t.id}" value="${t.finish}" disabled class="w-full bg-slate-100 text-slate-600 rounded py-0.5 text-[11px] text-center">
                        </td>
                    ` : ''}

                    <!-- Predecessors -->
                    ${this.visibleColumns.predecessors ? `
                        <td class="py-1 px-1 border-r border-slate-200">
                            <input type="text" data-field="predecessors" data-id="${t.id}" value="${this.escapeHtml(t.predecessors || '')}" placeholder="e.g. 1FS+2d" class="w-full border border-slate-200 font-mono text-[11px] rounded px-1 py-0.5 focus:outline-none">
                        </td>
                    ` : ''}

                    <!-- Variance -->
                    ${this.visibleColumns.variance ? `
                        <td class="py-1 px-1 text-center border-r border-slate-200">
                            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${variance.badgeClass}">
                                ${variance.statusText}
                            </span>
                        </td>
                    ` : ''}
                </tr>
            `;
        }).join('');
    }

    attachEventListeners() {
        if (!this.container) return;

        // Row click selection
        this.container.querySelectorAll('.wbs-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (['INPUT', 'SELECT', 'BUTTON', 'SVG', 'PATH'].includes(e.target.tagName)) return;
                const id = row.getAttribute('data-id');
                this.selectTask(id);
            });
        });

        // Expand / Collapse
        this.container.querySelectorAll('[data-action="toggle-expand"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const task = this.tasks.find(t => t.id === id);
                if (task) {
                    task.expanded = !task.expanded;
                    this.render(this.tasks, this.resources);
                }
            });
        });

        // Input change handlers
        this.container.querySelectorAll('input[data-field], select[data-field]').forEach(element => {
            element.addEventListener('change', (e) => {
                const id = element.getAttribute('data-id');
                const field = element.getAttribute('data-field');
                let value = element.value;

                if (field === 'duration' || field === 'leadTime') {
                    value = parseInt(value, 10) || 0;
                }

                if (this.onTaskChange) {
                    this.onTaskChange(id, field, value);
                }
            });
        });

        // Toolbar buttons
        const addBtn = this.container.querySelector('#btn-add-task');
        if (addBtn) addBtn.onclick = () => this.onTaskChange(null, 'add-task');

        const subtaskBtn = this.container.querySelector('#btn-add-subtask');
        if (subtaskBtn) subtaskBtn.onclick = () => this.onTaskChange(this.selectedTaskId, 'add-subtask');

        const indentBtn = this.container.querySelector('#btn-indent');
        if (indentBtn) indentBtn.onclick = () => this.onTaskChange(this.selectedTaskId, 'indent');

        const outdentBtn = this.container.querySelector('#btn-outdent');
        if (outdentBtn) outdentBtn.onclick = () => this.onTaskChange(this.selectedTaskId, 'outdent');

        const deleteBtn = this.container.querySelector('#btn-delete');
        if (deleteBtn) deleteBtn.onclick = () => this.onTaskChange(this.selectedTaskId, 'delete');

        // Search filter
        const searchInput = this.container.querySelector('#wbs-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const query = e.target.value.toLowerCase().trim();
                this.filterTasks(query);
            };
        }
    }

    selectTask(taskId) {
        this.selectedTaskId = taskId;
        this.container.querySelectorAll('.wbs-row').forEach(r => {
            if (r.getAttribute('data-id') === taskId) {
                r.classList.add('bg-indigo-50', 'border-l-4', 'border-indigo-600', 'font-medium');
            } else {
                r.classList.remove('bg-indigo-50', 'border-l-4', 'border-indigo-600', 'font-medium');
            }
        });

        ['#btn-add-subtask', '#btn-indent', '#btn-outdent', '#btn-delete'].forEach(selector => {
            const btn = this.container.querySelector(selector);
            if (btn) btn.disabled = !taskId;
        });

        if (this.onTaskSelect) {
            this.onTaskSelect(taskId);
        }
    }

    filterTasks(query) {
        const tbody = this.container.querySelector('#wbs-tbody');
        if (!tbody) return;

        if (!query) {
            tbody.innerHTML = this.renderRows(this.tasks);
            this.attachEventListeners();
            return;
        }

        const filtered = this.tasks.filter(t => 
            t.name.toLowerCase().includes(query) ||
            t.wbs.includes(query) ||
            (t.assignedTo || '').toLowerCase().includes(query) ||
            t.workstream.toLowerCase().includes(query) ||
            t.stage.toLowerCase().includes(query)
        );

        tbody.innerHTML = this.renderRows(filtered);
        this.attachEventListeners();
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}
