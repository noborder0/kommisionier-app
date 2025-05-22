const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const NoBorderOrderController = require('../controllers/noBorderOrderController');
const syncScheduler = require('../services/syncScheduler');

// No Border Controller initialisieren
const noBorderController = new NoBorderOrderController();

// Einstellungen-Hauptseite (nur für Admins)
router.get('/', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const syncStats = syncScheduler.getStats();

        res.render('settings/index', {
            title: 'Einstellungen',
            user: req.user,
            syncStats: syncStats,
            syncConfig: {
                enabled: process.env.AUTO_SYNC_ENABLED === 'true',
                interval: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 1
            }
        });
    } catch (error) {
        console.error('Fehler beim Laden der Einstellungen:', error);
        req.flash('error_msg', 'Fehler beim Laden der Einstellungen');
        res.redirect('/dashboard');
    }
});

// Sync-Scheduler starten
router.post('/sync/start', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const interval = parseInt(req.body.interval) || parseInt(process.env.SYNC_INTERVAL_MINUTES) || 1;

        if (syncScheduler.isRunning) {
            req.flash('warning_msg', 'Automatische Synchronisierung läuft bereits');
        } else {
            syncScheduler.start(interval);
            req.flash('success_msg', `Automatische Synchronisierung gestartet (alle ${interval} Minute(n))`);
        }

        res.redirect('/settings');
    } catch (error) {
        console.error('Fehler beim Starten der Synchronisierung:', error);
        req.flash('error_msg', 'Fehler beim Starten der automatischen Synchronisierung');
        res.redirect('/settings');
    }
});

// Sync-Scheduler stoppen
router.post('/sync/stop', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        if (!syncScheduler.isRunning) {
            req.flash('warning_msg', 'Automatische Synchronisierung läuft nicht');
        } else {
            syncScheduler.stop();
            req.flash('success_msg', 'Automatische Synchronisierung gestoppt');
        }

        res.redirect('/settings');
    } catch (error) {
        console.error('Fehler beim Stoppen der Synchronisierung:', error);
        req.flash('error_msg', 'Fehler beim Stoppen der automatischen Synchronisierung');
        res.redirect('/settings');
    }
});

// Sync-Statistiken zurücksetzen
router.post('/sync/reset-stats', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        syncScheduler.resetStats();
        req.flash('success_msg', 'Synchronisierungs-Statistiken wurden zurückgesetzt');
        res.redirect('/settings');
    } catch (error) {
        console.error('Fehler beim Zurücksetzen der Statistiken:', error);
        req.flash('error_msg', 'Fehler beim Zurücksetzen der Statistiken');
        res.redirect('/settings');
    }
});

// API-Test für No Border
router.get('/api-test', ensureAuthenticated, ensureAdmin, async (req, res) => {
    await noBorderController.testApiConnection(req, res);
});

// Manuelle Synchronisierung mit No Border
router.get('/sync', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        console.log('Starte manuelle Synchronisierung über Einstellungen...');

        // Manuelle Sync über Scheduler für konsistente Statistiken
        await syncScheduler.triggerManualSync();

        req.flash('success_msg', 'Manuelle Synchronisierung erfolgreich durchgeführt');
        res.redirect('/settings');
    } catch (error) {
        console.error('Fehler bei der manuellen Synchronisierung:', error);

        // Prüfe ob Response bereits gesendet wurde
        if (!res.headersSent) {
            req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
            res.redirect('/settings');
        }
    }
});

// AJAX: Sync-Status abrufen
router.get('/sync/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const stats = syncScheduler.getStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Fehler beim Abrufen des Sync-Status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manuelle Synchronisierung auslösen (AJAX)
router.post('/sync/manual', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        if (syncScheduler.isSyncing) {
            return res.json({
                success: false,
                message: 'Eine Synchronisierung läuft bereits'
            });
        }

        // Starte asynchrone Synchronisierung
        syncScheduler.triggerManualSync().then(result => {
            console.log('Manuelle Synchronisierung abgeschlossen:', result);
        }).catch(error => {
            console.error('Fehler bei manueller Synchronisierung:', error);
        });

        res.json({
            success: true,
            message: 'Manuelle Synchronisierung gestartet'
        });
    } catch (error) {
        console.error('Fehler beim Starten der manuellen Synchronisierung:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;