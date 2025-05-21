// Verbesserte orders.js-Route mit direkter Einbindung des Mock-Services für Testzwecke
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Order = require('../models/order');
const orderController = require('../controllers/orderController');

// ======= WICHTIG: Für Tests den Mock-Service verwenden =======
// Im Produktiveinsatz zurück zu xentralService wechseln
const xentralService = require('../services/xentralService');
//const xentralService = require('../services/mockService');
// ============================================================

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
        const order = await Order.findOne({ deliveryNoteNumber });

        if (order) {
            console.log(`Lieferschein ${deliveryNoteNumber} in Datenbank gefunden. ID: ${order._id}`);
            return res.redirect(`/orders/${order._id}`);
        } else {
            console.log(`Lieferschein ${deliveryNoteNumber} nicht in Datenbank gefunden. Versuche Xentral.`);
            // Wenn nicht in der Datenbank, direkt zur Synchronisierung weiterleiten
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

        // Lieferschein von Xentral abrufen
        const xentralDeliveryNote = await xentralService.findDeliveryNoteByNumber(deliveryNoteNumber);

        if (!xentralDeliveryNote) {
            console.log(`Lieferschein ${deliveryNoteNumber} in Xentral nicht gefunden`);
            req.flash('error_msg', `Lieferschein ${deliveryNoteNumber} wurde in Xentral nicht gefunden.`);
            return res.redirect('/orders/search');
        }

        console.log('Xentral-Lieferschein gefunden:', xentralDeliveryNote.id);

        // Prüfen, ob dieser Lieferschein bereits in der Datenbank existiert
        let order = await Order.findOne({ deliveryNoteNumber });

        if (order) {
            // Auftrag aktualisieren
            console.log(`Aktualisiere existierenden Lieferschein ${deliveryNoteNumber}`);
            order.status = xentralService.mapXentralToInternalStatus(xentralDeliveryNote.status);
            order.updatedAt = new Date();
            order.updatedBy = req.user._id;

            await order.save();

            req.flash('success_msg', `Lieferschein ${deliveryNoteNumber} wurde aktualisiert.`);
        } else {
            // Detaillierte Informationen abrufen und neuen Auftrag anlegen
            console.log(`Erstelle neuen Lieferschein ${deliveryNoteNumber}`);

            try {
                const xentralDeliveryNoteDetails = await xentralService.getDeliveryNoteDetails(xentralDeliveryNote.id);
                console.log('Detail-Daten erhalten:', xentralDeliveryNoteDetails ? 'Ja' : 'Nein');

                // Bei Testdaten - simuliere Daten wenn keine vorhanden
                const customerData = xentralDeliveryNoteDetails?.customer || {};
                const itemsData = xentralDeliveryNoteDetails?.items || [];

                console.log(`Artikelanzahl: ${itemsData.length}`);

                order = new Order({
                    xentralId: xentralDeliveryNote.id,
                    deliveryNoteNumber,
                    orderNumber: xentralDeliveryNote.orderNumber,
                    status: xentralService.mapXentralToInternalStatus(xentralDeliveryNote.status),
                    createdAt: new Date(xentralDeliveryNote.createdAt || Date.now()),
                    deliveryDate: xentralDeliveryNote.deliveryDate ? new Date(xentralDeliveryNote.deliveryDate) : null,

                    // Kundeninformationen
                    customer: {
                        id: customerData.id || '',
                        name: customerData.name || '',
                        street: customerData.street || '',
                        zip: customerData.zipCode || '',
                        city: customerData.city || '',
                        country: customerData.country || '',
                        email: customerData.email || '',
                        phone: customerData.phone || ''
                    },

                    // Auftragspositionen
                    items: itemsData.map(item => ({
                        articleId: item.articleId || item.id || '',
                        articleNumber: item.articleNumber || item.number || '',
                        description: item.description || item.name || 'Keine Beschreibung',
                        quantity: item.quantity || 1,
                        unit: item.unit || 'Stk',
                        price: item.price || 0,
                        position: item.position || 0,
                        warehouseId: item.warehouseId || '',
                        warehouseName: item.warehouseName || '',
                        batch: item.batch || '',
                        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
                    })),

                    assignedTo: req.user._id,
                    updatedBy: req.user._id
                });

                await order.save();
                console.log(`Neuer Lieferschein ${deliveryNoteNumber} erfolgreich gespeichert`);

                req.flash('success_msg', `Lieferschein ${deliveryNoteNumber} wurde importiert.`);
            } catch (detailError) {
                console.error(`Fehler beim Abrufen der Details für Lieferschein ${xentralDeliveryNote.id}:`, detailError);
                req.flash('error_msg', `Fehler beim Abrufen der Details: ${detailError.message}`);
                return res.redirect('/orders/search');
            }
        }

        // Direkt zur Detailseite weiterleiten
        return res.redirect(`/orders/${order._id}`);
    } catch (error) {
        console.error('Fehler bei der Synchronisierung des Lieferscheins:', error);
        req.flash('error_msg', `Fehler bei der Synchronisierung: ${error.message}`);
        res.redirect('/orders/search');
    }
});

// Route für die Synchronisierung mit Xentral
router.get('/sync', ensureAuthenticated, orderController.syncAllOrders);

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

        // Status auf "completed" setzen
        order.status = 'completed';
        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        await order.save();

        req.flash('success_msg', `Lieferschein ${order.deliveryNoteNumber} wurde erfolgreich abgeschlossen`);
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
        console.log(`Verpackungsmethode für ${order.deliveryNoteNumber} aktualisiert: ${packagingMethod}`);

        // Weiterleitung zur entsprechenden Verpackungsansicht
        // Temporär zurück zur Detailseite, bis Verpackungsrouten implementiert sind
        req.flash('success_msg', 'Verpackungsmethode festgelegt. Diese Funktion wird noch implementiert.');
        res.redirect(`/orders/${order._id}`);
    } catch (error) {
        console.error('Fehler beim Festlegen der Verpackungsmethode:', error);
        req.flash('error_msg', 'Fehler beim Festlegen der Verpackungsmethode');
        res.redirect(`/orders/${req.params.id}`);
    }
});

// API Test Route
router.get('/api-test', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Führe API-Test durch...');
        const testResult = await xentralService.testConnection();

        res.render('orders/api-test', {
            title: 'API Test',
            user: req.user,
            testResult,
            apiConfig: {
                url: process.env.XENTRAL_API_URL || 'Nicht konfiguriert (Mock-Service aktiviert)',
                hasApiKey: !!process.env.XENTRAL_API_KEY
            }
        });
    } catch (error) {
        console.error('Fehler beim API-Test:', error);
        res.render('orders/api-test', {
            title: 'API Test',
            user: req.user,
            testResult: {
                success: false,
                error: error.message,
                status: 'Fehler',
                details: null
            },
            apiConfig: {
                url: process.env.XENTRAL_API_URL || 'Nicht konfiguriert (Mock-Service aktiviert)',
                hasApiKey: !!process.env.XENTRAL_API_KEY
            }
        });
    }
});

module.exports = router;