export class EnergyTracker {
    constructor() {
        this.history = [];
        this.cumulativeDissipated = 0;
        this.maxHistoryLength = 1200;
    }

    record(kinetic, potential, dissipated) {
        this.cumulativeDissipated += Math.max(0, dissipated);

        const entry = {
            time: this.history.length > 0
                ? this.history[this.history.length - 1].time + 1/60
                : 0,
            kinetic,
            potential,
            dissipated: this.cumulativeDissipated,
        };

        this.history.push(entry);

        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    get total() {
        if (this.history.length === 0) return 0;
        const last = this.history[this.history.length - 1];
        return last.kinetic + last.potential + last.dissipated;
    }

    reset() {
        this.history = [];
        this.cumulativeDissipated = 0;
    }
}
