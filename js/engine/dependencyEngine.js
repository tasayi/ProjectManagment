/**
 * Dependency Engine: WBS Tree, Dependency Parser, Auto-Scheduler, and Critical Path Method (CPM)
 */

import { CalendarEngine } from './calendarEngine.js';

export class DependencyEngine {

    /**
     * Add working days to a date string using CalendarEngine
     */
    static addWorkingDays(startDateStr, days, calendar) {
        return CalendarEngine.addWorkingDays(startDateStr, days, calendar);
    }

    /**
     * Calculate working days between two dates using CalendarEngine
     */
    static getWorkingDays(startDateStr, endDateStr, calendar) {
        return CalendarEngine.getWorkingDays(startDateStr, endDateStr, calendar);
    }

    /**
     * Update WBS numbers and indent hierarchy for all tasks
     */
    static updateWBSHierarchy(tasks, calendar) {
        const idMap = new Map();
        tasks.forEach(t => idMap.set(t.id, t));

        // Group children by parentId
        const childrenMap = new Map();
        tasks.forEach(t => {
            const pid = t.parentId || 'root';
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid).push(t);
        });

        // Helper to recursively assign WBS
        function assignWBS(parentId, prefix) {
            const children = childrenMap.get(parentId) || [];
            children.forEach((child, index) => {
                const num = index + 1;
                child.wbs = prefix ? `${prefix}.${num}` : `${num}`;
                const hasChildren = childrenMap.has(child.id) && childrenMap.get(child.id).length > 0;
                child.isSummary = hasChildren;
                if (hasChildren) {
                    assignWBS(child.id, child.wbs);
                }
            });
        }

        assignWBS('root', '');

