/**
 * Print Engine: renders the full activity table, full Gantt and milestones into an off-screen
 * container (independent of scroll/collapse state of the live views) and prints that.
 */

import { GanttView } from '../views/ganttView.js';
import { MilestonesView } from '../views/milestonesView.js';
import { BaselineEngine } from '../engine/baselineEngine.js';
import { CalendarEngine } from '../engine/calendarEngine.js';

// Printable content width in CSS px (page minus 10mm margins)
const PAGE_WIDTH_PX = { A4: 1047, A3: 1512 };

export class PrintEngine {

    static printView(target = 'all', ctx = {}) {
        const tasks = ctx.tasks || [];

        this.cleanup();

        const root = document.createElement('div');
        root.id = 'print-root';
        document.body.appendChild(root);

        let pageSize = 'A4';

        if (target === 'wbs' || target === 'all') {
            root.appendChild(this.buildSection(ctx.title, this.renderTable(tasks)));
        }

        if (target === 'gantt' || target === 'all') {
            pageSize = 'A3';
            root.appendChild(this.buildGantt(ctx, target === 'all'));
        }

        if (target === 'milestones') {
            const holder = this.buildSection(ctx.title, '');
            const inner = document.createElement('div');
            new MilestonesView(inner).render(tasks);
            holder.appendChild(inner);
            root.appendChild(holder);
        }

        const style = document.createElement('style');
        style.id = 'print-page-style';
        style.textContent = `@page { size: ${pageSize} landscape; margin: 10mm; }`;
        document.head.appendChild(style);

        document.body.classList.add('printing-custom');
        window.addEventListener('afterprint', () => this.cleanup(), { once: true });

        // Give the Tailwind CDN a moment to generate styles for the new nodes
        setTimeout(() => window.print(), 300);
    }

    static cleanup() {
        document.body.classList.remove('printing-custom');
        const root = document.getElementById('print-root');
        if (root) root.remove();
        const style = document.getElementById('print-page-style');
        if (style) style.remove();
    }

    static buildSection(title, html, breakBefore = false) {
        const section = document.createElement('section');
        if (breakBefore) section.className = 'print-page-break';
        section.innerHTML = `<h1 style="font-size:14pt;font-weight:700;margin:0 0 6px;">${this.esc(title || 'Project Schedule')}</h1>${html}`;
        return section;
    }

    static buildGantt(ctx, breakBefore) {
        const section = this.buildSection(ctx.title, '', breakBefore);
        const holder = document.createElement('div');
        section.appendChild(holder);

        const gantt = new GanttView(holder, null);
        gantt.printMode = true;
        gantt.zoom = ctx.zoom || 'Week';
        gantt.showCriticalPath = !!ctx.showCriticalPath;
        gantt.render(ctx.tasks, ctx.calendar);

        // Scale the whole timeline to fit the page width instead of cropping it
        const scale = Math.min(1, PAGE_WIDTH_PX.A3 / (gantt.timelineWidth + 4));
        holder.style.zoom = String(scale);
        return section;
    }

    static renderTable(tasks) {
        const fmt = (d) => CalendarEngine.formatDate(d);
        const th = 'border:1px solid #94a3b8;padding:3px 5px;background:#e2e8f0;text-align:left;font-size:8pt;';
        const td = 'border:1px solid #cbd5e1;padding:3px 5px;font-size:8pt;vertical-align:top;';

        const rows = tasks.map(t => {
            const v = BaselineEngine.getVariance(t);
            const depth = (t.wbs || '').split('.').length - 1;
            return `<tr style="${t.isSummary ? 'font-weight:700;background:#f1f5f9;' : ''}">
                <td style="${td}">${this.esc(t.wbs)}</td>
                <td style="${td}padding-left:${5 + depth * 12}px;">${this.esc(t.name)}</td>
                <td style="${td}">${this.esc(t.workstream)}</td>
                <td style="${td}">${this.esc(t.stage)}</td>
                <td style="${td}">${this.esc(t.getFormattedAssignments())}</td>
                <td style="${td}">${this.esc(t.status)}</td>
                <td style="${td}text-align:center;">${t.progress || 0}%</td>
                <td style="${td}text-align:center;">${t.duration}</td>
                <td style="${td}white-space:nowrap;">${fmt(t.start)}</td>
                <td style="${td}white-space:nowrap;">${fmt(t.finish)}</td>
                <td style="${td}">${this.esc(t.predecessors || '')}</td>
                <td style="${td}">${v.hasBaseline ? this.esc(v.statusText) : ''}</td>
            </tr>`;
        }).join('');

        return `<table style="width:100%;border-collapse:collapse;">
            <thead style="display:table-header-group;"><tr>
                ${['WBS', 'Activity', 'Stream', 'Stage', 'Assigned', 'Status', 'Done', 'Dur (d)', 'Start', 'Finish', 'Predecessors', 'Variance']
                    .map(h => `<th style="${th}">${h}</th>`).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    static esc(str) {
        return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
