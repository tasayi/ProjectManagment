/**
 * Project Store: Persistence in LocalStorage, Custom .prj File Import/Export, and Sample Presets
 */

import { Task } from '../models/taskModel.js';
import { DependencyEngine } from '../engine/dependencyEngine.js';
import { BaselineEngine } from '../engine/baselineEngine.js';

const STORAGE_KEY = 'hardware_pm_project_data';

export class ProjectStore {
    
    /**
     * Auto-save current tasks to LocalStorage
     */
    static saveToLocalStorage(projectTitle, tasks) {
        try {
            const payload = {
                version: '1.0',
                title: projectTitle || 'Hardware Project',
                updatedAt: new Date().toISOString(),
                tasks: tasks
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    /**
     * Load tasks from LocalStorage
     */
    static loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return {
                title: data.title || 'Hardware Project',
                tasks: (data.tasks || []).map(t => new Task(t))
            };
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return null;
        }
    }

    /**
     * Export project file as .prj (JSON format)
     */
    static exportProjectFile(projectTitle, tasks) {
        const payload = {
            appName: 'Antigravity Hardware PM',
            fileFormat: 'hardware_pm_prj',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            project: {
                title: projectTitle || 'Hardware R&D Project',
                tasks: tasks
            }
        };

        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const safeName = (projectTitle || 'Hardware_Project').replace(/[^a-z0-9_-]/gi, '_');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}.prj`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Import project file from .prj content
     */
    static importProjectFile(jsonContent) {
        try {
            const data = JSON.parse(jsonContent);
            let rawTasks = [];

            if (data.project && Array.isArray(data.project.tasks)) {
                rawTasks = data.project.tasks;
            } else if (Array.isArray(data.tasks)) {
                rawTasks = data.tasks;
            } else {
                throw new Error('Invalid .prj file format');
            }

            const tasks = rawTasks.map(t => new Task(t));
            DependencyEngine.scheduleProject(tasks);

            return {
                title: (data.project && data.project.title) || data.title || 'Imported Project',
                tasks: tasks
            };
        } catch (e) {
            alert('Failed to parse .prj file. Please ensure it is a valid project file.');
            return null;
        }
    }

    /**
     * Generate Pre-Loaded Hardware Project Template Presets
     */
    static getSamplePreset(presetId = 'iot_device') {
        const today = new Date().toISOString().split('T')[0];
        let tasks = [];

        if (presetId === 'iot_device') {
            tasks = [
                // Concept Phase
                new Task({ name: 'System Architecture & Specs', stage: 'Concept', workstream: 'HW', duration: 5, start: DependencyEngine.addWorkingDays(today, 0), status: 'Complete', progress: 100 }),
                new Task({ name: 'Component Selection & BOM Costing', stage: 'Concept', workstream: 'PROC', duration: 4, predecessors: '1FS', status: 'Complete', progress: 100 }),

                // EVT Phase (Engineering Verification Test)
                new Task({ name: 'EVT Phase - Prototype Spin', stage: 'EVT', workstream: 'HW', duration: 25, isSummary: true, expanded: true }),
                new Task({ name: 'Schematic Capture (MCU + Sensors)', stage: 'EVT', workstream: 'EE', duration: 6, parentId: null, predecessors: '2FS', status: 'In Design', progress: 80 }),
                new Task({ name: 'PCB Layout & Stackup Design', stage: 'EVT', workstream: 'EE', duration: 7, predecessors: '4FS', status: 'In Design', progress: 40 }),
                new Task({ name: 'PCB Fab & Assembly (Vendor Lead Time)', stage: 'EVT', workstream: 'PROC', duration: 10, leadTime: 7, vendor: 'JLCPCB Vendor', predecessors: '5FS', status: 'In Fab' }),
                new Task({ name: '3D Enclosure CAD Design', stage: 'EVT', workstream: 'ME', duration: 8, predecessors: '4SS+2d', status: 'In Design', progress: 60 }),
                new Task({ name: 'SLA 3D Prototype Printing', stage: 'EVT', workstream: 'ME', duration: 3, predecessors: '7FS', status: 'Not Started' }),
                new Task({ name: 'Firmware Board Support Package (BSP)', stage: 'EVT', workstream: 'FW', duration: 10, predecessors: '4SS+3d', status: 'In Design', progress: 50 }),
                new Task({ name: 'EVT 1st Article Assembly & Bring-Up', stage: 'EVT', workstream: 'HW', duration: 4, predecessors: '6FS, 8FS, 9FS', status: 'Not Started' }),
                new Task({ name: 'EVT Milestone Gate Passed', stage: 'EVT', workstream: 'HW', duration: 0, isMilestone: true, predecessors: '10FS', status: 'Not Started' }),

                // DVT Phase (Design Verification Test)
                new Task({ name: 'DVT Phase - Compliance & Tooling', stage: 'DVT', workstream: 'HW', duration: 30, isSummary: true, expanded: true }),
                new Task({ name: 'Injection Mold Tooling Fabrication', stage: 'DVT', workstream: 'ME', duration: 20, leadTime: 14, vendor: 'Precision Molds Inc', predecessors: '11FS', status: 'Not Started' }),
                new Task({ name: 'Board Spin Rev B (RF Optimization)', stage: 'DVT', workstream: 'EE', duration: 8, predecessors: '11FS', status: 'Not Started' }),
                new Task({ name: 'FCC / CE Pre-Compliance Testing', stage: 'DVT', workstream: 'TEST', duration: 7, predecessors: '13FS, 14FS', status: 'Not Started' }),
                new Task({ name: 'Firmware Feature Release v1.0', stage: 'DVT', workstream: 'FW', duration: 15, predecessors: '9FS', status: 'Not Started' }),
                new Task({ name: 'DVT Golden Sample Sign-Off', stage: 'DVT', workstream: 'HW', duration: 0, isMilestone: true, predecessors: '15FS, 16FS', status: 'Not Started' })
            ];
        }

        // Parent assignments for subtasks in preset
        const evtSummary = tasks[2];
        tasks[3].parentId = evtSummary.id;
        tasks[4].parentId = evtSummary.id;
        tasks[5].parentId = evtSummary.id;
        tasks[6].parentId = evtSummary.id;
        tasks[7].parentId = evtSummary.id;
        tasks[8].parentId = evtSummary.id;
        tasks[9].parentId = evtSummary.id;
        tasks[10].parentId = evtSummary.id;

        const dvtSummary = tasks[11];
        tasks[12].parentId = dvtSummary.id;
        tasks[13].parentId = dvtSummary.id;
        tasks[14].parentId = dvtSummary.id;
        tasks[15].parentId = dvtSummary.id;
        tasks[16].parentId = dvtSummary.id;

        // Schedule project tasks
        DependencyEngine.scheduleProject(tasks);

        // Capture initial baseline snapshot
        BaselineEngine.captureBaseline(tasks);

        return {
            title: 'IoT Tracker Hardware-Firmware Project',
            tasks: tasks
        };
    }
}

