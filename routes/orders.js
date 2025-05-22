const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Order = require('../models/order');
const NoBorderOrderController = require('../controllers/noBorderOrderController');

// No Border Controller initialisieren
const noBorderController = new NoBorderOrderController();

// ... (alle bestehenden Routen bleiben unverändert) ...

// Route für alle Aufträge mit Filterung
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const { status } = req.query;
        const query = status && status !== 'all' ? { status } : {};

        console.log('Rufe Aufträge mit Filter ab:', query);

        const orders = await Order.find(query)
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 });

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

        const noBorderOrder = await noBorderController.noBorderService.findDeliveryNoteByNumber(deliveryNoteNumber);

        if (!noBorderOrder) {
            console.log(`Lieferschein ${deliveryNoteNumber} in No Border API nicht gefunden`);
            req.flash('error_msg', `Lieferschein ${deliveryNoteNumber} wurde nicht gefunden.`);
            return res.redirect('/orders/search');
        }

        console.log('No Border Lieferschein gefunden:', noBorderOrder.id);

        const order = await noBorderController.importOrUpdateSingleOrder(noBorderOrder);

        req.flash('success_msg', `Lieferschein ${deliveryNoteNumber} wurde erfolgreich synchronisiert.`);
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
    } catch (error) {
        console.error('Fehler bei der vollständigen Synchronisierung:', error);

        if (!res.headersSent) {
            req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
            res.redirect('/orders');
        }
    }
});

// API Test Route für No Border
router.get('/api-test', ensureAuthenticated, async (req, res) => {
    await noBorderController.testApiConnection(req, res);
});

// ============== NEUE BARCODE-FUNKTIONALITÄT ==============

// Route für Artikel-Scan (AJAX)
router.post('/:id/items/:itemId/pick', ensureAuthenticated, async (req, res) => {
    try {
        const { id, itemId } = req.params;
        const { quantityPicked } = req.body;

        console.log(`Aktualisiere Artikel ${itemId} in Auftrag ${id}: Menge = ${quantityPicked}`);

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        // Finde den entsprechenden Artikel
        const item = order.items.find(item => item.id === itemId);
        if (!item) {
            return res.status(404).json({ error: 'Artikel nicht gefunden' });
        }

        // Aktualisiere die kommissionierte Menge
        item.quantityPicked = Math.max(0, Math.min(quantityPicked, item.quantity));
        item.pickedBy = req.user._id;
        item.pickedAt = new Date();

        // Status aktualisieren
        if (item.quantityPicked >= item.quantity) {
            item.pickingStatus = 'complete';
        } else if (item.quantityPicked > 0) {
            item.pickingStatus = 'partial';
        } else {
            item.pickingStatus = 'pending';
        }

        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        await order.save();

        res.json({
            success: true,
            item: {
                id: item.id,
                quantityPicked: item.quantityPicked,
                pickingStatus: item.pickingStatus
            }
        });

    } catch (error) {
        console.error('Fehler beim Aktualisieren der Artikel-Menge:', error);
        res.status(500).json({ error: 'Server-Fehler beim Aktualisieren' });
    }
});

// Route für Fortschritt speichern (AJAX)
router.post('/:id/save-progress', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        await order.save();

        res.json({ success: true, message: 'Fortschritt gespeichert' });

    } catch (error) {
        console.error('Fehler beim Speichern des Fortschritts:', error);
        res.status(500).json({ error: 'Server-Fehler beim Speichern' });
    }
});

// Route für Kommissionierung abschließen
router.post('/:id/complete-picking', ensureAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id);
        if (!order) {
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        // Prüfe ob alle Artikel vollständig kommissioniert sind
        const allComplete = order.items.every(item => item.quantityPicked >= item.quantity);

        if (!allComplete) {
            return res.status(400).json({
                error: 'Nicht alle Artikel sind vollständig kommissioniert'
            });
        }

        // Status auf "packed" setzen
        order.status = 'packed';
        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        // Alle Items als complete markieren
        order.items.forEach(item => {
            if (item.quantityPicked >= item.quantity) {
                item.pickingStatus = 'complete';
            }
        });

        await order.save();

        // Status auch in No Border API aktualisieren
        try {
            await noBorderController.updateOrderStatus(id, 'packed');
        } catch (apiError) {
            console.error('Fehler beim Aktualisieren des Status in No Border API:', apiError);
        }

        console.log(`Kommissionierung für ${order.deliveryNoteNumber} abgeschlossen`);

        res.json({
            success: true,
            message: 'Kommissionierung abgeschlossen',
            redirectUrl: `/orders/${id}/print`
        });

    } catch (error) {
        console.error('Fehler beim Abschließen der Kommissionierung:', error);
        res.status(500).json({ error: 'Server-Fehler beim Abschließen' });
    }
});

// Route für Druck-Seite
router.get('/:id/print', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('assignedTo', 'name')
            .populate('updatedBy', 'name');

        if (!order) {
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        // Nur für gepackte oder bereits versendete Aufträge
        if (order.status !== 'packed' && order.status !== 'shipped') {
            req.flash('error_msg', 'Auftrag muss erst kommissioniert werden');
            return res.redirect(`/orders/${order._id}`);
        }

        res.render('orders/print', {
            title: `Drucken: ${order.deliveryNoteNumber}`,
            user: req.user,
            order
        });

    } catch (error) {
        console.error('Fehler beim Laden der Druck-Seite:', error);
        req.flash('error_msg', 'Fehler beim Laden der Druck-Seite');
        res.redirect('/orders');
    }
});

// Route für Detailansicht (erweitert)
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
        console.log(`Status: ${order.status}`);
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

        try {
            await noBorderController.updateOrderStatus(req.params.id, 'completed');
            req.flash('success_msg', `Lieferschein ${order.deliveryNoteNumber} wurde erfolgreich abgeschlossen`);
        } catch (apiError) {
            console.error('Fehler beim Aktualisieren des Status in No Border API:', apiError);

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
        order.assignedTo = req.user._id; // Zuweisen an aktuellen Benutzer
        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        // Alle Items als "in_progress" markieren
        order.items.forEach(item => {
            if (item.pickingStatus === 'pending') {
                item.pickingStatus = 'in_progress';
            }
        });

        await order.save();

        try {
            await noBorderController.updateOrderStatus(req.params.id, 'in_progress');
        } catch (apiError) {
            console.error('Fehler beim Aktualisieren des Status in No Border API:', apiError);
        }

        console.log(`Verpackungsmethode für ${order.deliveryNoteNumber} aktualisiert: ${packagingMethod}`);

        req.flash('success_msg', 'Kommissionierung gestartet. Scannen Sie nun die Barcodes der Artikel.');
        res.redirect(`/orders/${order._id}`);
    } catch (error) {
        console.error('Fehler beim Festlegen der Verpackungsmethode:', error);
        req.flash('error_msg', 'Fehler beim Festlegen der Verpackungsmethode');
        res.redirect(`/orders/${req.params.id}`);
    }
});

module.exports = router;