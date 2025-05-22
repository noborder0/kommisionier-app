const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Order = require('../models/order');
const NoBorderOrderController = require('../controllers/noBorderOrderController');

// No Border Controller initialisieren
const noBorderController = new NoBorderOrderController();

// Route für alle Aufträge mit Filterung
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const { status } = req.query;
        const query = status && status !== 'all' ? { status } : {};

        console.log('Rufe Aufträge mit Filter ab:', query);

        // Alle Aufträge aus der Datenbank laden
        const orders = await Order.find(query)
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 }); // Neueste zuerst

        console.log(`${orders.length} Aufträge gefunden`);

        res.render('orders/list', {
            title: status ? `Aufträge: ${status}` : 'Alle Aufträge',
            user: req.user,
            orders,
            activeStatus: status || 'all'
        });
    } catch (error) {
        console.error('Fehler beim Laden der Aufträge:', error);
        req.flash('error_msg', 'Fehler beim Laden der Aufträge');
        res.render('orders/list', {
            title: 'Alle Aufträge',
            user: req.user,
            orders: [],
            activeStatus: 'all'
        });
    }
});

// Route für die Auftragssuche (GET)
router.get('/search', ensureAuthenticated, (req, res) => {
    res.render('orders/search', {
        title: 'Lieferschein suchen',
        user: req.user
    });
});

// Route für die Auftragssuche (POST)
router.post('/search', ensureAuthenticated, async (req, res) => {
    try {
        const { deliveryNoteNumber } = req.body;
        console.log(`Suche nach Lieferschein ${deliveryNoteNumber}`);

        // Suche nach Lieferscheinnummer in der Datenbank
        const order = await Order.findOne({
            $or: [
                { deliveryNoteNumber },
                { orderNumber: deliveryNoteNumber }
            ]
        });

        if (order) {
            console.log(`Lieferschein ${deliveryNoteNumber} in Datenbank gefunden. ID: ${order._id}`);
            return res.redirect(`/orders/${order._id}`);
        } else {
            console.log(`Lieferschein ${deliveryNoteNumber} nicht in Datenbank gefunden. Suche in No Border API.`);
            // Wenn nicht in der Datenbank, versuche über No Border API zu finden
            return res.redirect(`/orders/sync/${deliveryNoteNumber}`);
        }
    } catch (error) {
        console.error('Fehler bei der Lieferscheinsuche:', error);
        req.flash('error_msg', 'Fehler bei der Lieferscheinsuche');
        res.redirect('/orders/search');
    }
});

// Route für die Synchronisierung eines einzelnen Lieferscheins
router.get('/sync/:deliveryNoteNumber', ensureAuthenticated, async (req, res) => {
    try {
        const { deliveryNoteNumber } = req.params;
        console.log(`Synchronisiere einzelnen Lieferschein: ${deliveryNoteNumber}`);

        // Lieferschein von No Border API abrufen
        const noBorderOrder = await noBorderController.noBorderService.findDeliveryNoteByNumber(deliveryNoteNumber);

        if (!noBorderOrder) {
            console.log(`Lieferschein ${deliveryNoteNumber} in No Border API nicht gefunden`);
            req.flash('error_msg', `Lieferschein ${deliveryNoteNumber} wurde nicht gefunden.`);
            return res.redirect('/orders/search');
        }

        console.log('No Border Lieferschein gefunden:', noBorderOrder.id);

        // Lieferschein importieren oder aktualisieren
        const order = await noBorderController.importOrUpdateSingleOrder(noBorderOrder);

        req.flash('success_msg', `Lieferschein ${deliveryNoteNumber} wurde erfolgreich synchronisiert.`);

        // Direkt zur Detailseite weiterleiten
        return res.redirect(`/orders/${order._id}`);

    } catch (error) {
        console.error('Fehler bei der Synchronisierung des Lieferscheins:', error);
        req.flash('error_msg', `Fehler bei der Synchronisierung: ${error.message}`);
        res.redirect('/orders/search');
    }
});

