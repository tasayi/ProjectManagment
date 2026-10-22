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

            let minStart = null;
            let maxFinish = null;
            let totalWeightedProgress = 0;
            let totalDuration = 0;

            children.forEach(child => {
                if (child.start) {
                    if (!minStart || new Date(child.start) < new Date(minStart)) {
                        minStart = child.start;
                    }
                }
                if (child.finish) {
                    if (!maxFinish || new Date(child.finish) > new Date(maxFinish)) {
                        maxFinish = child.finish;
                    }
                }
                const dur = Math.max(1, child.duration || 1);
                totalDuration += dur;
                totalWeightedProgress += (child.progress || 0) * dur;
            });

            if (minStart) parent.start = minStart;
            if (maxFinish) parent.finish = maxFinish;
            if (minStart && maxFinish) {
                parent.duration = this.getWorkingDays(minStart, maxFinish, calendar);
            }
            parent.progress = totalDuration > 0 ? Math.round(totalWeightedProgress / totalDuration) : 0;
        });
    }

    /**
     * Parse predecessor string into structured objects
     */
    static parsePredecessors(predStr, tasks) {
        if (!predStr || typeof predStr !== 'string') return [];
        
        const wbsMap = new Map();
        tasks.forEach((t, idx) => {
            wbsMap.set(t.wbs, t);
            wbsMap.set((idx + 1).toString(), t);
            wbsMap.set(t.id, t);
        });

        const items = predStr.split(',').map(s => s.trim()).filter(Boolean);
        const results = [];

        items.forEach(item => {
            const match = item.match(/^([\w.]+)(FS|SS|FF|SF)?(?:([+-])(\d+)[dD]?)?$/i);
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

        const leafTasks = tasks.filter(t => !t.isSummary);
        let changed = true;
        let iterations = 0;
        const maxIterations = tasks.length + 2;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            leafTasks.forEach(task => {
                const preds = this.parsePredecessors(task.predecessors, tasks);
                const spanBack = Math.max(1, task.duration || 0) - 1;
                const validPreds = preds.filter(p => p.targetTask && p.targetTask !== task && p.targetTask.start && p.targetTask.finish);

                // Tasks with predecessors are fully driven by them; others keep their manual start
                let earliestStart = null;

                validPreds.forEach(pred => {
                    const predTask = pred.targetTask;
                    let requiredDate;

                    switch (pred.type) {
                        case 'SS':
                            requiredDate = CalendarEngine.shiftWorkingDays(predTask.start, pred.lag, calendar);
                            break;
                        case 'FF':
                            requiredDate = CalendarEngine.shiftWorkingDays(
                                CalendarEngine.shiftWorkingDays(predTask.finish, pred.lag, calendar), -spanBack, calendar);
                            break;
                        case 'SF':
                            requiredDate = CalendarEngine.shiftWorkingDays(
                                CalendarEngine.shiftWorkingDays(predTask.start, pred.lag, calendar), -spanBack, calendar);
                            break;
                        default: // FS: next working day after predecessor finish, plus lag in working days
                            requiredDate = CalendarEngine.shiftWorkingDays(predTask.finish, 1 + pred.lag, calendar);
                    }

                    if (!earliestStart || requiredDate > earliestStart) {
                        earliestStart = requiredDate;
                    }
                });

                const calculatedStart = CalendarEngine.nextWorkingDay(earliestStart || task.start, calendar);
                const calculatedFinish = task.duration > 0
                    ? this.addWorkingDays(calculatedStart, task.duration, calendar)
                    : calculatedStart;

                if (task.start !== calculatedStart || task.finish !== calculatedFinish) {
                    task.start = calculatedStart;
                    task.finish = calculatedFinish;
                    changed = true;
                }
            });

            // Summary dates must be current when summaries act as predecessors
            this.updateWBSHierarchy(tasks, calendar);
        }

        this.calculateCriticalPath(tasks, calendar);
    }

    /**
     * Calculate Critical Path (CPM) Total Slack using standard backward pass
     */
    static calculateCriticalPath(tasks, calendar = new ProjectCalendar()) {
        if (!tasks || tasks.length === 0) return;

        const leafTasks = tasks.filter(t => !t.isSummary && t.start && t.finish);
        if (leafTasks.length === 0) return;

        let maxProjectFinish = null;
        leafTasks.forEach(t => {
            if (!maxProjectFinish || t.finish > maxProjectFinish) {
                maxProjectFinish = t.finish;
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
                const validPreds = preds.filter(p => p.targetTask && !p.targetTask.isSummary && p.targetTask.start && p.targetTask.finish);

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
            if (t.lateStart && t.start) {
                if (t.lateStart <= t.start) {
                    t.slack = 0;
                    t.isCritical = true;
                } else {
                    t.slack = CalendarEngine.getWorkingDays(t.start, t.lateStart, calendar) - 1;
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
