onst Order = require('../models/order');

/**
 * Order Controller
 * Stellt Methoden zur Verwaltung und Synchronisierung von Lieferscheinen bereit.
 */
class OrderController {
    /**
     * Initialisiert den OrderController.
     * @param {XentralApiService} xentralApiService - Der Xentral API Service
     */
    constructor(xentralApiService) {
        this.xentralApiService = xentralApiService;
    }

    /**
     * Synchronisiert alle Lieferscheine aus Xentral mit der lokalen Datenbank.
     * Ruft rekursiv alle Seiten ab, bis alle Lieferscheine synchronisiert sind.
     *
     * @param {number} page - Die aktuelle Seite (für Paginierung)
     * @param {number} pageSize - Die Anzahl der Einträge pro Seite
     * @returns {Promise<Object>} - Status der Synchronisierung
     */
    async syncAllOrders(page = 1, pageSize = 100) {
        try {
            // 1. Liste der Lieferscheine holen
            const deliveryNotesList = await this.xentralApiService.listDeliveryNotes(page, pageSize);

            console.log(`${deliveryNotesList.data.length} Lieferscheine gefunden.`);

            // 2. Für jeden Lieferschein die Details abrufen und in der Datenbank aktualisieren
            for (const deliveryNoteInfo of deliveryNotesList.data) {
                try {
                    await this.importOrUpdateSingleOrder(deliveryNoteInfo.id);
                } catch (orderError) {
                    console.error(`Fehler bei Lieferschein ${deliveryNoteInfo.number}:`, orderError.message);
                }
            }

            // 3. Prüfen, ob weitere Seiten vorhanden sind
            const totalCount = deliveryNotesList.extra?.totalCount || 0;
            const totalPages = Math.ceil(totalCount / pageSize);

            if (page < totalPages) {
                // Rekursiv die nächste Seite abrufen
                await this.syncAllOrders(page + 1, pageSize);
            }

            console.log('Synchronisierung aller Lieferscheine abgeschlossen.');
            return { success: true, message: 'Synchronisierung abgeschlossen' };
        } catch (error) {
            console.error('Fehler bei der Synchronisierung der Lieferscheine:', error);
            throw error;
        }
    }

