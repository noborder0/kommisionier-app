const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// Temporäre Route für alle Aufträge
router.get('/', ensureAuthenticated, (req, res) => {
    res.render('orders/list', {
        title: 'Alle Aufträge',
        user: req.user,
        orders: [],
        activeStatus: 'all'
    });
});

// Temporäre Route für die Auftragssuche
router.get('/search', ensureAuthenticated, (req, res) => {
    res.render('orders/search', {
        title: 'Lieferschein suchen',
        user: req.user
    });
});

// Temporäre Sync-Route
router.get('/sync', ensureAuthenticated, (req, res) => {
    req.flash('info_msg', 'Die Synchronisierung mit Xentral ist derzeit in Entwicklung.');
    res.redirect('/orders');
});

// API Test Route
router.get('/api-test', ensureAuthenticated, (req, res) => {
    // Einfacher Test ohne tatsächlich die API aufzurufen
    res.render('orders/api-test', {
        title: 'API Test',
        user: req.user,
        testResult: {
            success: false,
            error: 'API Test noch nicht implementiert',
            status: 'Entwicklung',
            details: null
        },
        apiConfig: {
            url: process.env.XENTRAL_API_URL || 'Nicht konfiguriert',
            hasApiKey: !!process.env.XENTRAL_API_KEY
        }
    });
});

// Temporäre Detailseite
router.get('/:id', ensureAuthenticated, (req, res) => {
    req.flash('info_msg', 'Detailansicht ist noch in Entwicklung.');
    res.redirect('/orders');
});

module.exports = router;