const axios = require('axios');

/**
 * No Border API Service
 * Verwendet Basic Authentication für https://api.no-border.eu/
 */
class NoBorderApiService {
    /**
     * Initialisiert den No Border API Service.
     * @param {string} baseUrl - Die Basis-URL der No Border API
     * @param {string} username - Benutzername für die Authentifizierung
     * @param {string} password - Passwort für die Authentifizierung
     */
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl || 'https://api.no-border.eu';
        this.username = username;
        this.password = password;

        // Basic Auth Header vorbereiten
        if (this.username && this.password) {
            const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
            this.authHeader = `Basic ${credentials}`;
        }
    }

    /**
     * Gibt die Headers mit Basic Authentication zurück
     */
    getAuthHeaders() {
        if (!this.authHeader) {
            throw new Error('Keine Authentifizierungsdaten konfiguriert');
        }

        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': this.authHeader
        };
    }

    /**
     * Testet die Verbindung zur No Border API
     */
    async testConnection() {
        try {
            console.log('Teste No Border API Verbindung...');
            console.log(`Base URL: ${this.baseUrl}`);
            console.log(`Username: ${this.username}`);

            // Teste mit einem einfachen Request
            const result = await this.getOpenDeliveryNotes(1, 1);

            return {
                success: true,
                status: 'OK',
                data: {
                    message: 'Verbindung erfolgreich hergestellt',
                    service: 'No Border API',
                    timestamp: new Date().toISOString(),
                    baseUrl: this.baseUrl,
                    username: this.username,
                    testResult: `${result.data.length} Sales Orders gefunden (Test mit Limit 1)`
                }
            };
        } catch (error) {
            console.error('❌ Verbindungstest fehlgeschlagen:', error);

            let errorMessage = error.message;
            let suggestion = 'Überprüfen Sie Ihre Anmeldedaten und die API-Dokumentation';

            if (error.response) {
                errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;

                if (error.response.status === 401) {
                    suggestion = 'Authentifizierung fehlgeschlagen. Überprüfen Sie Username und Passwort in der .env Datei';
                } else if (error.response.status === 404) {
                    suggestion = 'API-Endpunkt nicht gefunden. Überprüfen Sie die Base URL';
                }
            }

            return {
                success: false,
                status: 'Fehler',
                error: errorMessage,
                data: {
                    baseUrl: this.baseUrl,
                    username: this.username,
                    suggestion: suggestion,
                    responseData: error.response?.data
                }
            };
        }
    }

    /**
     * Ruft alle Sales Orders mit spezifischen Filtern ab
     * Verwendet den korrekten Endpunkt: /sales-orders/search
     */
    async getOpenDeliveryNotes(page = 1, limit = 50) {
        try {
            const requestBody = {
                filters: [
                    {
                        key: "status",
                        op: "in",
                        value: ["inFulfillment"] // Korrekter Status-Name
                    }
                ],
                limit: limit,
                page: page,
                sort: [
                    {
                        key: "date",
                        order: "DESC"
                    }
                ]
            };

            console.log('🔍 No Border API Request:', JSON.stringify(requestBody, null, 2));

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/search`; // Korrekter Endpunkt

            console.log(`📡 Request an: ${endpoint}`);

            const response = await axios.post(endpoint, requestBody, {
                headers,
                timeout: 30000
            });

            console.log(`📊 No Border API Response: ${response.data.data?.length || 0} Sales Orders gefunden`);

            return {
                success: true,
                data: response.data.data || [],
                meta: {
                    total: response.data.total || 0,
                    page: page,
                    limit: limit,
                    totalPages: Math.ceil((response.data.total || 0) / limit)
                }
            };
        } catch (error) {
            console.error('❌ Fehler beim Abrufen der Sales Orders:', error);

            if (error.response) {
                console.error('Response Status:', error.response.status);
                console.error('Response Data:', error.response.data);
            }

            throw new Error(`No Border API Fehler: ${error.message}`);
        }
    }

    /**
     * Ruft Details zu einem spezifischen Sales Order ab
     */
    async getDeliveryNoteDetails(salesOrderId) {
        try {
            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/${salesOrderId}`;

            const response = await axios.get(endpoint, {
                headers,
                timeout: 10000
            });

            return response.data;
        } catch (error) {
            console.error(`Fehler beim Abrufen der Details für ${salesOrderId}:`, error);
            throw new Error(`Fehler beim Abrufen der Details: ${error.message}`);
        }
    }

    /**
     * Sucht einen Sales Order nach Delivery Note Number
     */
    async findDeliveryNoteByNumber(deliveryNoteNumber) {
        try {
            const requestBody = {
                filters: [
                    {
                        key: "deliveryNoteNumber",
                        op: "eq",
                        value: deliveryNoteNumber
                    }
                ],
                limit: 1,
                page: 1
            };

            const headers = this.getAuthHeaders();
            const response = await axios.post(`${this.baseUrl}/sales-orders/search`, requestBody, {
                headers,
                timeout: 10000
            });

            const orders = response.data.data || [];
            return orders.length > 0 ? orders[0] : null;
        } catch (error) {
            console.error(`Fehler beim Suchen des Sales Orders ${deliveryNoteNumber}:`, error);
            throw new Error(`Fehler bei der Suche: ${error.message}`);
        }
    }

    /**
     * Aktualisiert den Status eines Sales Orders
     */
    async updateDeliveryNoteStatus(salesOrderId, status) {
        try {
            const requestBody = { status: status };
            const headers = this.getAuthHeaders();

            const response = await axios.put(`${this.baseUrl}/sales-orders/${salesOrderId}`, requestBody, {
                headers,
                timeout: 10000
            });

            return response.data;
        } catch (error) {
            console.error(`Fehler beim Status-Update für ${salesOrderId}:`, error);
            throw new Error(`Fehler beim Status-Update: ${error.message}`);
        }
    }

    /**
     * Konvertiert No Border API-Daten in das interne Format
     */
    convertToInternalFormat(noBorderOrder) {
        return {
            // Basis-Informationen
            id: noBorderOrder.id,
            deliveryNoteNumber: noBorderOrder.deliveryNoteNumber || noBorderOrder.orderNumber || noBorderOrder.number,
            orderNumber: noBorderOrder.orderNumber || noBorderOrder.number,
            status: this.mapNoBorderToInternalStatus(noBorderOrder.status),

            // Zeitstempel
            createdAt: noBorderOrder.createdAt ? new Date(noBorderOrder.createdAt) : new Date(),
            updatedAt: noBorderOrder.updatedAt ? new Date(noBorderOrder.updatedAt) : new Date(),
            documentDate: noBorderOrder.date ? new Date(noBorderOrder.date) : null,
            deliveryDate: noBorderOrder.deliveryDate ? new Date(noBorderOrder.deliveryDate) : null,

            // Kundeninformationen
            customer: {
                id: noBorderOrder.customer?.id || '',
                name: noBorderOrder.customer?.name || noBorderOrder.shippingAddress?.name || '',
                street: noBorderOrder.shippingAddress?.street || '',
                zip: noBorderOrder.shippingAddress?.zipCode || '',
                city: noBorderOrder.shippingAddress?.city || '',
                country: noBorderOrder.shippingAddress?.country || '',
                email: noBorderOrder.customer?.email || '',
                phone: noBorderOrder.customer?.phone || ''
            },

            // Sales Order Positionen
            items: (noBorderOrder.items || []).map((item, index) => ({
                id: item.id || `item_${index}`,
                productId: item.productId || item.sku,
                sku: item.sku || item.productCode,
                productName: item.productName || item.name,
                name: item.productName || item.name,
                description: item.description || item.productName,
                quantity: item.quantity || 1,
                unit: item.unit || 'Stk',
                price: item.price || 0,
                position: item.position || index + 1,

                // Kommissionier-Status
                quantityPicked: 0,
                pickingStatus: 'pending'
            })),

            // Versand-Informationen
            shipping: {
                method: noBorderOrder.shippingMethod || '',
                carrier: noBorderOrder.carrier || '',
                trackingNumber: noBorderOrder.trackingNumber || '',
                cost: noBorderOrder.shippingCost || 0
            }
        };
    }

    /**
     * Status-Mapping Funktionen
     */
    mapNoBorderToInternalStatus(noBorderStatus) {
        const statusMap = {
            'inFulfillment': 'new',
            'processing': 'in_progress',
            'packed': 'packed',
            'shipped': 'shipped',
            'delivered': 'completed',
            'completed': 'completed',
            'cancelled': 'cancelled'
        };

        return statusMap[noBorderStatus] || 'new';
    }

    mapInternalToNoBorderStatus(internalStatus) {
        const statusMap = {
            'new': 'inFulfillment',
            'in_progress': 'processing',
            'packed': 'packed',
            'shipped': 'shipped',
            'completed': 'delivered',
            'cancelled': 'cancelled'
        };

        return statusMap[internalStatus] || 'inFulfillment';
    }
}

module.exports = NoBorderApiService;