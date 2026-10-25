/**
 * Resource View: Engineer Pool Management & Fractional Workload Allocation Heatmap Inspector
 */

import { WORKSTREAMS } from '../models/taskModel.js';
import { Resource } from '../models/resourceModel.js';
import { CalendarEngine } from '../engine/calendarEngine.js';

export class ResourceView {
    constructor(containerElement, onResourceChange) {
        this.container = containerElement;
        this.onResourceChange = onResourceChange;
    }

    render(resources, tasks) {
        if (!this.container) return;

        this.resources = resources || [];
        this.tasks = tasks || [];

        const html = `
            <div class="resource-view flex flex-col h-full bg-slate-50 overflow-auto p-4 select-none">
                <!-- Header -->
                <div class="flex items-center justify-between mb-4 bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                    <div>
                        <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
                            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                            Team Engineers & Workload Allocation Heatmap
                        </h2>
                        <p class="text-xs text-slate-500">Manage engineer assignments and inspect daily fractional capacity loading to spot over-allocation bottlenecks.</p>
                    </div>
                    <button id="btn-add-engineer" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold text-xs shadow transition flex items-center gap-1">
                        + Add Engineer
                    </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
                    <!-- Left: Engineers Pool Table -->
                    <div class="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div class="p-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wide flex justify-between items-center">
                            <span>Team Resource Pool</span>
                            <span class="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px]">${this.resources.length} Members</span>
                        </div>
                        <div class="p-3 flex-1 overflow-auto">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                                    <tr>
                                        <th class="p-2">Engineer Name</th>
                                        <th class="p-2">Role</th>
                                        <th class="p-2">Stream</th>
                                        <th class="p-2 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${this.resources.map(r => {
                                        const ws = WORKSTREAMS[r.workstream] || WORKSTREAMS['HW'];
                                        return `
                                            <tr class="hover:bg-slate-50">
                                                <td class="p-2 font-bold text-slate-800">${this.escapeHtml(r.name)}</td>
                                                <td class="p-2 text-slate-600">${this.escapeHtml(r.role)}</td>
                                                <td class="p-2">
                                                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold" style="background-color: ${ws.bg}; color: ${ws.color};">
                                                        ${r.workstream}
                                                    </span>
                                                </td>
                                                <td class="p-2 text-center">
                                                    <button data-action="delete-resource" data-id="${r.id}" class="text-red-500 hover:text-red-700 font-bold text-xs">✕</button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Right: Fractional Workload Heatmap Matrix -->
                    <div class="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div class="p-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wide flex justify-between items-center flex-wrap gap-2">
                            <div class="flex items-center gap-2">
                                <span>Engineer Daily Workload Heatmap (% Loading)</span>
                                <button id="btn-heatmap-today" class="px-2 py-0.5 bg-white hover:bg-slate-200 border border-slate-300 rounded text-[10px] font-semibold text-slate-700 shadow-2xs transition">
                                    Jump to Today
                                </button>
                            </div>
                            <div class="flex items-center gap-2 text-[10px]">
                                <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-emerald-200 rounded"></span> ≤100% Normal</span>
                                <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-red-500 rounded"></span> >100% Over-Allocated</span>
                            </div>
                        </div>
                        <div class="flex-1 overflow-x-auto overflow-y-auto heatmap-scroll-container">
                            ${this.renderHeatmapMatrix(this.resources, this.tasks)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    renderHeatmapMatrix(resources, tasks) {
        let minStart = null;
        let maxFinish = null;

        tasks.forEach(t => {
            if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
            if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
        });

        const todayIso = new Date().toISOString().split('T')[0];
        if (!minStart) minStart = todayIso;
        if (!maxFinish) maxFinish = CalendarEngine.addCalendarDays(minStart, 30);

        // Pad timeline bounds slightly so all task dates and margins are clearly visible
        let startRange = CalendarEngine.addCalendarDays(minStart, -3);
        let endRange = CalendarEngine.addCalendarDays(maxFinish, 7);

        // Ensure minimum 30 days span
        let daySpan = Math.round((new Date(endRange + 'T00:00:00Z') - new Date(startRange + 'T00:00:00Z')) / 86400000);
        if (daySpan < 30) {
            endRange = CalendarEngine.addCalendarDays(startRange, 30);
            daySpan = 30;
        }

        const dates = [];
        for (let i = 0; i <= daySpan; i++) {
            dates.push(CalendarEngine.addCalendarDays(startRange, i));
        }

        // Map fractional workload per resource per date: resourceId_date -> sum of allocation units %
        const workloadMap = new Map();

        tasks.forEach(task => {
            if (!task.start || !task.finish) return;
            const assigned = task.getAssignedResources();
            if (assigned.length === 0) return;

            assigned.forEach(a => {
                const res = resources.find(r => r.name === a.name || r.id === a.name);
                if (!res) return;

                const units = typeof a.units === 'number' ? a.units : 100;
                let cur = task.start;

                while (cur <= task.finish) {
                    const key = `${res.id}_${cur}`;
                    const currentLoad = workloadMap.get(key) || 0;
                    workloadMap.set(key, currentLoad + units);
                    cur = CalendarEngine.addCalendarDays(cur, 1);
                }
            });
        });

        return `
            <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-20">
                    <tr>
                        <th class="p-2 border-r border-slate-200 min-w-[140px] bg-slate-100 sticky left-0 top-0 z-30 shadow-xs">Engineer</th>
                        ${dates.map(d => {
                            const dateObj = new Date(d + 'T00:00:00Z');
                            const dayNum = dateObj.getUTCDate();
                            const monthShort = dateObj.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
                            const isToday = d === todayIso;
                            return `
                                <th class="p-1 text-center border-r border-slate-200 min-w-[38px] text-[10px] ${isToday ? 'bg-indigo-100 text-indigo-900 font-bold border-b-2 border-indigo-600 shadow-xs' : 'bg-slate-50'}" data-is-today="${isToday}" data-date="${d}">
                                    <span class="text-[9px] uppercase tracking-wider text-slate-400 font-medium">${monthShort}</span><br>
                                    <span class="font-bold text-slate-700">${dayNum}</span>
                                </th>
                            `;
                        }).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${resources.map(res => `
                        <tr class="hover:bg-slate-50/70 transition-colors">
                            <td class="p-2 font-bold text-slate-800 border-r border-slate-200 bg-white sticky left-0 z-10 shadow-xs">
                                <div class="flex items-center justify-between gap-1.5">
                                    <span class="truncate text-xs">${this.escapeHtml(res.name)}</span>
                                    <span class="text-[9px] font-normal text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.2 rounded">${this.escapeHtml(res.discipline || 'HW')}</span>
                                </div>
                            </td>
                            ${dates.map(d => {
                                const key = `${res.id}_${d}`;
                                const load = workloadMap.get(key) || 0;
                                const isToday = d === todayIso;

                                let bgClass = 'bg-white text-slate-300';
                                if (load > 0 && load <= 80) {
                                    bgClass = 'bg-sky-50 text-sky-800 font-medium';
                                } else if (load > 80 && load <= 100) {
                                    bgClass = 'bg-emerald-100 text-emerald-800 font-bold';
                                } else if (load > 100) {
                                    bgClass = 'bg-rose-500 text-white font-extrabold shadow-inner';
                                }

                                return `
                                    <td class="p-1 text-center border-r border-slate-200 ${bgClass} ${isToday ? 'border-x-2 border-indigo-300' : ''} text-[10px]" title="${res.name}: ${load}% total allocation on ${CalendarEngine.formatDate(d)}">
                                        ${load > 0 ? `${load}%` : '-'}
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    attachEventListeners() {
        if (!this.container) return;

        const addBtn = this.container.querySelector('#btn-add-engineer');
        if (addBtn) {
            addBtn.onclick = () => {
                const name = prompt('Enter Engineer Name:');
                if (name && name.trim()) {
                    const role = prompt('Enter Engineer Role (e.g. Lead Firmware Engineer):') || 'Project Engineer';
                    const newRes = new Resource({
                        name: name.trim(),
                        role: role.trim(),
                        workstream: 'HW'
                    });
                    this.resources.push(newRes);
                    if (this.onResourceChange) this.onResourceChange(this.resources);
                    this.render(this.resources, this.tasks);
                }
            };
        }

        this.container.querySelectorAll('[data-action="delete-resource"]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-id');
                this.resources = this.resources.filter(r => r.id !== id);
                if (this.onResourceChange) this.onResourceChange(this.resources);
                this.render(this.resources, this.tasks);
            };
        });

        const todayBtn = this.container.querySelector('#btn-heatmap-today');
        if (todayBtn) {
            todayBtn.onclick = () => {
                const todayTh = this.container.querySelector('[data-is-today="true"]');
                if (todayTh) {
                    todayTh.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            };
        }
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}
