const Order = require('../models/order');
const NoBorderApiService = require('../services/noBorderService');

/**
 * Order Controller für No Border API Integration
 */
class NoBorderOrderController {
    constructor() {
        this.noBorderService = new NoBorderApiService(
            process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
            process.env.NOBORDER_USERNAME,
            process.env.NOBORDER_PASSWORD
        );
    }

    /**
     * Synchronisiert alle offenen Lieferscheine von No Border API
     */
    async syncOpenOrders(req, res) {
        try {
            console.log('Starte Synchronisierung mit No Border API...');

            let page = 1;
            let totalSynced = 0;
            let totalErrors = 0;
            const limit = 50;

            while (true) {
                console.log(`Synchronisiere Seite ${page}...`);

                const response = await this.noBorderService.getOpenDeliveryNotes(page, limit);

                if (!response.success || !response.data || response.data.length === 0) {
                    console.log('Keine weiteren Lieferscheine gefunden');
                    break;
                }

                console.log(`${response.data.length} Lieferscheine auf Seite ${page} gefunden`);

                // Jeden Lieferschein verarbeiten
                for (const noBorderOrder of response.data) {
                    try {
                        await this.importOrUpdateSingleOrder(noBorderOrder);
                        totalSynced++;
                    } catch (orderError) {
                        console.error(`Fehler bei Lieferschein ${noBorderOrder.deliveryNoteNumber || noBorderOrder.id}:`, orderError.message);
                        totalErrors++;
                    }
                }

                // Prüfen ob weitere Seiten vorhanden sind
                if (page >= response.meta.totalPages) {
                    break;
                }
                page++;

                // Pause zwischen den Seiten
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            const message = `Synchronisierung abgeschlossen: ${totalSynced} Lieferscheine synchronisiert, ${totalErrors} Fehler`;
            console.log(message);

            if (res) {
                req.flash('success_msg', message);
                res.redirect('/orders');
            }

            return { success: true, synced: totalSynced, errors: totalErrors };
        } catch (error) {
            console.error('Fehler bei der Synchronisierung:', error);

            if (res) {
                req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
                res.redirect('/orders');
            }

            throw error;
        }
    }

    /**
     * Importiert oder aktualisiert einen einzelnen Lieferschein
     */
    async importOrUpdateSingleOrder(noBorderOrder) {
        const deliveryNoteNumber = noBorderOrder.deliveryNoteNumber || noBorderOrder.orderNumber;
        console.log(`Verarbeite Lieferschein: ${deliveryNoteNumber}`);

        // Konvertiere zu internem Format
        const orderData = this.noBorderService.convertToInternalFormat(noBorderOrder);

        // Suche existierenden Lieferschein
        let order = await Order.findOne({
            $or: [
                { id: orderData.id },
                { deliveryNoteNumber: deliveryNoteNumber },
                { orderNumber: orderData.orderNumber }
            ]
        });

        if (order) {
            console.log(`Aktualisiere existierenden Lieferschein: ${deliveryNoteNumber}`);

            // Aktualisiere nur bestimmte Felder
            order.status = orderData.status;
            order.updatedAt = new Date();

            // Aktualisiere Kundeninformationen falls leer
            if (!order.customer || !order.customer.name) {
                order.customer = orderData.customer;
            }

            // Aktualisiere Items falls keine vorhanden
            if (!order.items || order.items.length === 0) {
                order.items = orderData.items;
            }

        } else {
            console.log(`Erstelle neuen Lieferschein: ${deliveryNoteNumber}`);

            order = new Order({
                ...orderData,
                // Zusätzliche Felder für neuen Auftrag
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        await order.save();
        console.log(`Lieferschein ${deliveryNoteNumber} erfolgreich gespeichert`);

        return order;
    }

    /**
     * Automatische Synchronisierung (für Cron-Job)
     */
    async autoSync() {
        try {
            console.log('Automatische Synchronisierung gestartet...');
            const result = await this.syncOpenOrders();
            console.log(`Auto-Sync erfolgreich: ${result.synced} synchronisiert, ${result.errors} Fehler`);
            return result;
        } catch (error) {
            console.error('Fehler bei automatischer Synchronisierung:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Aktualisiert den Status eines Lieferscheins sowohl lokal als auch in No Border
     */
    async updateOrderStatus(orderId, newStatus, trackingNumber = null) {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                throw new Error(`Lieferschein mit ID ${orderId} nicht gefunden`);
            }

            // Status in No Border API aktualisieren
            const noBorderStatus = this.noBorderService.mapInternalToNoBorderStatus(newStatus);

            if (order.id) { // Nur wenn wir eine No Border ID haben
                await this.noBorderService.updateDeliveryNoteStatus(order.id, noBorderStatus);
            }

            // Lokalen Status aktualisieren
            order.status = newStatus;
            order.updatedAt = new Date();

            if (trackingNumber) {
                if (!order.shipping) order.shipping = {};
                order.shipping.trackingNumber = trackingNumber;
            }

            if (newStatus === 'shipped') {
                order.shippingDate = new Date();
            }

            await order.save();

            return order;
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Auftragsstatus:', error);
            throw error;
        }
    }

    /**
     * API-Test Route
     */
    async testApiConnection(req, res) {
        try {
            const testResult = await this.noBorderService.testConnection();

            res.render('orders/api-test', {
                title: 'No Border API Test',
                user: req.user,
                testResult,
                apiConfig: {
                    url: process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
                    hasCredentials: !!(process.env.NOBORDER_USERNAME && process.env.NOBORDER_PASSWORD),
                    username: process.env.NOBORDER_USERNAME || 'Nicht konfiguriert'
                }
            });
        } catch (error) {
            console.error('Fehler beim API-Test:', error);
            res.render('orders/api-test', {
                title: 'No Border API Test',
                user: req.user,
                testResult: {
                    success: false,
                    error: error.message,
                    status: 'Fehler'
                },
                apiConfig: {
                    url: process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
                    hasCredentials: !!(process.env.NOBORDER_USERNAME && process.env.NOBORDER_PASSWORD),
                    username: process.env.NOBORDER_USERNAME || 'Nicht konfiguriert'
                }
            });
        }
    }
}

module.exports = NoBorderOrderController;
