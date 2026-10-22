/**
 * Project Store: LocalStorage Persistence, Custom .prj File Import/Export, Blank Project & Presets
 */

import { Task, exportWorkstreams, importWorkstreams } from '../models/taskModel.js';
import { Resource, DEFAULT_RESOURCES } from '../models/resourceModel.js';
import { ProjectCalendar } from '../models/calendarModel.js';
import { DependencyEngine } from '../engine/dependencyEngine.js';
import { BaselineEngine } from '../engine/baselineEngine.js';

const STORAGE_KEY = 'hardware_pm_project_data';

export class ProjectStore {
    // Retain active file handle from File System Access API
    static currentFileHandle = null;
    static currentFileName = null;

    /**
     * Build standardized payload object
     */
    static buildPayload(projectTitle, tasks, resources, calendar) {
        return {
            appName: 'Project Management Tool',
            fileFormat: 'hardware_pm_prj',
            version: '1.2',
            exportedAt: new Date().toISOString(),
            project: {
                title: projectTitle || 'Project Management Schedule',
                tasks: tasks,
                resources: resources,
                calendar: calendar,
                workstreams: exportWorkstreams()
            }
        };
    }

    /**
     * Auto-save current tasks, resources, calendar, and workstreams to LocalStorage
     */
    static saveToLocalStorage(projectTitle, tasks, resources, calendar) {
        try {
            const payload = {
                version: '1.2',
                title: projectTitle || 'Project Management Schedule',
                updatedAt: new Date().toISOString(),
                tasks: tasks,
                resources: resources,
                calendar: calendar,
                workstreams: exportWorkstreams()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    /**
     * Load tasks, resources, calendar, and workstreams from LocalStorage
     */
    static loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data.workstreams) {
                importWorkstreams(data.workstreams);
            }
            return {
                title: data.title || 'Project Management Schedule',
                tasks: (data.tasks || []).map(t => new Task(t)),
                resources: (data.resources || []).map(r => new Resource(r)),
                calendar: new ProjectCalendar(data.calendar || {})
            };
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return null;
        }
    }

    /**
     * In-place Save (Ctrl+S / Save button): writes back to currentFileHandle if available, otherwise Save As
     */
    static async saveProjectFileInPlace(projectTitle, tasks, resources, calendar) {
        this.saveToLocalStorage(projectTitle, tasks, resources, calendar);

        if (this.currentFileHandle && 'createWritable' in this.currentFileHandle) {
            try {
                const payload = this.buildPayload(projectTitle, tasks, resources, calendar);
                const writable = await this.currentFileHandle.createWritable();
                await writable.write(JSON.stringify(payload, null, 2));
                await writable.close();
                return { success: true, mode: 'inplace', fileName: this.currentFileHandle.name };
            } catch (err) {
                console.warn('In-place write failed, falling back to Save As:', err);
            }
        }

        // If no file handle exists, invoke Save As
        return await this.saveProjectFileAs(projectTitle, tasks, resources, calendar);
    }

