/**
 * Task Model & Factory functions for Hardware Project Manager
 */

export class Task {
    constructor(data = {}) {
        this.id = data.id || 'task_' + Math.random().toString(36).substr(2, 9);
        this.wbs = data.wbs || '1';
        this.name = data.name || 'New Activity';
        this.duration = typeof data.duration === 'number' ? data.duration : 1; // in working days
        this.start = data.start || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        this.finish = data.finish || this.calculateFinishDate(this.start, this.duration);
        this.predecessors = data.predecessors || ''; // e.g. "2FS+3d, 4SS"
        this.progress = typeof data.progress === 'number' ? data.progress : 0; // 0 to 100
        
        // Hardware R&D Specific Metadata
        this.stage = data.stage || 'EVT'; // Concept, EVT, DVT, PVT, MP
        this.workstream = data.workstream || 'HW'; // HW, EE, ME, FW, PROC, TEST, MFG
        this.status = data.status || 'Not Started'; // Not Started, In Design, In Fab, Testing, Blocked, Complete, Delayed
        this.isMilestone = Boolean(data.isMilestone) || this.duration === 0;
        this.isSummary = Boolean(data.isSummary) || false;
        this.parentId = data.parentId || null;
        this.expanded = data.expanded !== undefined ? data.expanded : true;
        
        // Vendor & Procurement
        this.leadTime = data.leadTime || 0; // Component / Fab lead time in days
        this.vendor = data.vendor || '';
        this.assignedTo = data.assignedTo || '';
        this.notes = data.notes || '';

        // Baseline Snapshot Data
        this.baseline = data.baseline ? {
            start: data.baseline.start,
            finish: data.baseline.finish,
            duration: data.baseline.duration
        } : null;

        // Calculated Engine Properties (Transient)
        this.earlyStart = null;
        this.earlyFinish = null;
        this.lateStart = null;
        this.lateFinish = null;
        this.slack = 0;
        this.isCritical = false;
    }

    calculateFinishDate(startDateStr, durationDays) {
        if (!startDateStr) return '';
        const date = new Date(startDateStr);
        let added = 0;
        const days = Math.max(1, durationDays);
        
        // Working days calculation (skipping weekends)
        while (added < days - 1) {
            date.setDate(date.getDate() + 1);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
                added++;
            }
        }
        return date.toISOString().split('T')[0];
    }
}

export const WORKSTREAMS = {
    'HW': { name: 'Hardware / System', color: '#3b82f6', bg: '#dbeafe' },
    'EE': { name: 'Electronics / PCB', color: '#8b5cf6', bg: '#ede9fe' },
    'ME': { name: 'Mechanical / Enclosure', color: '#f59e0b', bg: '#fef3c7' },
    'FW': { name: 'Firmware / Embedded', color: '#10b981', bg: '#d1fae5' },
    'PROC': { name: 'Procurement / Fab', color: '#ec4899', bg: '#fce7f3' },
    'TEST': { name: 'Compliance / QA', color: '#06b6d4', bg: '#cffaff' },
    'MFG': { name: 'Manufacturing / Assembly', color: '#64748b', bg: '#f1f5f9' }
};

export const HARDWARE_STAGES = ['Concept', 'EVT', 'DVT', 'PVT', 'MP'];

export const STATUS_PILLS = {
    'Not Started': { label: 'Not Started', class: 'bg-slate-100 text-slate-700 border-slate-300' },
    'In Design': { label: 'In Design', class: 'bg-blue-100 text-blue-700 border-blue-300' },
    'In Fab': { label: 'In Fab / Vendor', class: 'bg-purple-100 text-purple-700 border-purple-300' },
    'Testing': { label: 'Testing / QA', class: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
    'Blocked': { label: 'Blocked / Risk', class: 'bg-amber-100 text-amber-800 border-amber-300' },
    'Delayed': { label: 'Delayed', class: 'bg-red-100 text-red-700 border-red-300' },
    'Complete': { label: 'Complete', class: 'bg-emerald-100 text-emerald-700 border-emerald-300' }
};

