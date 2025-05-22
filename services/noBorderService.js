const axios = require('axios');

/**
 * Korrigierte No Border API Service
 * Behebt das Problem mit der Response-Struktur (items statt data) und Artikel-Mapping
 */
class NoBorderApiService {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl || 'https://api.no-border.eu';
        this.username = username;
        this.password = password;

        if (this.username && this.password) {
            const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
            this.authHeader = `Basic ${credentials}`;
        }
    }

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

    async testConnection() {
        try {
            console.log('Teste No Border API Verbindung...');
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
                    testResult: `${result.data.length} Lieferscheine gefunden (Test mit Limit 1)`,
                    totalAvailable: result.meta.total
                }
            };
        } catch (error) {
            return {
                success: false,
                status: 'Fehler',
                error: error.message,
                data: {
                    baseUrl: this.baseUrl,
                    username: this.username,
                    suggestion: 'Überprüfen Sie Ihre Anmeldedaten und die API-Dokumentation'
                }
            };
        }
    }

    /**
     * Ruft offene Lieferscheine ab - bevorzugt "inFulfillment" Status
     */
    async getOpenDeliveryNotes(page = 1, limit = 50) {
        try {
            // Schritt 1: Versuche zuerst "inFulfillment" (wie gewünscht)
            let requestBody = {
                filters: [
                    {
                        key: "status",
                        op: "eq",
                        value: "inFulfillment"
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

            console.log('🔍 Suche nach "inFulfillment" Status...');
            console.log('📋 Request Body:', JSON.stringify(requestBody, null, 2));

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/search`;

            const response = await axios.post(endpoint, requestBody, {
                headers,
                timeout: 30000
            });

            console.log('📡 Raw API Response Status:', response.status);
            console.log('📊 Response Keys:', Object.keys(response.data));

            // KORREKTUR: API gibt "items" zurück, nicht "data"!
            const items = response.data.items || [];
            const totalCount = response.data.extra?.totalCount || 0;

            console.log(`📊 "inFulfillment" Ergebnis: ${items.length} von ${totalCount} gefunden`);

            // Falls inFulfillment keine Ergebnisse liefert, aber orders_by_status zeigt, dass welche da sind
            if (items.length === 0 && response.data.orders_by_status?.inFulfillment > 0) {
                console.log(`⚠️ Paradox: orders_by_status zeigt ${response.data.orders_by_status.inFulfillment} inFulfillment, aber Filter gibt 0 zurück`);
                console.log('🔄 Versuche alternative Filterung...');

                // Versuche mit "in" Operator
                requestBody.filters[0].op = "in";
                requestBody.filters[0].value = ["inFulfillment"];

                const retryResponse = await axios.post(endpoint, requestBody, {
                    headers,
                    timeout: 30000
                });

                const retryItems = retryResponse.data.items || [];
                console.log(`🔄 Retry mit "in" Operator: ${retryItems.length} gefunden`);

                if (retryItems.length > 0) {
                    return {
                        success: true,
                        data: retryItems,
                        meta: {
                            total: retryResponse.data.extra?.totalCount || 0,
                            page: page,
                            limit: limit,
                            totalPages: Math.ceil((retryResponse.data.extra?.totalCount || 0) / limit)
                        }
                    };
                }
            }

            // Falls inFulfillment immer noch leer ist, aber laut orders_by_status welche da sein sollten
            if (items.length === 0 && response.data.orders_by_status?.inFulfillment > 0) {
                console.log('⚠️ Fallback: Hole alle Aufträge und filtere manuell...');

                // Hole alle Aufträge ohne Filter
                const allOrdersResponse = await axios.post(endpoint, {
                    limit: Math.min(limit * 2, 100),
                    page: page,
                    sort: [{ key: "date", order: "DESC" }]
                }, {
                    headers,
                    timeout: 30000
                });

                const allItems = allOrdersResponse.data.items || [];
                // Manuell nach inFulfillment filtern
                const filteredItems = allItems.filter(item => item.status === 'inFulfillment');

                console.log(`🔍 Manueller Filter: ${filteredItems.length} inFulfillment von ${allItems.length} gefunden`);

                if (filteredItems.length > 0) {
                    return {
                        success: true,
                        data: filteredItems,
                        meta: {
                            total: response.data.orders_by_status?.inFulfillment || filteredItems.length,
                            page: page,
                            limit: limit,
                            totalPages: Math.ceil((response.data.orders_by_status?.inFulfillment || filteredItems.length) / limit)
                        }
                    };
                }
            }

            // Normale Rückgabe für inFulfillment (wenn gefunden)
            if (items.length > 0) {
                console.log(`✅ ${items.length} "inFulfillment" Lieferscheine erfolgreich abgerufen`);
                return {
                    success: true,
                    data: items,
                    meta: {
                        total: totalCount,
                        page: page,
                        limit: limit,
                        totalPages: Math.ceil(totalCount / limit)
                    }
                };
            }

            // Falls inFulfillment wirklich leer ist, informiere den Benutzer
            console.log('ℹ️ Keine "inFulfillment" Lieferscheine gefunden');
            console.log('📊 Verfügbare Status:', JSON.stringify(response.data.orders_by_status, null, 2));

            return {
                success: true,
                data: [],
                meta: {
                    total: 0,
                    page: page,
                    limit: limit,
                    totalPages: 0
                },
                statusInfo: response.data.orders_by_status
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
     * Fallback-Methode: Hole mit "processing" Status falls inFulfillment leer ist
     */
    async getProcessingOrders(page = 1, limit = 50) {
        try {
            const requestBody = {
                filters: [
                    {
                        key: "status",
                        op: "eq",
                        value: "processing"
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

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/search`;

            const response = await axios.post(endpoint, requestBody, {
                headers,
                timeout: 30000
            });

            // Verwende "items" statt "data"
            const items = response.data.items || [];
            const totalCount = response.data.extra?.totalCount || 0;

            return {
                success: true,
                data: items,
                meta: {
                    total: totalCount,
                    page: page,
                    limit: limit,
                    totalPages: Math.ceil(totalCount / limit)
                }
            };

        } catch (error) {
            throw new Error(`Fehler beim Abrufen der Processing Orders: ${error.message}`);
        }
    }

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

    async findDeliveryNoteByNumber(deliveryNoteNumber) {
        try {
            // Versuche verschiedene Suchfelder
            const searchFields = [
                "documentNumber",
                "externalOrderNumber",
                "customerOrderNumber",
                "deliveryNoteNumber"
            ];

            for (const field of searchFields) {
                try {
                    const requestBody = {
                        filters: [
                            {
                                key: field,
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

                    // Verwende "items" statt "data"
                    const orders = response.data.items || [];
                    if (orders.length > 0) {
                        console.log(`✅ Lieferschein über Feld "${field}" gefunden`);
                        return orders[0];
                    }
                } catch (fieldError) {
                    console.log(`⚠️ Suche über Feld "${field}" fehlgeschlagen: ${fieldError.message}`);
                }
            }

            return null;
        } catch (error) {
            console.error(`Fehler beim Suchen des Sales Orders ${deliveryNoteNumber}:`, error);
            throw new Error(`Fehler bei der Suche: ${error.message}`);
        }
    }

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
     * VOLLSTÄNDIG KORRIGIERTE Konvertierungsfunktion
     */
    convertToInternalFormat(noBorderOrder) {
        console.log('🔄 Konvertiere No Border Order:', noBorderOrder.id);

        // Debug: Log der salesOrder Struktur
        if (noBorderOrder.salesOrder?.positions) {
            console.log(`📦 ${noBorderOrder.salesOrder.positions.length} Positionen gefunden`);
        }

        return {
            // Basis-Informationen
            id: noBorderOrder.id,
            deliveryNoteNumber: noBorderOrder.documentNumber || noBorderOrder.externalOrderNumber || noBorderOrder.id,
            orderNumber: noBorderOrder.externalOrderNumber || noBorderOrder.customerOrderNumber,
            status: this.mapNoBorderToInternalStatus(noBorderOrder.status),

            // Zeitstempel
            createdAt: noBorderOrder.createdAt ? new Date(noBorderOrder.createdAt) : new Date(),
            updatedAt: noBorderOrder.updatedAt ? new Date(noBorderOrder.updatedAt) : new Date(),
            documentDate: noBorderOrder.date ? new Date(noBorderOrder.date) : null,

            // Kundeninformationen aus salesOrder
            customer: {
                id: noBorderOrder.salesOrder?.customer?.id || '',
                name: noBorderOrder.salesOrder?.delivery?.shippingAddress?.name || '',
                name2: noBorderOrder.salesOrder?.delivery?.shippingAddress?.department || '',
                street: noBorderOrder.salesOrder?.delivery?.shippingAddress?.street || '',
                zip: noBorderOrder.salesOrder?.delivery?.shippingAddress?.zipCode || '',
                city: noBorderOrder.salesOrder?.delivery?.shippingAddress?.city || '',
                country: noBorderOrder.salesOrder?.delivery?.shippingAddress?.country || '',
                email: noBorderOrder.salesOrder?.delivery?.email || '',
                phone: '' // Nicht in API verfügbar
            },

            // VOLLSTÄNDIG KORRIGIERTE Artikel-Konvertierung
            items: (noBorderOrder.salesOrder?.positions || []).map((position, index) => {
                console.log(`📦 Verarbeite Artikel ${index + 1}:`, position.product?.number, '|', position.product?.name);

                return {
                    id: position.id || `item_${index}`,
                    productId: position.product?.id,

                    // KRITISCH: Korrekte Feldmappings für Anzeige
                    sku: position.product?.number, // "1011-H"
                    articleNumber: position.product?.number, // Für Tabellen-Anzeige
                    productCode: position.product?.number,
                    productName: position.product?.name, // "Geldbörse / 7 Kartenfächer"
                    name: position.product?.name,
                    description: position.product?.name, // Haupt-Beschreibung für Anzeige

                    // Zusätzliche Beschreibungen
                    longDescription: position.product?.description || position.comment || '',
                    comment: position.comment || '',

                    quantity: position.quantity || 1,
                    unit: 'Stk', // Standard-Einheit
                    price: parseFloat(position.price?.amount || 0),
                    currency: position.price?.currency || 'EUR',
                    position: position.sort || index + 1,

                    // Steuer-Informationen
                    tax: position.tax?.effectiveVatRate || 0,
                    taxText: position.tax?.taxText || '',

                    // Rabatt
                    discount: position.discount || 0,

                    // Umsatz-Informationen
                    netRevenue: parseFloat(position.netRevenueSingle?.amount || 0),
                    grossRevenue: parseFloat(position.grossRevenueSingle?.amount || 0),

                    // Kommissionier-Status (Standard-Werte)
                    quantityPicked: 0,
                    pickingStatus: 'pending',

                    // Lager-Informationen (leer, da nicht in dieser API-Response)
                    warehouseId: '',
                    warehouseName: '',
                    storageLocation: '',
                    storageLocationId: '',
                    storageLocationName: '',
                    batch: '',

                    // Meta-Informationen
                    webId: position.webId || '',
                    hasChildren: position.hasChildren || false
                };
            }),

            // Versand-Informationen
            shipping: {
                method: noBorderOrder.salesOrder?.delivery?.shippingMethod?.id || '',
                carrier: noBorderOrder.carrier || '',
                trackingNumber: noBorderOrder.trackingNumbers?.join(', ') || '',
                cost: 0,
                hasTracking: noBorderOrder.hasTracking || false
            },

            // Weitere Lieferschein-Informationen
            shippingMethod: noBorderOrder.salesOrder?.delivery?.shippingMethod ? {
                id: noBorderOrder.salesOrder.delivery.shippingMethod.id
            } : null,

            // Projekt-Informationen
            project: noBorderOrder.salesOrder?.project ? {
                id: noBorderOrder.salesOrder.project.id
            } : null,

            // Warehouse-Info
            warehouse: noBorderOrder.warehouse || '',

            // Sales Order Informationen
            salesOrder: noBorderOrder.salesOrder ? {
                id: noBorderOrder.salesOrder.id
            } : null,

            // Weitere Informationen
            externalOrderId: noBorderOrder.externalOrderId || '',
            externalOrderNumber: noBorderOrder.externalOrderNumber || '',
            customerOrderNumber: noBorderOrder.customerOrderNumber || '',

            // Totale
            total: {
                amount: noBorderOrder.salesOrder?.total?.amount || '0',
                currency: noBorderOrder.salesOrder?.total?.currency || 'EUR'
            },
            netSales: {
                amount: noBorderOrder.salesOrder?.netSales?.amount || '0',
                currency: noBorderOrder.salesOrder?.netSales?.currency || 'EUR'
            },

            // Rechnungs-Informationen
            invoiceId: noBorderOrder.invoiceId || null,
            invoiceNumber: noBorderOrder.invoiceNumber || null
        };
    }

    mapNoBorderToInternalStatus(noBorderStatus) {
        const statusMap = {
            'inFulfillment': 'new',
            'processing': 'in_progress',
            'created': 'new',
            'released': 'new',
            'shipped': 'shipped',
            'completed': 'completed',
            'canceled': 'cancelled'
        };

        return statusMap[noBorderStatus] || 'new';
    }

    mapInternalToNoBorderStatus(internalStatus) {
        const statusMap = {
            'new': 'inFulfillment',
            'in_progress': 'processing',
            'packed': 'processing',
            'shipped': 'shipped',
            'completed': 'completed',
            'cancelled': 'canceled'
        };

        return statusMap[internalStatus] || 'inFulfillment';
    }
}

module.exports = NoBorderApiService;