        // Recalculate summary tasks bottom-up
        this.recalculateSummaryTasks(tasks, childrenMap, calendar);
    }

    /**
     * Recalculate summary task dates, duration, and progress from subtasks
     */
    static recalculateSummaryTasks(tasks, childrenMap, calendar) {
        const summaryTasks = tasks.filter(t => t.isSummary);
        summaryTasks.sort((a, b) => b.wbs.split('.').length - a.wbs.split('.').length);

        summaryTasks.forEach(parent => {
            const children = childrenMap.get(parent.id) || [];
            if (children.length === 0) return;

            let totalWeightedProgress = 0;
            let totalDuration = 0;

            children.forEach(child => {
                const dur = Math.max(1, child.duration || 1);
                totalDuration += dur;
                totalWeightedProgress += (child.progress || 0) * dur;
            });

            parent.progress = totalDuration > 0 ? Math.round(totalWeightedProgress / totalDuration) : 0;
        });
    }

    /**
     * Parse predecessor string into structured objects
     */
    static parsePredecessors(predStr, tasks) {
        if (!predStr || typeof predStr !== 'string') return [];
        
        const wbsMap = new Map();
        tasks.forEach((t, idx) => wbsMap.set((idx + 1).toString(), t));
        tasks.forEach(t => {
            if (t.wbs && t.wbs.includes('.')) wbsMap.set(t.wbs, t);
            wbsMap.set(t.id, t);
        });

        const items = predStr.split(',').map(s => s.trim()).filter(Boolean);
        const results = [];

        items.forEach(item => {
            const match = item.match(/^([\w.]+?)(FS|SS|FF|SF)?(?:([+-])(\d+)[dD]?)?$/i);
            if (match) {
                const targetRef = match[1];
                const type = (match[2] || 'FS').toUpperCase();
                const sign = match[3] === '-' ? -1 : 1;
                const lag = match[4] ? parseInt(match[4], 10) * sign : 0;

                const targetTask = wbsMap.get(targetRef);
                if (targetTask) {
                    results.push({
                        targetTask,
                        type,
                        lag
                    });
                }
            }
        });

        return results;
    }

    /**
     * Run Auto-Scheduler & Critical Path Method (CPM) using Calendar Engine
     */
    static scheduleProject(tasks, calendar) {
        if (!tasks || tasks.length === 0) return;

        this.updateWBSHierarchy(tasks, calendar);
        this.calculateForecast(tasks, calendar);
        this.calculateCriticalPath(tasks, calendar);
    }

    /** Calculate projected dates and overdue state without changing the selected baseline. */
    static calculateForecast(tasks, calendar) {
        const today = this.getLocalToday();
        const leaves = tasks.filter(task => !task.isSummary);
        const isComplete = task => task.status === 'Complete' || Number(task.progress) >= 100;

        leaves.forEach(task => {
            const plannedStart = task.plannedStart || task.start;
            const plannedFinish = task.plannedFinish || task.finish;
            const completed = isComplete(task);
            const overdue = !completed && plannedFinish && plannedFinish < today;
            const duration = Math.max(0, Number(task.projectedDuration ?? task.duration) || 0);
            const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
            task.isOverdue = Boolean(overdue);
            task.overdueDays = overdue
                ? Math.max(1, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${plannedFinish}T00:00:00Z`)) / 86400000))
                : 0;
            task._projectionBaseStart = completed
                ? (task.actualStart || plannedStart || today)
                : (task.actualStart || task.projectedStartConstraint || plannedStart || today);
            task._projectionDuration = !completed && overdue && duration > 0
                ? Math.max(1, Math.ceil(duration * (100 - progress) / 100))
                : duration;

            if (completed) {
                task.projectedStart = task.actualStart || plannedStart;
                task.projectedFinish = task.actualFinish || plannedFinish;
                task.forecastStart = task.projectedStart;
                task.forecastFinish = task.projectedFinish;
            }
        });

        const rollup = () => {
            tasks.filter(task => task.isSummary)
                .sort((a, b) => b.wbs.split('.').length - a.wbs.split('.').length)
                .forEach(parent => {
                    const children = tasks.filter(task => task.parentId === parent.id);
                    const starts = children.map(task => task.projectedStart).filter(Boolean).sort();
                    const finishes = children.map(task => task.projectedFinish).filter(Boolean).sort();
                    if (starts.length) parent.projectedStart = starts[0];
                    if (finishes.length) parent.projectedFinish = finishes[finishes.length - 1];
                    parent.forecastStart = parent.projectedStart;
                    parent.forecastFinish = parent.projectedFinish;
                    parent.isOverdue = children.some(task => task.isOverdue);
                    parent.overdueDays = children.reduce((max, task) => Math.max(max, task.overdueDays || 0), 0);
                });
        };

        // Reset from stable inputs each time; dependency changes cannot drift between recalculations.
        leaves.forEach(task => {
            const completed = isComplete(task);
            if (completed) return;
            let start = CalendarEngine.nextWorkingDay(task._projectionBaseStart, calendar);
            if (!completed && task.isOverdue && today > start) start = CalendarEngine.nextWorkingDay(today, calendar);
            if (!completed && task.delayDays > 0) start = CalendarEngine.shiftWorkingDays(start, task.delayDays, calendar);
            task.projectedStart = start;
            task.projectedFinish = task._projectionDuration > 0
                ? CalendarEngine.addWorkingDays(start, task._projectionDuration, calendar)
                : start;
            task.forecastStart = task.projectedStart;
            task.forecastFinish = task.projectedFinish;
        });
        rollup();

        let changed = true;
        let iterations = 0;
        while (changed && iterations++ < tasks.length + 2) {
            changed = false;
            leaves.forEach(task => {
                if (isComplete(task)) return;
                const duration = task._projectionDuration;
                const spanBack = Math.max(0, duration - 1);
                const completed = isComplete(task);
                let requiredStart = task._projectionBaseStart;
                const links = this.parsePredecessors(task.predecessors, tasks)
                    .filter(link => link.targetTask && link.targetTask !== task);

                links.forEach(link => {
                    const pred = link.targetTask;
                    const predComplete = isComplete(pred);
                    const predStart = predComplete && pred.actualStart ? pred.actualStart : pred.projectedStart;
                    const predFinish = predComplete && pred.actualFinish ? pred.actualFinish : pred.projectedFinish;
                    if (!predStart || !predFinish) return;

                    let candidate;
                    switch (link.type) {
                        case 'SS':
                            candidate = CalendarEngine.shiftWorkingDays(predStart, link.lag, calendar);
                            break;
                        case 'FF': {
                            const requiredFinish = CalendarEngine.shiftWorkingDays(predFinish, link.lag, calendar);
                            candidate = duration > 0 ? CalendarEngine.shiftWorkingDays(requiredFinish, -spanBack, calendar) : requiredFinish;
                            break;
                        }
                        case 'SF': {
                            const requiredFinish = CalendarEngine.shiftWorkingDays(predStart, link.lag, calendar);
                            candidate = duration > 0 ? CalendarEngine.shiftWorkingDays(requiredFinish, -spanBack, calendar) : requiredFinish;
                            break;
                        }
                        default:
                            candidate = CalendarEngine.shiftWorkingDays(predFinish, 1 + link.lag, calendar);
                    }
                    if (candidate > requiredStart) requiredStart = candidate;
                });

                if (!completed && task.isOverdue && today > requiredStart) requiredStart = today;
                let start = CalendarEngine.nextWorkingDay(requiredStart, calendar);
                if (!completed && task.delayDays > 0) start = CalendarEngine.shiftWorkingDays(start, task.delayDays, calendar);
                let finish = duration > 0 ? CalendarEngine.addWorkingDays(start, duration, calendar) : start;

                // Keep the baseline finish as a lower bound unless the user explicitly adjusted the projection.
                const hasProjectionOverride = Boolean(task.projectedStartConstraint) || task.projectedDuration !== task.duration;
                const baselineFinish = task.plannedFinish || task.finish;
                if (!completed && !task.isOverdue && !hasProjectionOverride && !task.delayDays && baselineFinish && finish < baselineFinish) {
                    finish = baselineFinish;
                }

                if (start !== task.projectedStart || finish !== task.projectedFinish) changed = true;
                task.projectedStart = start;
                task.projectedFinish = finish;
                task.forecastStart = start;
                task.forecastFinish = finish;
            });
            rollup();
        }

        leaves.forEach(task => {
            delete task._projectionBaseStart;
            delete task._projectionDuration;
        });
    }

    static getLocalToday() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    /**
     * Calculate Critical Path (CPM) Total Slack using standard backward pass
     */
    static calculateCriticalPath(tasks, calendar = new ProjectCalendar()) {
        if (!tasks || tasks.length === 0) return;

        const leafTasks = tasks.filter(t => !t.isSummary && t.projectedStart && t.projectedFinish);
        if (leafTasks.length === 0) return;

        let maxProjectFinish = null;
        leafTasks.forEach(t => {
            if (!maxProjectFinish || t.projectedFinish > maxProjectFinish) {
                maxProjectFinish = t.projectedFinish;
            }
        });

        if (!maxProjectFinish) return;

        // Initialize Late Finish (LF) and Late Start (LS) for leaf tasks
        leafTasks.forEach(t => {
            t.lateFinish = maxProjectFinish;
            const span = Math.max(1, t.duration || 0) - 1;
            t.lateStart = CalendarEngine.shiftWorkingDays(t.lateFinish, -span, calendar);
            t.slack = 0;
            t.isCritical = false;
        });

        // Iterative backward pass propagating successor constraints to predecessors
        let changed = true;
        let iterations = 0;
        const maxIter = leafTasks.length + 5;

        while (changed && iterations++ < maxIter) {
            changed = false;

            leafTasks.forEach(task => {
                const preds = this.parsePredecessors(task.predecessors, tasks);
                const validPreds = preds.filter(p => p.targetTask && !p.targetTask.isSummary && p.targetTask.projectedStart && p.targetTask.projectedFinish);

                validPreds.forEach(pred => {
                    const pTask = pred.targetTask;
                    const pSpan = Math.max(1, pTask.duration || 0) - 1;
                    let maxAllowedFinish = pTask.lateFinish;

                    switch (pred.type) {
                        case 'SS': {
                            const maxAllowedStart = CalendarEngine.shiftWorkingDays(task.lateStart, -pred.lag, calendar);
                            const derivedFinish = pTask.duration > 0
                                ? CalendarEngine.shiftWorkingDays(maxAllowedStart, pSpan, calendar)
                                : maxAllowedStart;
                            if (derivedFinish < maxAllowedFinish) maxAllowedFinish = derivedFinish;
                            break;
                        }
                        case 'FF': {
                            const derivedFinish = CalendarEngine.shiftWorkingDays(task.lateFinish, -pred.lag, calendar);
                            if (derivedFinish < maxAllowedFinish) maxAllowedFinish = derivedFinish;
                            break;
                        }
                        case 'SF': {
                            const maxAllowedStart = CalendarEngine.shiftWorkingDays(task.lateFinish, -pred.lag, calendar);
                            const derivedFinish = pTask.duration > 0
                                ? CalendarEngine.shiftWorkingDays(maxAllowedStart, pSpan, calendar)
                                : maxAllowedStart;
                            if (derivedFinish < maxAllowedFinish) maxAllowedFinish = derivedFinish;
                            break;
                        }
                        default: { // FS
                            const derivedFinish = CalendarEngine.shiftWorkingDays(task.lateStart, -(1 + pred.lag), calendar);
                            if (derivedFinish < maxAllowedFinish) maxAllowedFinish = derivedFinish;
                            break;
                        }
                    }

                    if (maxAllowedFinish < pTask.lateFinish) {
                        pTask.lateFinish = maxAllowedFinish;
                        pTask.lateStart = pTask.duration > 0
                            ? CalendarEngine.shiftWorkingDays(pTask.lateFinish, -pSpan, calendar)
                            : pTask.lateFinish;
                        changed = true;
                    }
                });
            });
        }

        // Determine critical status and total float/slack
        leafTasks.forEach(t => {
            if (t.lateStart && t.projectedStart) {
                if (t.lateStart <= t.projectedStart) {
                    t.slack = 0;
                    t.isCritical = true;
                } else {
                    t.slack = CalendarEngine.getWorkingDays(t.projectedStart, t.lateStart, calendar) - 1;
                    t.isCritical = t.slack <= 0;
                }
            } else {
                t.isCritical = false;
                t.slack = 0;
            }
        });

        // Summary tasks: critical if any subtask is critical
        const summaryTasks = tasks.filter(t => t.isSummary);
        summaryTasks.forEach(s => {
            s.isCritical = tasks.some(c => c.parentId === s.id && c.isCritical);
            s.slack = 0;
        });
    }
}
