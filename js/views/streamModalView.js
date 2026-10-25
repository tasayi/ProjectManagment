/**
 * Stream Modal View: Customizes workstream colors and definitions
 */

import { WORKSTREAMS, DEFAULT_WORKSTREAMS, updateWorkstream, resetWorkstreams, registerCustomWorkstream, hexToBg, getContrastTextColor } from '../models/taskModel.js';

export class StreamModalView {
    constructor(modalContainer, onStreamsChange) {
        this.container = modalContainer;
        this.onStreamsChange = onStreamsChange;
        this.isOpen = false;
    }

    open() {
        this.isOpen = true;
        this.render();
        this._escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        window.addEventListener('keydown', this._escHandler);
    }

    close() {
        this.isOpen = false;
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this.container) this.container.innerHTML = '';
    }

    render() {
        if (!this.container || !this.isOpen) return;

        const streamEntries = Object.entries(WORKSTREAMS);

        const html = `
            <div id="stream-modal-backdrop" class="modal-backdrop-animate fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <div class="modal-card-animate bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                    <!-- Header -->
                    <div class="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
                        <div class="flex items-center gap-2">
                            <span class="text-base">🎨</span>
                            <h3 class="font-bold text-sm">Workstream Palette & Color Customizer</h3>
                        </div>
                        <button id="stream-modal-close" class="text-slate-400 hover:text-white font-bold p-1">✕</button>
                    </div>

                    <!-- Body -->
                    <div class="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 flex-1">
                        <p class="text-slate-500 text-[11px]">
                            Customize workstream colors to improve visual separation on the Gantt chart and activity tables. Changes update task bars, grid pills, and PERT nodes instantly.
                        </p>

                        <!-- Streams Table -->
                        <div class="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th class="py-2 px-3 w-16">Code</th>
                                        <th class="py-2 px-3">Discipline Name</th>
                                        <th class="py-2 px-3 w-28 text-center">Color Picker</th>
                                        <th class="py-2 px-3 w-32 text-center">Live Preview</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100 font-medium">
                                    ${streamEntries.map(([code, s]) => {
                                        const textColor = getContrastTextColor(s.color);
                                        return `
                                            <tr class="hover:bg-slate-50/80 transition-colors">
                                                <td class="py-2 px-3 font-mono font-bold text-slate-800 text-[11px]">${code}</td>
                                                <td class="py-2 px-3">
                                                    <input type="text" data-action="edit-name" data-code="${code}" value="${this.escapeHtml(s.name)}" class="w-full border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs focus:outline-none">
                                                </td>
                                                <td class="py-2 px-3 text-center">
                                                    <div class="inline-flex items-center gap-1.5">
                                                        <input type="color" data-action="pick-color" data-code="${code}" value="${s.color}" class="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0 bg-transparent">
                                                        <span class="font-mono text-[10px] text-slate-400 uppercase">${s.color}</span>
                                                    </div>
                                                </td>
                                                <td class="py-2 px-3 text-center">
                                                    <div class="flex flex-col gap-1 items-center">
                                                        <!-- Gantt Bar Preview -->
                                                        <span id="preview-bar-${code}" class="inline-block px-2 py-0.5 rounded text-[10px] font-bold shadow-xs truncate max-w-[110px]" style="background-color: ${s.color}; color: ${textColor};">
                                                            ${code} Bar
                                                        </span>
                                                        <!-- Pill Preview -->
                                                        <span id="preview-pill-${code}" class="inline-block px-1.5 py-0.2 rounded text-[9px] font-semibold truncate max-w-[110px]" style="background-color: ${s.bg}; color: ${s.color};">
                                                            ${code} Pill
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Add Custom Stream Form -->
                        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                            <h4 class="font-bold text-slate-800 text-[11px] uppercase tracking-wide flex items-center gap-1.5">
                                <span>+</span> Add Custom Workstream
                            </h4>
                            <div class="flex items-center gap-2 flex-wrap">
                                <input type="text" id="new-stream-code" placeholder="Code (e.g. REL)" maxlength="6" class="w-24 uppercase font-mono border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500">
                                <input type="text" id="new-stream-name" placeholder="Name (e.g. Reliability & Testing)" class="flex-1 min-w-[160px] border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500">
                                <div class="flex items-center gap-1">
                                    <span class="text-[10px] text-slate-400">Color:</span>
                                    <input type="color" id="new-stream-color" value="#0284c7" class="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0 bg-transparent">
                                </div>
                                <button id="btn-add-stream" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium shadow-xs transition text-xs">
                                    + Add Stream
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
                        <button id="btn-reset-streams" class="px-3 py-1 text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-300 rounded font-medium text-xs transition">
                            Reset to Defaults
                        </button>
                        <div class="flex items-center gap-2">
                            <button id="stream-modal-apply" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-xs shadow-xs transition">
                                Apply & Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    attachEventListeners() {
        if (!this.container) return;

        // Close handlers
        const closeBtn = this.container.querySelector('#stream-modal-close');
        if (closeBtn) closeBtn.onclick = () => this.close();

        const backdrop = this.container.querySelector('#stream-modal-backdrop');
        if (backdrop) {
            backdrop.onclick = (e) => {
                if (e.target === backdrop) this.close();
            };
        }

        const applyBtn = this.container.querySelector('#stream-modal-apply');
        if (applyBtn) {
            applyBtn.onclick = () => {
                if (this.onStreamsChange) this.onStreamsChange();
                this.close();
            };
        }

        // Color pickers (live updates)
        this.container.querySelectorAll('[data-action="pick-color"]').forEach(input => {
            input.oninput = (e) => {
                const code = input.getAttribute('data-code');
                const newColor = e.target.value;
                const newBg = hexToBg(newColor);
                const textColor = getContrastTextColor(newColor);

                updateWorkstream(code, { color: newColor, bg: newBg });

                // Update live previews in modal
                const barPreview = this.container.querySelector(`#preview-bar-${code}`);
                if (barPreview) {
                    barPreview.style.backgroundColor = newColor;
                    barPreview.style.color = textColor;
                }
                const pillPreview = this.container.querySelector(`#preview-pill-${code}`);
                if (pillPreview) {
                    pillPreview.style.backgroundColor = newBg;
                    pillPreview.style.color = newColor;
                }
                const hexLabel = input.nextElementSibling;
                if (hexLabel) hexLabel.textContent = newColor;

                // Notify live changes so background views re-render
                if (this.onStreamsChange) this.onStreamsChange();
            };
        });

        // Name edits
        this.container.querySelectorAll('[data-action="edit-name"]').forEach(input => {
            input.onchange = (e) => {
                const code = input.getAttribute('data-code');
                updateWorkstream(code, { name: e.target.value });
                if (this.onStreamsChange) this.onStreamsChange();
            };
        });

        // Add custom stream
        const addBtn = this.container.querySelector('#btn-add-stream');
        if (addBtn) {
            addBtn.onclick = () => {
                const codeInput = this.container.querySelector('#new-stream-code');
                const nameInput = this.container.querySelector('#new-stream-name');
                const colorInput = this.container.querySelector('#new-stream-color');

                const code = (codeInput?.value || '').trim();
                const name = (nameInput?.value || '').trim();
                const color = colorInput?.value || '#0284c7';

                if (!code) {
                    alert('Please enter a workstream code (e.g. REL)');
                    return;
                }

                registerCustomWorkstream(code, name || code, color);
                this.render();
                if (this.onStreamsChange) this.onStreamsChange();
            };
        }

        // Reset to defaults
        const resetBtn = this.container.querySelector('#btn-reset-streams');
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (confirm('Reset all workstream colors and labels to standard defaults?')) {
                    resetWorkstreams();
                    this.render();
                    if (this.onStreamsChange) this.onStreamsChange();
                }
            };
        }
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}

