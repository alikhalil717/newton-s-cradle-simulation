import GUI from 'lil-gui';

export class UIManager {
    static _existingGUI = null;

    constructor(state, callbacks) {
        this.state = state;
        this.callbacks = callbacks;


        if (UIManager._existingGUI) {
            UIManager._existingGUI.destroy();
        }

        this.gui = new GUI({ title: 'Newton\'s Cradle Controls' });
        UIManager._existingGUI = this.gui;
        this.scenarioFolder = null;
        this.paramsFolder = null;
        this.perBallFolder = null;
        this._perBallControllers = [];

        this.build();
    }

    build() {

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


        this.paramsFolder = this.gui.addFolder('Physics Parameters');

        this.paramsFolder.add(this.state, 'mass', 0.01, 1.0, 0.001)
            .name('Mass (kg) — default')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'radius', 0.005, 0.03, 0.001)
            .name('Radius (m) — default')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'length', 0.1, 0.6, 0.01)
            .name('String len (m) — default')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'stringAngle', 0, 30, 0.5)
            .name('Two-string angle (°)')
            .onChange(this.callbacks.onParamChange);

        this.paramsFolder.add(this.state, 'gap', 0, 0.02, 0.001)
            .name('Gap (m)')
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


        this.perBallFolder = this.gui.addFolder('Per-Ball Settings');
        this._rebuildPerBallControls();


        const controlsFolder = this.gui.addFolder('Controls');
        controlsFolder.add(this.state, 'playing').name('Play / Pause');
        controlsFolder.add(this.callbacks, 'onReset').name('Reset');


        const stringFolder = this.gui.addFolder('String Settings');
        stringFolder.add(this.state, 'stringType', this.state.stringTypes)
            .name('String Type')
            .onChange(this.callbacks.onParamChange);
    }

    _rebuildPerBallControls() {
        this._perBallControllers = [];
        const N = this.state.N;

        for (let i = 0; i < N; i++) {
            const ballObj = {
                get mass() { return this.state.massPerBall[i]; },
                set mass(v) { this.state.massPerBall[i] = v; },
                get radius() { return this.state.radiusPerBall[i]; },
                set radius(v) { this.state.radiusPerBall[i] = v; },
                get length() { return this.state.lengthPerBall[i]; },
                set length(v) { this.state.lengthPerBall[i] = v; },
                state: this.state,
            };
            const sub = this.perBallFolder.addFolder(`Ball ${i + 1}`);
            const mc = sub.add(ballObj, 'mass', 0.01, 1.0, 0.001)
                .name('Mass (kg)')
                .onChange(this.callbacks.onParamChange);
            const rc = sub.add(ballObj, 'radius', 0.005, 0.03, 0.001)
                .name('Radius (m)')
                .onChange(this.callbacks.onParamChange);
            const lc = sub.add(ballObj, 'length', 0.1, 0.6, 0.01)
                .name('String len (m)')
                .onChange(this.callbacks.onParamChange);
            this._perBallControllers.push(mc, rc, lc);
        }
    }

    rebuildPerBall() {
        const folderDom = this.perBallFolder.domElement;
        folderDom.style.display = 'none';
        this.perBallFolder = this.gui.addFolder('Per-Ball Settings');
        this._perBallControllers = [];
        this._rebuildPerBallControls();
    }
}