// Route für die komplette Synchronisierung mit No Border
router.get('/sync', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Starte vollständige Synchronisierung...');
        await noBorderController.syncOpenOrders(req, res);
        // syncOpenOrders behandelt bereits die Response
    } catch (error) {
        console.error('Fehler bei der vollständigen Synchronisierung:', error);

        // Prüfe ob Response bereits gesendet wurde
        if (!res.headersSent) {
            req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
            res.redirect('/orders');
        }
    }
});

// API Test Route für No Border (MUSS vor /:id Route stehen!)
router.get('/api-test', ensureAuthenticated, async (req, res) => {
    await noBorderController.testApiConnection(req, res);
});

// Route für die Detailansicht eines Auftrags
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Rufe Auftragsdetails ab für ID:', req.params.id);

        const order = await Order.findById(req.params.id)
            .populate('assignedTo', 'name')
            .populate('updatedBy', 'name');

        if (!order) {
            console.log('Auftrag nicht gefunden');
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        console.log(`Auftrag gefunden: ${order.deliveryNoteNumber}`);
        console.log(`Artikel: ${order.items ? order.items.length : 0}`);

        res.render('orders/details', {
            title: `Lieferschein: ${order.deliveryNoteNumber}`,
            user: req.user,
            order
        });
    } catch (error) {
        console.error('Fehler beim Laden der Auftragsdetails:', error);
        req.flash('error_msg', 'Fehler beim Laden der Auftragsdetails');
        res.redirect('/orders');
    }
});

// Route für die Änderung des Auftragsstatus auf "completed"
router.post('/:id/complete', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        // Status auch in No Border API aktualisieren
        try {
            await noBorderController.updateOrderStatus(req.params.id, 'completed');
            req.flash('success_msg', `Lieferschein ${order.deliveryNoteNumber} wurde erfolgreich abgeschlossen`);
        } catch (apiError) {
            console.error('Fehler beim Aktualisieren des Status in No Border API:', apiError);

            // Lokalen Status trotzdem aktualisieren
            order.status = 'completed';
            order.updatedBy = req.user._id;
            order.updatedAt = new Date();
            await order.save();

            req.flash('warning_msg', `Lieferschein ${order.deliveryNoteNumber} wurde lokal abgeschlossen, aber nicht in No Border API aktualisiert.`);
        }

        res.redirect('/orders');
    } catch (error) {
        console.error('Fehler beim Abschließen des Auftrags:', error);
        req.flash('error_msg', 'Fehler beim Abschließen des Auftrags');
        res.redirect(`/orders/${req.params.id}`);
    }
});

// Route für die Festlegung der Verpackungsmethode
router.post('/:id/packaging', ensureAuthenticated, async (req, res) => {
    try {
        const { packagingMethod } = req.body;
        console.log(`Setze Verpackungsmethode ${packagingMethod} für Auftrag ${req.params.id}`);

        const order = await Order.findById(req.params.id);

        if (!order) {
            console.log('Auftrag nicht gefunden');
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        // Verpackungsmethode setzen und Status auf "in_progress" ändern
        order.packagingMethod = packagingMethod;
        order.status = 'in_progress';
        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        await order.save();

        // Status auch in No Border API aktualisieren
        try {
            await noBorderController.updateOrderStatus(req.params.id, 'in_progress');
        } catch (apiError) {
            console.error('Fehler beim Aktualisieren des Status in No Border API:', apiError);
            // Nicht kritisch, lokale Änderung bleibt bestehen
        }

        console.log(`Verpackungsmethode für ${order.deliveryNoteNumber} aktualisiert: ${packagingMethod}`);

        req.flash('success_msg', 'Verpackungsmethode festgelegt. Diese Funktion wird noch implementiert.');
        res.redirect(`/orders/${order._id}`);
    } catch (error) {
        console.error('Fehler beim Festlegen der Verpackungsmethode:', error);
        req.flash('error_msg', 'Fehler beim Festlegen der Verpackungsmethode');
        res.redirect(`/orders/${req.params.id}`);
    }
});

// API Test Route für No Border (bereits oben definiert)

module.exports = router;