    /**
     * Importiert oder aktualisiert einen einzelnen Lieferschein.
     * Ruft die detaillierten Informationen aus der DeliveryNoteView-API ab und speichert sie in der Datenbank.
     *
     * @param {string} id - Die ID des Lieferscheins in Xentral
     * @returns {Promise<Object>} - Der importierte oder aktualisierte Lieferschein
     */
    async importOrUpdateSingleOrder(id) {
        try {
            // 1. Detaillierte Lieferscheindaten von Xentral abrufen
            const deliveryNoteDetails = await this.xentralApiService.getDeliveryNoteDetails(id);

            // Debug-Logging, um die API-Antwort zu verstehen
            // console.log('DeliveryNoteView Antwort:', JSON.stringify(deliveryNoteDetails, null, 2));

            // 2. Vorhandenen Lieferschein in der Datenbank suchen oder neuen erstellen
            let order = await Order.findOne({
                $or: [
                    { id: id },
                    { number: deliveryNoteDetails.number },
                    { deliveryNoteNumber: deliveryNoteDetails.number }
                ]
            });

            if (!order) {
                console.log(`Erstelle neuen Lieferschein für ${deliveryNoteDetails.number}`);
                order = Order.createMinimalOrder(deliveryNoteDetails.number);
            } else {
                console.log(`Aktualisiere vorhandenen Lieferschein ${deliveryNoteDetails.number}`);
            }

            // 3. Grunddaten aus der DeliveryNoteView übernehmen
            order.id = deliveryNoteDetails.id;
            order.number = deliveryNoteDetails.number;
            order.deliveryNoteNumber = deliveryNoteDetails.number;
            order.documentDate = deliveryNoteDetails.date ? new Date(deliveryNoteDetails.date) : null;
            order.createdAt = deliveryNoteDetails.createdAt ? new Date(deliveryNoteDetails.createdAt) : order.createdAt;
            order.updatedAt = deliveryNoteDetails.updatedAt ? new Date(deliveryNoteDetails.updatedAt) : new Date();
            order.status = deliveryNoteDetails.status || 'new';
            order.type = deliveryNoteDetails.type || '';

            // 4. Empfänger/Kunde
            if (deliveryNoteDetails.address) {
                order.receiver = {
                    id: deliveryNoteDetails.address.id,
                    name: deliveryNoteDetails.address.name,
                    number: deliveryNoteDetails.address.number,
                    department: deliveryNoteDetails.address.department,
                    street: deliveryNoteDetails.address.street,
                    zip: deliveryNoteDetails.address.zip,
                    city: deliveryNoteDetails.address.city,
                    email: deliveryNoteDetails.address.email,
                    phone: deliveryNoteDetails.address.phone
                };

                order.country = deliveryNoteDetails.address.country;
                order.countryIso = deliveryNoteDetails.address.countryIso;
            }

            // 5. Projekt
            if (deliveryNoteDetails.project) {
                order.project = {
                    id: deliveryNoteDetails.project.id,
                    name: deliveryNoteDetails.project.name
                };
            }

            // 6. Versandmethode
            if (deliveryNoteDetails.shippingMethod) {
                order.shippingMethod = {
                    id: deliveryNoteDetails.shippingMethod.id,
                    name: deliveryNoteDetails.shippingMethod.name
                };
            }

            // 7. Verknüpfter Auftrag
            if (deliveryNoteDetails.salesOrder) {
                order.salesOrder = {
                    id: deliveryNoteDetails.salesOrder.id
                };
                order.orderNumber = deliveryNoteDetails.salesOrder.number;
            }

            // 8. Positionen mappen und zuweisen
            if (deliveryNoteDetails.positions && Array.isArray(deliveryNoteDetails.positions)) {
                console.log(`${deliveryNoteDetails.positions.length} Positionen gefunden für Lieferschein ${deliveryNoteDetails.number}`);
                // Debug-Logging für die erste Position
                // if (deliveryNoteDetails.positions.length > 0) {
                //     console.log('Beispiel Position:', JSON.stringify(deliveryNoteDetails.positions[0], null, 2));
                // }
                order.items = Order.mapApiPositionsToSchema(deliveryNoteDetails.positions);
            } else {
                console.warn(`Keine Positionen für Lieferschein ${deliveryNoteDetails.number} gefunden.`);
            }

            // 9. Speichern
            await order.save();
            console.log(`Lieferschein ${deliveryNoteDetails.number} erfolgreich gespeichert.`);

            return order;
        } catch (error) {
            console.error(`Fehler beim Importieren/Aktualisieren des Lieferscheins mit ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Markiert einen Lieferschein als versendet.
     * Aktualisiert sowohl die lokale Datenbank als auch Xentral.
     *
     * @param {string} id - Die ID des Lieferscheins
     * @param {string} trackingNumber - Die Sendungsverfolgungsnummer (optional)
     * @returns {Promise<Object>} - Der aktualisierte Lieferschein
     */
    async markOrderAsShipped(id, trackingNumber = null) {
        try {
            // 1. Lieferschein in der Datenbank finden
            const order = await Order.findOne({ id: id });

            if (!order) {
                throw new Error(`Lieferschein mit ID ${id} nicht gefunden.`);
            }

            // 2. Lieferschein in Xentral aktualisieren
            await this.xentralApiService.markDeliveryNoteAsShipped(id, trackingNumber);

            // 3. Lieferschein in der lokalen Datenbank aktualisieren
            order.status = 'shipped';
            order.shippingStatus = 'shipped';

            if (trackingNumber) {
                if (!order.shipping) {
                    order.shipping = {};
                }
                order.shipping.trackingNumber = trackingNumber;
            }

            order.shippingDate = new Date();
            await order.save();

            return order;
        } catch (error) {
            console.error(`Fehler beim Markieren des Lieferscheins ${id} als versendet:`, error);
            throw error;
        }
    }

    /**
     * Ruft einen einzelnen Lieferschein ab.
     *
     * @param {string} id - Die ID des Lieferscheins
     * @returns {Promise<Object>} - Der Lieferschein
     */
    async getOrder(id) {
        try {
            const order = await Order.findOne({ id: id });

            if (!order) {
                throw new Error(`Lieferschein mit ID ${id} nicht gefunden.`);
            }

            return order;
        } catch (error) {
            console.error(`Fehler beim Abrufen des Lieferscheins ${id}:`, error);
            throw error;
        }
    }

    /**
     * Ruft alle Lieferscheine ab.
     *
     * @param {Object} filter - Filter für die Abfrage
     * @param {Object} options - Optionen für die Abfrage (sort, limit, skip)
     * @returns {Promise<Array>} - Die Liste der Lieferscheine
     */
    async getOrders(filter = {}, options = {}) {
        try {
            const query = Order.find(filter);

            if (options.sort) {
                query.sort(options.sort);
            }

            if (options.limit) {
                query.limit(options.limit);
            }

            if (options.skip) {
                query.skip(options.skip);
            }

            return await query.exec();
        } catch (error) {
            console.error('Fehler beim Abrufen der Lieferscheine:', error);
            throw error;
        }
    }
}

module.exports = OrderController;