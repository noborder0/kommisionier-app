const NoBorderOrderController = require('../controllers/noBorderOrderController');

/**
 * Sync Scheduler - Führt regelmäßige Synchronisierung durch
 */
class SyncScheduler {
    constructor() {
        this.controller = new NoBorderOrderController();
        this.isRunning = false;
        this.interval = null;
        this.syncIntervalMinutes = 1; // Standard: 1 Minute
        this.lastSyncTime = null;
        this.isSyncing = false;
        this.stats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            lastError: null
        };
    }

    /**
     * Startet den automatischen Sync-Scheduler
     * @param {number} intervalMinutes - Intervall in Minuten (Standard: 1)
     */
    start(intervalMinutes = 1) {
        if (this.isRunning) {
            console.log('Sync-Scheduler läuft bereits');
            return;
        }

        this.syncIntervalMinutes = intervalMinutes;
        const intervalMs = intervalMinutes * 60 * 1000;

        console.log(`Starte Sync-Scheduler: Synchronisierung alle ${intervalMinutes} Minute(n)`);

        // Erste Synchronisierung sofort ausführen
        this.runSync();

        // Dann regelmäßig wiederholen
        this.interval = setInterval(() => {
            this.runSync();
        }, intervalMs);

        this.isRunning = true;
    }

    /**
     * Stoppt den Sync-Scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('Sync-Scheduler läuft nicht');
            return;
        }

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        this.isRunning = false;
        console.log('Sync-Scheduler gestoppt');
    }

    /**
     * Führt eine einzelne Synchronisierung aus
     */
    async runSync() {
        if (this.isSyncing) {
            console.log('Synchronisierung bereits im Gange, überspringe...');
            return;
        }

        this.isSyncing = true;
        const startTime = new Date();

        try {
            console.log(`[${startTime.toISOString()}] Starte automatische Synchronisierung...`);

            // Rufe die autoSync Methode des Controllers auf
            const result = await this.controller.autoSync();

            this.stats.totalSyncs++;

            if (result.success) {
                this.stats.successfulSyncs++;
                this.lastSyncTime = startTime;
                console.log(`[${startTime.toISOString()}] Synchronisierung erfolgreich: ${result.synced} Lieferscheine (${result.new || 0} neu, ${result.updated || 0} aktualisiert)`);
            } else {
                this.stats.failedSyncs++;
                this.stats.lastError = result.error;
                console.error(`[${startTime.toISOString()}] Synchronisierung fehlgeschlagen: ${result.error}`);
            }

        } catch (error) {
            this.stats.totalSyncs++;
            this.stats.failedSyncs++;
            this.stats.lastError = error.message;
            console.error(`[${startTime.toISOString()}] Unerwarteter Fehler bei Synchronisierung:`, error);
        } finally {
            this.isSyncing = false;
            const duration = (new Date() - startTime) / 1000;
            console.log(`Synchronisierung abgeschlossen nach ${duration.toFixed(2)}s`);
        }
    }

    /**
     * Gibt aktuelle Statistiken zurück
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            isSyncing: this.isSyncing,
            syncIntervalMinutes: this.syncIntervalMinutes,
            lastSyncTime: this.lastSyncTime,
            nextSyncTime: this.isRunning && this.lastSyncTime ?
                new Date(this.lastSyncTime.getTime() + (this.syncIntervalMinutes * 60 * 1000)) :
                null
        };
    }

    /**
     * Setzt die Statistiken zurück
     */
    resetStats() {
        this.stats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            lastError: null
        };
        console.log('Sync-Statistiken zurückgesetzt');
    }

    /**
     * Manuelle Synchronisierung auslösen
     */
    async triggerManualSync() {
        console.log('Manuelle Synchronisierung ausgelöst');
        return await this.runSync();
    }
}

// Singleton-Instanz
const syncScheduler = new SyncScheduler();

module.exports = syncScheduler;