    /**
     * Save As button: prompt for new destination/filename via File System Access API or download fallback
     */
    static async saveProjectFileAs(projectTitle, tasks, resources, calendar) {
        this.saveToLocalStorage(projectTitle, tasks, resources, calendar);
        const payload = this.buildPayload(projectTitle, tasks, resources, calendar);
        const jsonStr = JSON.stringify(payload, null, 2);
        const safeName = `${(projectTitle || 'Project').replace(/[^a-z0-9_-]/gi, '_')}.prj`;

        // Modern File System Access API
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: safeName,
                    types: [{
                        description: 'Project Management File (*.prj)',
                        accept: { 'application/json': ['.prj', '.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                this.currentFileHandle = handle;
                this.currentFileName = handle.name;
                return { success: true, mode: 'saveas', fileName: handle.name };
            } catch (err) {
                if (err.name === 'AbortError') {
                    return { success: false, aborted: true };
                }
                console.warn('showSaveFilePicker failed, falling back to download:', err);
            }
        }

        // Fallback: standard file download
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = safeName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.currentFileName = safeName;
        return { success: true, mode: 'download', fileName: safeName };
    }

    /**
     * Legacy Export helper
     */
    static exportProjectFile(projectTitle, tasks, resources, calendar) {
        this.saveProjectFileAs(projectTitle, tasks, resources, calendar);
    }

    /**
     * Open File via modern File System Access API with handle retention
     */
    static async openProjectFileWithPicker() {
        if (typeof window.showOpenFilePicker === 'function') {
            try {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'Project Management File (*.prj, *.json)',
                        accept: { 'application/json': ['.prj', '.json'] }
                    }]
                });
                const file = await handle.getFile();
                const content = await file.text();
                const imported = this.importProjectFile(content);
                if (imported) {
                    this.currentFileHandle = handle;
                    this.currentFileName = handle.name;
                    return { success: true, imported, fileName: handle.name };
                }
            } catch (err) {
                if (err.name === 'AbortError') return { success: false, aborted: true };
                console.warn('showOpenFilePicker error:', err);
            }
        }
        return null;
    }

    /**
     * Import project file from .prj content
     */
    static importProjectFile(jsonContent) {
        try {
            const data = JSON.parse(jsonContent);
            let rawTasks = [];
            let rawResources = [];
            let rawCalendar = {};
            let rawStreams = null;

            if (data.project) {
                rawTasks = data.project.tasks || [];
                rawResources = data.project.resources || [];
                rawCalendar = data.project.calendar || {};
                rawStreams = data.project.workstreams;
            } else {
                rawTasks = data.tasks || [];
                rawResources = data.resources || [];
                rawCalendar = data.calendar || {};
                rawStreams = data.workstreams;
            }

            if (rawStreams) {
                importWorkstreams(rawStreams);
            }

            const tasks = rawTasks.map(t => new Task(t));
            const resources = rawResources.length > 0 ? rawResources.map(r => new Resource(r)) : DEFAULT_RESOURCES;
            const calendar = new ProjectCalendar(rawCalendar);

            DependencyEngine.scheduleProject(tasks, calendar);

            return {
                title: (data.project && data.project.title) || data.title || 'Imported Project',
                tasks: tasks,
                resources: resources,
                calendar: calendar
            };
        } catch (e) {
            alert('Failed to parse .prj file. Please ensure it is a valid project file.');
            return null;
        }
    }

    /**
     * Generate a new blank project structure
     */
    static getBlankProject() {
        const today = new Date().toISOString().split('T')[0];
        const calendar = new ProjectCalendar();
        const resources = DEFAULT_RESOURCES;

        const starterTask = new Task({
            name: 'Initial Architecture Task',
            stage: 'Concept',
            workstream: 'HW',
            assignedTo: 'Priya Sharma',
            duration: 5,
            start: today,
            status: 'In Design'
        });

        const tasks = [starterTask];
        DependencyEngine.scheduleProject(tasks, calendar);
        BaselineEngine.captureBaseline(tasks);

        return {
            title: 'New Hardware R&D Project',
            tasks: tasks,
            resources: resources,
            calendar: calendar
        };
    }

    /**
     * Generate Pre-Loaded Hardware Project Template Presets
     */
    static getSamplePreset(presetId = 'iot_device') {
        if (presetId === 'new_blank') {
            return this.getBlankProject();
        }

        const today = new Date().toISOString().split('T')[0];
        const calendar = new ProjectCalendar();
        const resources = DEFAULT_RESOURCES;
        let tasks = [];

        if (presetId === 'iot_device') {
            tasks = [
                // Concept Phase
                new Task({ name: 'System Architecture & Specs', stage: 'Concept', workstream: 'HW', assignedTo: 'Priya Sharma', duration: 5, start: DependencyEngine.addWorkingDays(today, 0, calendar), status: 'Complete', progress: 100 }),
                new Task({ name: 'Component Selection & BOM Costing', stage: 'Concept', workstream: 'PROC', assignedTo: 'David Kim', duration: 4, predecessors: '1FS', status: 'Complete', progress: 100 }),

                // EVT Phase
                new Task({ name: 'EVT Phase - Prototype Spin', stage: 'EVT', workstream: 'HW', duration: 25, isSummary: true, expanded: true }),
                new Task({ name: 'Schematic Capture (MCU + Sensors)', stage: 'EVT', workstream: 'EE', assignedTo: 'Alex Rivera', duration: 6, predecessors: '2FS', status: 'In Design', progress: 80 }),
                new Task({ name: 'PCB Layout & Stackup Design', stage: 'EVT', workstream: 'EE', assignedTo: 'Alex Rivera', duration: 7, predecessors: '4FS', status: 'In Design', progress: 40 }),
                new Task({ name: 'PCB Fab & Assembly (Vendor Lead Time)', stage: 'EVT', workstream: 'PROC', assignedTo: 'David Kim', duration: 10, leadTime: 7, vendor: 'JLCPCB Vendor', predecessors: '5FS', status: 'In Fab' }),
                new Task({ name: '3D Enclosure CAD Design', stage: 'EVT', workstream: 'ME', assignedTo: 'Marcus Vance', duration: 8, predecessors: '4SS+2d', status: 'In Design', progress: 60 }),
                new Task({ name: 'SLA 3D Prototype Printing', stage: 'EVT', workstream: 'ME', assignedTo: 'Marcus Vance', duration: 3, predecessors: '7FS', status: 'Not Started' }),
                new Task({ name: 'Firmware Board Support Package (BSP)', stage: 'EVT', workstream: 'FW', assignedTo: 'Sarah Chen', duration: 10, predecessors: '4SS+3d', status: 'In Design', progress: 50 }),
                new Task({ name: 'EVT 1st Article Assembly & Bring-Up', stage: 'EVT', workstream: 'HW', assignedResources: [{ name: 'Priya Sharma', units: 100 }, { name: 'Alex Rivera', units: 50 }], duration: 4, predecessors: '6FS, 8FS, 9FS', status: 'Not Started' }),
                new Task({ name: 'EVT Milestone Gate Passed', stage: 'EVT', workstream: 'HW', assignedTo: 'Priya Sharma', duration: 0, isMilestone: true, predecessors: '10FS', status: 'Not Started' }),

                // DVT Phase
                new Task({ name: 'DVT Phase - Compliance & Tooling', stage: 'DVT', workstream: 'HW', duration: 30, isSummary: true, expanded: true }),
                new Task({ name: 'Injection Mold Tooling Fabrication', stage: 'DVT', workstream: 'ME', assignedTo: 'Marcus Vance', duration: 20, leadTime: 14, vendor: 'Precision Molds Inc', predecessors: '11FS', status: 'Not Started' }),
                new Task({ name: 'Board Spin Rev B (RF Optimization)', stage: 'DVT', workstream: 'EE', assignedTo: 'Alex Rivera', duration: 8, predecessors: '11FS', status: 'Not Started' }),
                new Task({ name: 'FCC / CE Pre-Compliance Testing', stage: 'DVT', workstream: 'TEST', assignedTo: 'Elena Rostova', duration: 7, predecessors: '13FS, 14FS', status: 'Not Started' }),
                new Task({ name: 'Firmware Feature Release v1.0', stage: 'DVT', workstream: 'FW', assignedTo: 'Sarah Chen', duration: 15, predecessors: '9FS', status: 'Not Started' }),
                new Task({ name: 'DVT Golden Sample Sign-Off', stage: 'DVT', workstream: 'HW', assignedTo: 'Priya Sharma', duration: 0, isMilestone: true, predecessors: '15FS, 16FS', status: 'Not Started' })
            ];
        }

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

        DependencyEngine.scheduleProject(tasks, calendar);
        BaselineEngine.captureBaseline(tasks);

        return {
            title: 'IoT Tracker Hardware-Firmware Project',
            tasks: tasks,
            resources: resources,
            calendar: calendar
        };
    }
}
