const axios = require('axios');

/**
 * No Border API Service
 * Basierend auf der API-Dokumentation: https://api.no-border.eu/apiadmin
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
        this.authToken = null;
        this.tokenExpiry = null;
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Authentifiziert sich bei der No Border API
     * Probiert verschiedene Authentifizierungsmethoden
     */
    async authenticate() {
        try {
            // Prüfen ob Token noch gültig
            if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
                return this.authToken;
            }

            console.log('Authentifiziere bei No Border API...');

            // Methode 1: Standard Login
            try {
                const authResponse = await this.tryLogin('/api/auth/login');
                if (authResponse) return this.processAuthResponse(authResponse);
            } catch (e1) {
                console.log('Standard Login fehlgeschlagen:', e1.response?.status);
            }

            // Methode 2: Alternativer Login-Endpunkt
            try {
                const authResponse = await this.tryLogin('/login');
                if (authResponse) return this.processAuthResponse(authResponse);
            } catch (e2) {
                console.log('Alternativer Login fehlgeschlagen:', e2.response?.status);
            }

            // Methode 3: API-Key Authentifizierung (falls Username eigentlich API-Key ist)
            try {
                const authResponse = await this.tryApiKeyAuth();
                if (authResponse) return this.processAuthResponse(authResponse);
            } catch (e3) {
                console.log('API-Key Auth fehlgeschlagen:', e3.response?.status);
            }

            // Methode 4: Basic Auth Header
            try {
                return this.setupBasicAuth();
            } catch (e4) {
                console.log('Basic Auth Setup fehlgeschlagen');
            }

            throw new Error('Alle Authentifizierungsmethoden fehlgeschlagen. Überprüfen Sie Ihre Anmeldedaten.');

        } catch (error) {
            console.error('Fehler bei der Authentifizierung:', error);
            throw new Error(`Authentifizierungsfehler: ${error.message}`);
        }
    }

    /**
     * Versucht Login mit verschiedenen Endpunkten
     */
    async tryLogin(endpoint) {
        const response = await axios.post(`${this.baseUrl}${endpoint}`, {
            username: this.username,
            password: this.password,
            email: this.username, // Falls Email statt Username verwendet wird
            user: this.username,
            login: this.username
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        return response;
    }

    /**
     * Versucht API-Key basierte Authentifizierung
     */
    async tryApiKeyAuth() {
        // Falls der "Username" eigentlich ein API-Key ist
        const response = await axios.post(`${this.baseUrl}/api/authenticate`, {
            apiKey: this.username,
            api_key: this.username,
            key: this.username,
            token: this.username
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        return response;
    }

    /**
     * Setup für Basic Authentication
     */
    setupBasicAuth() {
        const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        this.authToken = `Basic ${credentials}`;
        this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Stunden
        return this.authToken;
    }

    /**
     * Verarbeitet die Authentifizierungs-Antwort
     */
    processAuthResponse(authResponse) {
        const data = authResponse.data;

        // Verschiedene Token-Formate unterstützen
        this.authToken = data.token ||
            data.access_token ||
            data.accessToken ||
            data.auth_token ||
            data.authToken ||
            data.jwt;

        if (!this.authToken) {
            throw new Error('Kein Token in der Authentifizierungs-Antwort gefunden');
        }

        // Token-Gültigkeit setzen
        const expiresIn = data.expires_in || data.expiresIn || 3600;
        this.tokenExpiry = new Date(Date.now() + (expiresIn * 1000));

        console.log(`Authentifizierung erfolgreich. Token gültig bis: ${this.tokenExpiry.toISOString()}`);
        return this.authToken;
    }

    /**
     * Gibt die Headers mit aktueller Authentifizierung zurück
     */
    async getAuthHeaders() {
        const token = await this.authenticate();

        // Verschiedene Authorization-Header-Formate
        const authHeader = token.startsWith('Basic ') ? token : `Bearer ${token}`;

        return {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };
    }

    /**
     * Testet die Verbindung zur No Border API
     */
    async testConnection() {
        try {
            // Teste Authentifizierung
            await this.authenticate();

            console.log('✅ Authentifizierung erfolgreich');

            return {
                success: true,
                status: 'OK',
                data: {
                    message: 'Verbindung erfolgreich hergestellt',
                    service: 'No Border API',
                    timestamp: new Date().toISOString(),
                    tokenExpiry: this.tokenExpiry?.toISOString(),
                    baseUrl: this.baseUrl,
                    username: this.username
                }
            };
        } catch (error) {
            console.error('❌ Verbindungstest fehlgeschlagen:', error);
            return {
                success: false,
                status: 'Fehler',
                error: error.message,
                data: {
                    baseUrl: this.baseUrl,
                    username: this.username,
                    suggestion: 'Überprüfen Sie Ihre Anmeldedaten und die API-Dokumentation unter https://api.no-border.eu/apiadmin'
                }
            };
        }
    }

    /**
     * Ruft alle Sales Orders mit spezifischen Filtern ab
     * Verwendet den korrekten Endpunkt aus der API-Dokumentation
     */
    async getOpenDeliveryNotes(page = 1, limit = 50) {
        try {
            const requestBody = {
                filters: [
                    {
                        key: "status",
                        op: "in",
                        value: ["in fulfillment"]
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

            const headers = await this.getAuthHeaders();

            // Verschiedene mögliche Endpunkte für Sales Orders
            const endpoints = [
                '/api/sales-orders/getAll',
                '/api/salesorders/getAll',
                '/api/orders/getAll',
                '/salesorders/getAll',
                '/orders/getAll'
            ];

            let response = null;
            let lastError = null;

            for (const endpoint of endpoints) {
                try {
                    console.log(`📡 Versuche Endpunkt: ${this.baseUrl}${endpoint}`);
                    response = await axios.post(`${this.baseUrl}${endpoint}`, requestBody, {
                        headers,
                        timeout: 30000
                    });
                    console.log(`✅ Erfolgreicher Endpunkt: ${endpoint}`);
                    break;
                } catch (error) {
                    lastError = error;
                    console.log(`❌ Endpunkt ${endpoint} fehlgeschlagen: ${error.response?.status}`);

                    // Bei 401 Token zurücksetzen
                    if (error.response?.status === 401) {
                        this.authToken = null;
                        this.tokenExpiry = null;
                    }
                    continue;
                }
            }

            if (!response) {
                throw lastError || new Error('Alle Sales Orders Endpunkte fehlgeschlagen');
            }

            console.log(`📊 No Border API Response: ${response.data.data?.length || 0} Lieferscheine gefunden`);

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
            console.error('❌ Fehler beim Abrufen der Lieferscheine:', error);
            throw new Error(`No Border API Fehler: ${error.message}`);
        }
    }

    /**
     * Ruft Details zu einem spezifischen Sales Order ab
     */
    async getDeliveryNoteDetails(salesOrderId) {
        try {
            const headers = await this.getAuthHeaders();

            // Verschiedene Detail-Endpunkte versuchen
            const endpoints = [
                `/api/sales-orders/${salesOrderId}`,
                `/api/salesorders/${salesOrderId}`,
                `/api/orders/${salesOrderId}`,
                `/salesorders/${salesOrderId}`,
                `/orders/${salesOrderId}`
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                        headers,
                        timeout: 10000
                    });
                    return response.data;
                } catch (error) {
                    if (error.response?.status === 401) {
                        this.authToken = null;
                        this.tokenExpiry = null;
                    }
                    continue;
                }
            }

            throw new Error(`Kein funktionierender Detail-Endpunkt für ID ${salesOrderId} gefunden`);
        } catch (error) {
            console.error(`Fehler beim Abrufen der Details für ${salesOrderId}:`, error);
            throw new Error(`Fehler beim Abrufen der Details: ${error.message}`);
        }
    }

    /**
     * Sucht einen Sales Order nach Nummer
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

            const headers = await this.getAuthHeaders();
            const response = await axios.post(`${this.baseUrl}/api/sales-orders/getAll`, requestBody, {
                headers,
                timeout: 10000
            });

            const orders = response.data.data || [];
            return orders.length > 0 ? orders[0] : null;
        } catch (error) {
            console.error(`Fehler beim Suchen des Lieferscheins ${deliveryNoteNumber}:`, error);

            if (error.response?.status === 401) {
                this.authToken = null;
                this.tokenExpiry = null;
            }

            throw new Error(`Fehler bei der Suche: ${error.message}`);
        }
    }

    /**
     * Aktualisiert den Status eines Sales Orders
     */
    async updateDeliveryNoteStatus(salesOrderId, status) {
        try {
            const requestBody = { status: status };
            const headers = await this.getAuthHeaders();

            const response = await axios.put(`${this.baseUrl}/api/sales-orders/${salesOrderId}`, requestBody, {
                headers,
                timeout: 10000
            });

            return response.data;
        } catch (error) {
            console.error(`Fehler beim Status-Update für ${salesOrderId}:`, error);

            if (error.response?.status === 401) {
                this.authToken = null;
                this.tokenExpiry = null;
            }

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

            // Lieferscheinpositionen
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
            'in fulfillment': 'new',
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
            'new': 'in fulfillment',
            'in_progress': 'processing',
            'packed': 'packed',
            'shipped': 'shipped',
            'completed': 'delivered',
            'cancelled': 'cancelled'
        };

        return statusMap[internalStatus] || 'in fulfillment';
    }
}

module.exports = NoBorderApiService;