/**
 * UI control panel — lil-gui wiring
 *
 * Exposes all parameters from report Table 1 as live-adjustable controls,
 * plus scenario presets, play/pause/reset, and optional advanced toggles.
 */

import GUI from 'lil-gui';

export class UIManager {
    /** Prevent duplicate GUIs across HMR reloads */
    static _existingGUI = null;

    /**
     * @param {Object} state - Shared mutable state object
     * @param {Object} callbacks
     */
    constructor(state, callbacks) {
        this.state = state;
        this.callbacks = callbacks;

        // Destroy any previous GUI (prevents duplicates from HMR)
        if (UIManager._existingGUI) {
            UIManager._existingGUI.destroy();
        }

        this.gui = new GUI({ title: 'Newton\'s Cradle Controls' });
        UIManager._existingGUI = this.gui;
        this.scenarioFolder = null;
        this.paramsFolder = null;

        this.build();
    }

    build() {
        // --- Scenario selection ---
        this.scenarioFolder = this.gui.addFolder('Scenario');
        this.scenarioFolder.add(this.state, 'scenario', this.state.scenarioNames)
            .name('Preset')
            .onChange(this.callbacks.onScenarioChange);

        this.scenarioFolder.add(this.state, 'thetaDeg', 5, 60, 1)
            .name('Pull angle (°)')
            .onChange(this.callbacks.onParamChange);

        this.scenarioFolder.add(this.state, 'N', 3, 9, 1)
            .name('Ball count')
            .onChange(this.callbacks.onParamChange);

        // --- Physics parameters (Table 1) ---
        this.paramsFolder = this.gui.addFolder('Physics Parameters');

        this.paramsFolder.add(this.state, 'mass', 0.1, 1.0, 0.01)
            .name('Mass (kg)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'radius', 0.005, 0.03, 0.001)
            .name('Radius (m)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'length', 0.1, 0.6, 0.01)
            .name('String length (m)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'gravity', 1, 20, 0.01)
            .name('Gravity (m/s²)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'restitution', 0, 1, 0.01)
            .name('Restitution (e)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'airDrag', 0, 0.02, 0.0001)
            .name('Air drag coeff.')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'pivotFriction', 0, 0.1, 0.001)
            .name('Pivot friction')
            .onChange(this.callbacks.onParamChange);

        // --- Controls ---
        const controlsFolder = this.gui.addFolder('Controls');
        controlsFolder.add(this.state, 'playing').name('Play / Pause');
        controlsFolder.add(this.callbacks, 'onReset').name('Reset');
    }

    /** Update a specific control's value without triggering onChange */
    updateControl(folderName, property, value) {
        // Find the controller and set its value silently
        const folder = folderName === 'scenario' ? this.scenarioFolder : this.paramsFolder;
        if (!folder) return;

        const controllers = folder.controllers;
        for (const c of controllers) {
            if (c.property === property) {
                c.setValue(value);
                return;
            }
        }
    }
}
