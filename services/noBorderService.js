const axios = require('axios');

/**
 * No Border API Service mit vollständiger Projekt-Unterstützung
 * Für Fulfillment-Dienstleister mit projekt-basierter Organisation
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

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/search`;

            const response = await axios.post(endpoint, requestBody, {
                headers,
                timeout: 30000
            });

            const items = response.data.items || [];
            const totalCount = response.data.extra?.totalCount || 0;

            console.log(`📊 "inFulfillment" Ergebnis: ${items.length} von ${totalCount} gefunden`);

            if (items.length > 0) {
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

            // Fallback auf andere Status wenn inFulfillment leer
            console.log('ℹ️ Keine "inFulfillment" Lieferscheine gefunden');
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
            throw new Error(`No Border API Fehler: ${error.message}`);
        }
    }

    /**
     * Ruft Aufträge nach Projekt ab
     */
    async getOrdersByProject(projectId, page = 1, limit = 50) {
        try {
            const requestBody = {
                filters: [
                    {
                        key: "project.id",
                        op: "eq",
                        value: projectId
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
            console.error('❌ Fehler beim Abrufen der Projekt-Aufträge:', error);
            throw new Error(`No Border API Fehler: ${error.message}`);
        }
    }

    /**
     * Ruft alle verfügbaren Projekte ab
     */
    async getAllProjects() {
        try {
            console.log('📁 Rufe Projekte von No Border API ab...');

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/projects`;

            // GET Request für Projekte
            const response = await axios.get(endpoint, {
                headers,
                timeout: 10000
            });

            console.log('✅ Projekte erfolgreich abgerufen');

            // No Border gibt die Projekte direkt zurück (nicht in items wrapper)
            const projects = response.data;

            if (Array.isArray(projects)) {
                // Formatiere die Projekte für unsere Anwendung
                return projects.map(project => ({
                    id: project.id || project.projectId,
                    name: project.name || project.projectName || `Projekt ${project.id}`,
                    description: project.description,
                    customerId: project.customerId,
                    customerName: project.customerName,
                    status: project.status,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                    // Zusätzliche Felder die No Border möglicherweise liefert
                    contactPerson: project.contactPerson,
                    budget: project.budget,
                    priority: project.priority,
                    tags: project.tags || [],
                    customFields: project.customFields || {},
                    // Für die Anzeige
                    orderCount: 0 // Wird später durch Aggregation gefüllt
                }));
            } else if (projects && typeof projects === 'object') {
                // Falls die API ein Objekt mit items zurückgibt
                const projectList = projects.items || projects.data || [];
                return projectList.map(project => ({
                    id: project.id || project.projectId,
                    name: project.name || project.projectName || `Projekt ${project.id}`,
                    description: project.description,
                    customerId: project.customerId,
                    customerName: project.customerName,
                    status: project.status,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                    contactPerson: project.contactPerson,
                    budget: project.budget,
                    priority: project.priority,
                    tags: project.tags || [],
                    customFields: project.customFields || {},
                    orderCount: 0
                }));
            }

            console.warn('⚠️ Unerwartetes Projekt-Datenformat:', typeof projects);
            return [];

        } catch (error) {
            console.error('❌ Fehler beim Abrufen der Projekte:', error.message);

            // Fallback: Aggregiere Projekte aus Sales Orders
            console.log('📊 Fallback: Aggregiere Projekte aus Sales Orders...');

            try {
                const headers = this.getAuthHeaders();
                const endpoint = `${this.baseUrl}/sales-orders/search`;

                const requestBody = {
                    limit: 100,
                    page: 1
                };

                const response = await axios.post(endpoint, requestBody, {
                    headers,
                    timeout: 30000
                });

                // Extrahiere eindeutige Projekte aus Orders
                const projectMap = new Map();
                const orders = response.data.items || [];

                orders.forEach(order => {
                    const projectInfo = this.extractProjectInfo(order);
                    if (projectInfo.id) {
                        const existing = projectMap.get(projectInfo.id) || { orderCount: 0 };
                        projectMap.set(projectInfo.id, {
                            id: projectInfo.id,
                            name: projectInfo.name || existing.name || `Projekt ${projectInfo.id}`,
                            orderCount: existing.orderCount + 1,
                            priority: projectInfo.priority || 'normal'
                        });
                    }
                });

                return Array.from(projectMap.values());

            } catch (fallbackError) {
                console.error('❌ Auch Fallback fehlgeschlagen:', fallbackError.message);
                return [];
            }
        }
    }

    /**
     * Ruft detaillierte Informationen zu einem Projekt ab
     */
    async getProjectDetails(projectId) {
        try {
            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/projects/${projectId}`;

            const response = await axios.get(endpoint, {
                headers,
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error(`❌ Fehler beim Abrufen der Projekt-Details für ${projectId}:`, error);
            throw new Error(`Fehler beim Abrufen der Projekt-Details: ${error.message}`);
        }
    }

    /**
     * Erstellt ein neues Projekt
     */
    async createProject(projectData) {
        try {
            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/projects`;

            const response = await axios.post(endpoint, projectData, {
                headers,
                timeout: 10000
            });

            console.log(`✅ Projekt ${projectData.name} erfolgreich erstellt`);
            return response.data;

        } catch (error) {
            console.error('❌ Fehler beim Erstellen des Projekts:', error);
            throw new Error(`Fehler beim Erstellen des Projekts: ${error.message}`);
        }
    }

    /**
     * Aktualisiert ein bestehendes Projekt
     */
    async updateProject(projectId, updateData) {
        try {
            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/projects/${projectId}`;

            const response = await axios.put(endpoint, updateData, {
                headers,
                timeout: 10000
            });

            console.log(`✅ Projekt ${projectId} erfolgreich aktualisiert`);
            return response.data;

        } catch (error) {
            console.error(`❌ Fehler beim Aktualisieren des Projekts ${projectId}:`, error);
            throw new Error(`Fehler beim Aktualisieren des Projekts: ${error.message}`);
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
     * Synchronisiert Projekt-spezifische Aufträge
     */
    async syncProjectOrders(projectId, page = 1, limit = 50) {
        try {
            console.log(`🔄 Synchronisiere Aufträge für Projekt ${projectId}...`);

            const result = await this.getOrdersByProject(projectId, page, limit);

            console.log(`✅ ${result.data.length} Aufträge für Projekt ${projectId} gefunden`);

            return result;

        } catch (error) {
            console.error(`❌ Fehler bei Projekt-Synchronisierung ${projectId}:`, error);
            throw error;
        }
    }

    /**
     * Extrahiert Projekt-Informationen aus No Border Order
     */
    extractProjectInfo(noBorderOrder) {
        // Option 1: Direktes Projekt-Feld
        if (noBorderOrder.project) {
            return {
                id: noBorderOrder.project.id || noBorderOrder.project.projectId,
                name: noBorderOrder.project.name || noBorderOrder.project.projectName,
                priority: noBorderOrder.project.priority
            };
        }

        // Option 2: Aus salesOrder.project
        if (noBorderOrder.salesOrder?.project) {
            return {
                id: noBorderOrder.salesOrder.project.id,
                name: noBorderOrder.salesOrder.project.name,
                priority: noBorderOrder.salesOrder.project.priority
            };
        }

        // Option 3: Aus Custom Fields
        if (noBorderOrder.customFields?.projectId) {
            return {
                id: noBorderOrder.customFields.projectId,
                name: noBorderOrder.customFields.projectName || `Projekt ${noBorderOrder.customFields.projectId}`,
                priority: noBorderOrder.customFields.projectPriority
            };
        }

        // Option 4: Aus Kunden-Referenz (falls Projekt = Kunde)
        if (noBorderOrder.salesOrder?.customer?.projectId) {
            return {
                id: noBorderOrder.salesOrder.customer.projectId,
                name: noBorderOrder.salesOrder.customer.name,
                priority: 'normal'
            };
        }

        // Option 5: Aus Order-Tags oder Kategorien
        if (noBorderOrder.tags && noBorderOrder.tags.length > 0) {
            const projectTag = noBorderOrder.tags.find(tag =>
                tag.startsWith('projekt:') || tag.startsWith('project:')
            );
            if (projectTag) {
                const parts = projectTag.split(':');
                return {
                    id: parts[1],
                    name: parts[2] || `Projekt ${parts[1]}`,
                    priority: 'normal'
                };
            }
        }

        // Option 6: Aus Kategorie
        if (noBorderOrder.category?.id) {
            return {
                id: `CAT-${noBorderOrder.category.id}`,
                name: noBorderOrder.category.name || `Kategorie ${noBorderOrder.category.id}`,
                priority: 'normal'
            };
        }

        // Fallback: Versuche aus Order-Nummer zu extrahieren
        const orderNumber = noBorderOrder.externalOrderNumber || noBorderOrder.documentNumber;
        if (orderNumber) {
            const match = orderNumber.match(/PRJ(\d+)|PROJ(\d+)|P(\d+)/i);
            if (match) {
                const projectId = match[1] || match[2] || match[3];
                return {
                    id: `PRJ${projectId}`,
                    name: `Projekt ${projectId}`,
                    priority: 'normal'
                };
            }
        }

        // Kein Projekt gefunden - Verwende Standard-Projekt
        if (process.env.DEFAULT_PROJECT_ID) {
            return {
                id: process.env.DEFAULT_PROJECT_ID,
                name: process.env.DEFAULT_PROJECT_NAME || 'Standard-Projekt',
                priority: 'normal'
            };
        }

        // Kein Projekt gefunden
        return {
            id: null,
            name: null,
            priority: null
        };
    }

    /**
     * Konvertiert Items mit projekt-spezifischen Lagerplätzen
     */
    convertItemsWithProjectZone(apiPositions, projectId) {
        if (!apiPositions || !Array.isArray(apiPositions)) {
            return [];
        }

        const projectZone = projectId ? projectId.substring(0, 1).toUpperCase() : null;

        return apiPositions.map((position, index) => {
            console.log(`📦 Verarbeite Artikel ${index + 1}:`, position.product?.number, '|', position.product?.name);

            // Bestimme Lagerplatz mit Projekt-Zone
            let storageLocation = position.storageLocation ||
                position.warehouse?.location ||
                position.product?.storageLocation || '';

            // Wenn kein Lagerplatz vorhanden aber Projekt-Zone bekannt
            if (!storageLocation && projectZone) {
                // Generiere vorläufigen Projekt-Lagerplatz
                storageLocation = `${projectZone}01-01-01`;
            } else if (storageLocation && projectZone && !storageLocation.startsWith(projectZone)) {
                // Warne wenn Lagerplatz nicht zur Projekt-Zone passt
                console.warn(`⚠️ Lagerplatz ${storageLocation} passt nicht zu Projekt-Zone ${projectZone}`);
            }

            return {
                id: position.id || `item_${index}`,
                productId: position.product?.id,
                sku: position.product?.number,
                articleNumber: position.product?.number,
                productCode: position.product?.number,
                productName: position.product?.name,
                name: position.product?.name,
                description: position.product?.name,
                longDescription: position.product?.description || position.comment || '',
                comment: position.comment || '',
                quantity: position.quantity || 1,
                unit: position.unit || 'Stk',
                price: parseFloat(position.price?.amount || 0),
                currency: position.price?.currency || 'EUR',
                position: position.sort || index + 1,
                tax: position.tax?.effectiveVatRate || 0,
                taxText: position.tax?.taxText || '',
                discount: position.discount || 0,
                netRevenue: parseFloat(position.netRevenueSingle?.amount || 0),
                grossRevenue: parseFloat(position.grossRevenueSingle?.amount || 0),

                // Lager-Informationen mit Projekt-Zone
                warehouseId: position.warehouseId || projectZone,
                warehouseName: position.warehouseName || (projectZone ? `Lager ${projectZone}` : 'Hauptlager'),
                storageLocation: storageLocation,
                storageLocationId: position.storageLocationId,
                storageLocationName: position.storageLocationName,

                // Kommissionier-Status (Standard-Werte)
                quantityPicked: 0,
                pickingStatus: 'pending',

                // Weitere Felder
                batch: position.batch || position.lot,
                serialNumbers: position.serialNumbers || [],
                expiryDate: position.expiryDate ? new Date(position.expiryDate) : null,
                barcode: position.barcode || position.ean,
                ean: position.ean,
                weight: position.weight || position.product?.weight || 0,
                volume: position.volume || position.product?.volume || 0,
                notes: position.notes || '',
                webId: position.webId || '',
                hasChildren: position.hasChildren || false,

                // Projekt-spezifische Felder
                projectZone: projectZone,
                customFields: position.customFields || {}
            };
        });
    }

    /**
     * VOLLSTÄNDIG KORRIGIERTE Konvertierungsfunktion mit Projekt-Support
     */
    convertToInternalFormat(noBorderOrder) {
        console.log('🔄 Konvertiere No Border Order:', noBorderOrder.id);

        // Extrahiere Projekt-Informationen
        const projectInfo = this.extractProjectInfo(noBorderOrder);
        console.log('📁 Projekt erkannt:', projectInfo);

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

            // PROJEKT-INFORMATIONEN
            project: projectInfo,

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
                phone: noBorderOrder.salesOrder?.delivery?.phone || ''
            },

            // Artikel mit Projekt-spezifischen Lagerplätzen
            items: this.convertItemsWithProjectZone(
                noBorderOrder.salesOrder?.positions || [],
                projectInfo.id
            ),

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
                id: noBorderOrder.salesOrder.delivery.shippingMethod.id,
                name: noBorderOrder.salesOrder.delivery.shippingMethod.name
            } : null,

            // Warehouse-Info (projekt-basiert)
            warehouse: projectInfo.id ? `Lager ${projectInfo.id.substring(0, 1).toUpperCase()}` :
                noBorderOrder.warehouse || 'Hauptlager',

            // Priorität (berücksichtigt Projekt-Priorität)
            priority: noBorderOrder.priority || projectInfo.priority || 'normal',

            // Sales Order Informationen
            salesOrder: noBorderOrder.salesOrder ? {
                id: noBorderOrder.salesOrder.id
            } : null,

            // Weitere Informationen
            externalOrderId: noBorderOrder.externalOrderId || '',
            externalOrderNumber: noBorderOrder.externalOrderNumber || '',
            customerOrderNumber: noBorderOrder.customerOrderNumber || '',
            externalDeliveryNoteNumber: noBorderOrder.externalDeliveryNoteNumber || '',

            // Kommentare
            internalComment: noBorderOrder.internalComment || '',
            customerComment: noBorderOrder.customerComment || noBorderOrder.salesOrder?.customerComment || '',

            // Deadline (wichtig für Express)
            shippingDeadline: noBorderOrder.shippingDeadline ?
                new Date(noBorderOrder.shippingDeadline) : null,

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
            invoiceNumber: noBorderOrder.invoiceNumber || null,

            // Custom Fields
            customFields: noBorderOrder.customFields || {}
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

    /**
     * Projekt-Statistiken abrufen
     */
    async getProjectStatistics(projectId, dateRange = {}) {
        try {
            const filters = [
                {
                    key: "project.id",
                    op: "eq",
                    value: projectId
                }
            ];

            if (dateRange.start) {
                filters.push({
                    key: "createdAt",
                    op: "gte",
                    value: dateRange.start.toISOString()
                });
            }

            if (dateRange.end) {
                filters.push({
                    key: "createdAt",
                    op: "lte",
                    value: dateRange.end.toISOString()
                });
            }

            const requestBody = {
                filters: filters,
                limit: 1000,
                page: 1,
                aggregate: [
                    {
                        field: "status",
                        operation: "count"
                    },
                    {
                        field: "total.amount",
                        operation: "sum"
                    }
                ]
            };

            const headers = this.getAuthHeaders();
            const endpoint = `${this.baseUrl}/sales-orders/search`;

            const response = await axios.post(endpoint, requestBody, {
                headers,
                timeout: 30000
            });

            return {
                success: true,
                data: response.data,
                projectId: projectId
            };

        } catch (error) {
            console.error('❌ Fehler beim Abrufen der Projekt-Statistiken:', error);
            throw new Error(`Fehler bei Projekt-Statistiken: ${error.message}`);
        }
    }
}

module.exports = NoBorderApiService;