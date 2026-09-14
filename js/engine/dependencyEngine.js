/**
 * Dependency Engine: WBS Tree, Dependency Parser, Auto-Scheduler, and Critical Path Method (CPM)
 */

export class DependencyEngine {

    /**
     * Add working days to a date string (skipping weekends)
     */
    static addWorkingDays(startDateStr, days) {
        if (!startDateStr) return '';
        if (days <= 0) return startDateStr;
        
        let date = new Date(startDateStr);
        let count = 0;
        
        while (count < days) {
            date.setDate(date.getDate() + 1);
            const day = date.getDay();
            if (day !== 0 && day !== 6) { // Not Sunday or Saturday
                count++;
            }
        }
        return date.toISOString().split('T')[0];
    }

    /**
     * Calculate working days between two dates (inclusive)
     */
    static getWorkingDays(startDateStr, endDateStr) {
        if (!startDateStr || !endDateStr) return 1;
        let start = new Date(startDateStr);
        let end = new Date(endDateStr);
        if (start > end) return 1;

        let count = 0;
        let current = new Date(start);
        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }
        return Math.max(1, count);
    }

    /**
     * Update WBS numbers and indent hierarchy for all tasks
     */
    static updateWBSHierarchy(tasks) {
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
        this.recalculateSummaryTasks(tasks, childrenMap);
    }

    /**
     * Recalculate summary task dates, duration, and progress from subtasks
     */
    static recalculateSummaryTasks(tasks, childrenMap) {
        // Process summary tasks from deepest level up
        const summaryTasks = tasks.filter(t => t.isSummary);
        
        // Sort summary tasks by WBS depth descending
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
                parent.duration = this.getWorkingDays(minStart, maxFinish);
            }
            parent.progress = totalDuration > 0 ? Math.round(totalWeightedProgress / totalDuration) : 0;
        });
    }

    /**
     * Parse predecessor string into structured objects
     * Format examples: "2", "2FS", "2FS+3d", "3SS-1d", "4FF"
     */
    static parsePredecessors(predStr, tasks) {
        if (!predStr || typeof predStr !== 'string') return [];
        
        // Map WBS or Index or ID to task
        const wbsMap = new Map();
        tasks.forEach((t, idx) => {
            wbsMap.set(t.wbs, t);
            wbsMap.set((idx + 1).toString(), t);
            wbsMap.set(t.id, t);
        });

        const items = predStr.split(',').map(s => s.trim()).filter(Boolean);
        const results = [];

        items.forEach(item => {
            // Regex to match: [WBS/ID][TYPE: FS|SS|FF|SF]?[+|- LAG]?
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
     * Run Auto-Scheduler & Critical Path Method (CPM)
     */
    static scheduleProject(tasks) {
        if (!tasks || tasks.length === 0) return;

        this.updateWBSHierarchy(tasks);

        const leafTasks = tasks.filter(t => !t.isSummary);
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        // Calculate early start & finish based on predecessors
        let changed = true;
        let iterations = 0;
        const maxIterations = tasks.length * 2;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            leafTasks.forEach(task => {
                const preds = this.parsePredecessors(task.predecessors, tasks);
                let earliestStart = new Date(task.start);

                preds.forEach(pred => {
                    const predTask = pred.targetTask;
                    if (!predTask) return;

                    let requiredDate;
                    const predStart = new Date(predTask.start);
                    const predFinish = new Date(predTask.finish);

                    switch (pred.type) {
                        case 'FS': // Finish to Start
                            requiredDate = new Date(predFinish);
                            requiredDate.setDate(requiredDate.getDate() + 1); // next day
                            break;
                        case 'SS': // Start to Start
                            requiredDate = new Date(predStart);
                            break;
                        case 'FF': // Finish to Finish
                            requiredDate = new Date(predFinish);
                            // Finish should align, so start = finish - task.duration
                            requiredDate.setDate(requiredDate.getDate() - (task.duration - 1));
                            break;
                        case 'SF': // Start to Finish
                            requiredDate = new Date(predStart);
                            requiredDate.setDate(requiredDate.getDate() - (task.duration - 1));
                            break;
                        default:
                            requiredDate = new Date(predFinish);
                            requiredDate.setDate(requiredDate.getDate() + 1);
                    }

                    // Apply lag
                    if (pred.lag !== 0) {
                        requiredDate.setDate(requiredDate.getDate() + pred.lag);
                    }

                    if (requiredDate > earliestStart) {
                        earliestStart = requiredDate;
                    }
                });

                const calculatedStart = earliestStart.toISOString().split('T')[0];
                const calculatedFinish = this.addWorkingDays(calculatedStart, task.duration);

                if (task.start !== calculatedStart || task.finish !== calculatedFinish) {
                    task.start = calculatedStart;
                    task.finish = calculatedFinish;
                    changed = true;
                }
            });
        }

        // Recalculate summary tasks after leaf tasks update
        this.updateWBSHierarchy(tasks);

        // Compute Critical Path Method (CPM) Slack
        this.calculateCriticalPath(tasks);
    }

    /**
     * Calculate Critical Path (CPM) Total Slack
     */
    static calculateCriticalPath(tasks) {
        if (tasks.length === 0) return;

        // Find latest project finish date
        let maxProjectFinish = null;
        tasks.forEach(t => {
            if (t.finish && (!maxProjectFinish || new Date(t.finish) > new Date(maxProjectFinish))) {
                maxProjectFinish = t.finish;
            }
        });

        if (!maxProjectFinish) return;

        // Forward and backward slack estimate
        tasks.forEach(t => {
            const preds = this.parsePredecessors(t.predecessors, tasks);
            const isTargetOfPred = tasks.some(other => {
                const otherPreds = this.parsePredecessors(other.predecessors, tasks);
                return otherPreds.some(p => p.targetTask.id === t.id);
            });

            // If task finish matches project finish or has 0 slack, mark critical
            const finishDate = new Date(t.finish);
            const projFinish = new Date(maxProjectFinish);
            const diffDays = Math.abs((projFinish - finishDate) / (1000 * 60 * 60 * 24));

            if (!isTargetOfPred && diffDays <= 1) {
                t.isCritical = true;
                t.slack = 0;
            } else if (t.baseline && t.baseline.finish) {
                const baselineFinish = new Date(t.baseline.finish);
                const currentFinish = new Date(t.finish);
                const drift = Math.round((currentFinish - baselineFinish) / (1000 * 60 * 60 * 24));
                t.isCritical = drift > 0;
                t.slack = Math.max(0, -drift);
            } else {
                t.isCritical = false;
                t.slack = 0;
            }
        });
    }
}

