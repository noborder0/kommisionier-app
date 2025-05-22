const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const NoBorderOrderController = require('../controllers/noBorderOrderController');

// No Border Controller initialisieren
const noBorderController = new NoBorderOrderController();

// Einstellungen-Hauptseite (nur für Admins)
router.get('/', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        res.render('settings/index', {
            title: 'Einstellungen',
            user: req.user
        });
    } catch (error) {
        console.error('Fehler beim Laden der Einstellungen:', error);
        req.flash('error_msg', 'Fehler beim Laden der Einstellungen');
        res.redirect('/dashboard');
    }
});

// API-Test für No Border
router.get('/api-test', ensureAuthenticated, ensureAdmin, async (req, res) => {
    await noBorderController.testApiConnection(req, res);
});

// Synchronisierung mit No Border
router.get('/sync', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        console.log('Starte vollständige Synchronisierung über Einstellungen...');
        await noBorderController.syncOpenOrders(req, res);
        // syncOpenOrders behandelt bereits die Response
    } catch (error) {
        console.error('Fehler bei der vollständigen Synchronisierung:', error);

        // Prüfe ob Response bereits gesendet wurde
        if (!res.headersSent) {
            req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
            res.redirect('/settings');
        }
    }
});

module.exports = router;