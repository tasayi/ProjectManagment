/**
 * Baseline Engine: Snapshot management, Variance calculations, and Self-Explaining Status Badges
 */

export class BaselineEngine {

    /**
     * Capture current project state as a NEW baseline; earlier baselines are kept and the new one becomes active
     */
    static captureBaseline(tasks, label = '') {
        const id = this.getBaselines(tasks).reduce((m, b) => Math.max(m, b.id), -1) + 1;
        const name = (label || '').trim() || `Baseline ${id}`;
        const date = new Date().toISOString();

        tasks.forEach(t => {
            const completed = t.status === 'Complete' || Number(t.progress) >= 100;
            const baselineStart = completed
                ? (t.actualStart || t.projectedStart || t.forecastStart || t.start)
                : (t.projectedStart || t.forecastStart || t.start);
            const baselineFinish = completed
                ? (t.actualFinish || t.projectedFinish || t.forecastFinish || t.finish)
                : (t.projectedFinish || t.forecastFinish || t.finish);
            const snap = {
                id, label: name, date,
                start: baselineStart,
                finish: baselineFinish,
                duration: t.projectedDuration ?? t.duration,
                progress: t.progress || 0,
                status: t.status
            };
            t.baselines = [...(t.baselines || []), snap];
            t.baseline = snap;
            t.plannedStart = snap.start;
            t.plannedFinish = snap.finish;
            t.start = snap.start;
            t.finish = snap.finish;
        });
        return tasks.length;
    }

    /**
     * Distinct baselines across all tasks, oldest first
     */
    static getBaselines(tasks) {
        const map = new Map();
        tasks.forEach(t => (t.baselines || []).forEach(b => {
            if (!map.has(b.id)) map.set(b.id, { id: b.id, label: b.label, date: b.date });
        }));
        return [...map.values()].sort((a, b) => a.id - b.id);
    }

    static getActiveBaselineId(tasks) {
        const t = tasks.find(x => x.baseline);
        return t ? t.baseline.id : null;
    }

    /**
     * Choose which baseline variances are measured against (null = none)
     */
    static setActiveBaseline(tasks, id) {
        tasks.forEach(t => {
            t.baseline = id === null || id === undefined
                ? null
                : (t.baselines || []).find(b => b.id === id) || null;
            t.start = t.baseline?.start || t.plannedStart || t.start;
            t.finish = t.baseline?.finish || t.plannedFinish || t.finish;
        });
    }

    /**
     * Finish-date drift of a task against every baseline captured, for tooltips and exports
     */
    static getHistory(task) {
        return (task.baselines || []).map(b => ({
            id: b.id,
            label: b.label,
            start: b.start,
            finish: b.finish,
            finishVarianceDays: Math.round((new Date(this.getCurrentFinish(task)) - new Date(b.finish)) / 86400000)
        }));
    }

    /**
     * Clear all baselines
     */
    static clearBaseline(tasks) {
        tasks.forEach(t => {
            t.baseline = null;
            t.baselines = [];
            t.start = t.plannedStart || t.start;
            t.finish = t.plannedFinish || t.finish;
        });
    }

    static getCurrentStart(task) {
        const complete = task.status === 'Complete' || Number(task.progress) >= 100;
        return complete ? (task.actualStart || task.projectedStart || task.start) : (task.projectedStart || task.start);
    }

    static getCurrentFinish(task) {
        const complete = task.status === 'Complete' || Number(task.progress) >= 100;
        return complete ? (task.actualFinish || task.projectedFinish || task.finish) : (task.projectedFinish || task.finish);
    }

    /**
     * Calculate variance for a single task compared to its baseline
     */
    static getVariance(task) {
        if (!task || !task.baseline || !task.baseline.start || !task.baseline.finish) {
            return {
                hasBaseline: false,
                startVarianceDays: 0,
                finishVarianceDays: 0,
                statusText: 'No Baseline',
                badgeClass: 'bg-slate-100 text-slate-500',
                badgeColor: '#64748b'
            };
        }

        const baselineStart = new Date(task.baseline.start);
        const baselineFinish = new Date(task.baseline.finish);
        const currentStart = new Date(this.getCurrentStart(task));
        const currentFinish = new Date(this.getCurrentFinish(task));

        const startVarianceDays = Math.round((currentStart - baselineStart) / (1000 * 60 * 60 * 24));
        const finishVarianceDays = Math.round((currentFinish - baselineFinish) / (1000 * 60 * 60 * 24));

        let statusText = 'On Track';
        let badgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-300';
        let badgeColor = '#10b981';

        if (finishVarianceDays > 0) {
            statusText = `+${finishVarianceDays}d Delay`;
            if (finishVarianceDays <= 3) {
                badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
                badgeColor = '#f59e0b';
            } else {
                badgeClass = 'bg-red-100 text-red-700 border-red-300';
                badgeColor = '#ef4444';
            }
        } else if (finishVarianceDays < 0) {
            statusText = `${finishVarianceDays}d Ahead`;
            badgeClass = 'bg-blue-100 text-blue-700 border-blue-300';
            badgeColor = '#3b82f6';
        }

        return {
            hasBaseline: true,
            startVarianceDays,
            finishVarianceDays,
            statusText,
            badgeClass,
            badgeColor
        };
    }

    /**
     * Get summary metrics of overall project baseline variance
     */
    static getProjectBaselineMetrics(tasks) {
        const tasksWithBaseline = tasks.filter(t => t.baseline);
        if (tasksWithBaseline.length === 0) {
            return {
                hasBaseline: false,
                delayedTasksCount: 0,
                aheadTasksCount: 0,
                onTrackCount: 0,
                maxDelayDays: 0
            };
        }

        let delayedTasksCount = 0;
        let aheadTasksCount = 0;
        let onTrackCount = 0;
        let maxDelayDays = 0;

        tasksWithBaseline.forEach(t => {
            const v = this.getVariance(t);
            if (v.finishVarianceDays > 0) {
                delayedTasksCount++;
                if (v.finishVarianceDays > maxDelayDays) maxDelayDays = v.finishVarianceDays;
            } else if (v.finishVarianceDays < 0) {
                aheadTasksCount++;
            } else {
                onTrackCount++;
            }
        });

        return {
            hasBaseline: true,
            delayedTasksCount,
            aheadTasksCount,
            onTrackCount,
            maxDelayDays,
            totalTasks: tasksWithBaseline.length
        };
    }
}

