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
            const snap = {
                id, label: name, date,
                start: t.start,
                finish: t.finish,
                duration: t.duration,
                progress: t.progress || 0,
                status: t.status
            };
            t.baselines = [...(t.baselines || []), snap];
            t.baseline = snap;
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
            finishVarianceDays: Math.round((new Date(task.finish) - new Date(b.finish)) / 86400000)
        }));
    }

    /**
     * Clear all baselines
     */
    static clearBaseline(tasks) {
        tasks.forEach(t => {
            t.baseline = null;
            t.baselines = [];
        });
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
        const currentStart = new Date(task.start);
        const currentFinish = new Date(task.finish);

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

