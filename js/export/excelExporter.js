/**
 * Excel Exporter Module: Multi-tab Excel (.xlsx) / CSV export for backward compatibility
 */

import { BaselineEngine } from '../engine/baselineEngine.js';

export class ExcelExporter {

    static exportToExcel(projectTitle, tasks) {
        if (!window.XLSX) {
            alert('SheetJS Excel library not loaded. Falling back to CSV export.');
            this.exportToCSV(projectTitle, tasks);
            return;
        }

        const wb = window.XLSX.utils.book_new();

        // Sheet 1: WBS Task Sheet
        const wbsData = tasks.map(t => ({
            'WBS': t.wbs,
            'Activity Name': t.name,
            'Workstream': t.workstream,
            'Hardware Stage': t.stage,
            'Status': t.status,
            'Duration (Days)': t.duration,
            'Start Date': t.start,
            'Finish Date': t.finish,
            'Predecessors': t.predecessors || '',
            'Procurement Lead (Days)': t.leadTime || 0,
            'Vendor': t.vendor || '',
            'Assigned Engineer': t.assignedTo || '',
            'Progress (%)': t.progress || 0,
            'Is Milestone': t.isMilestone ? 'YES' : 'NO',
            'Is Summary': t.isSummary ? 'YES' : 'NO'
        }));

        const wsWbs = window.XLSX.utils.json_to_sheet(wbsData);
        window.XLSX.utils.book_append_sheet(wb, wsWbs, 'WBS Tasks');

        // Sheet 2: Milestones & Gates
        const milestones = tasks.filter(t => t.isMilestone || t.duration === 0);
        const milestoneData = milestones.map(m => {
            const v = BaselineEngine.getVariance(m);
            return {
                'WBS': m.wbs,
                'Milestone Name': m.name,
                'Hardware Stage': m.stage,
                'Workstream': m.workstream,
                'Target Date': m.finish || m.start,
                'Baseline Date': (m.baseline && m.baseline.finish) || 'N/A',
                'Variance': v.statusText,
                'Status': m.status
            };
        });

        const wsMilestones = window.XLSX.utils.json_to_sheet(milestoneData);
        window.XLSX.utils.book_append_sheet(wb, wsMilestones, 'Milestones');

        // Sheet 3: Baseline & Variance
        const varianceData = tasks.map(t => {
            const v = BaselineEngine.getVariance(t);
            return {
                'WBS': t.wbs,
                'Activity Name': t.name,
                'Current Start': t.start,
                'Current Finish': t.finish,
                'Baseline Start': (t.baseline && t.baseline.start) || 'N/A',
                'Baseline Finish': (t.baseline && t.baseline.finish) || 'N/A',
                'Finish Delay (Days)': v.finishVarianceDays,
                'Status Callout': v.statusText
            };
        });

        const wsVariance = window.XLSX.utils.json_to_sheet(varianceData);
        window.XLSX.utils.book_append_sheet(wb, wsVariance, 'Baseline Variance');

        // Download Excel File
        const fileName = `${(projectTitle || 'Hardware_Project').replace(/[^a-z0-9_-]/gi, '_')}.xlsx`;
        window.XLSX.writeFile(wb, fileName);
    }

    static exportToCSV(projectTitle, tasks) {
        const headers = ['WBS', 'Activity Name', 'Workstream', 'Stage', 'Status', 'Duration', 'Start', 'Finish', 'Predecessors', 'LeadTime', 'Progress'];
        const rows = tasks.map(t => [
            `"${t.wbs}"`,
            `"${t.name.replace(/"/g, '""')}"`,
            `"${t.workstream}"`,
            `"${t.stage}"`,
            `"${t.status}"`,
            t.duration,
            `"${t.start}"`,
            `"${t.finish}"`,
            `"${(t.predecessors || '').replace(/"/g, '""')}"`,
            t.leadTime || 0,
            t.progress || 0
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(projectTitle || 'Hardware_Project').replace(/[^a-z0-9_-]/gi, '_')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

