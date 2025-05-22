const mongoose = require('mongoose');

// Basierend auf der No Border API-Struktur
const OrderSchema = new mongoose.Schema({
    // Kerninformationen zur Identifikation
    id: {
        type: String,
        required: false  // No Border ID
    },
    number: {
        type: String,
        required: false,
        unique: true,
        sparse: true
    },
    noBorderId: String, // No Border API ID
    deliveryNoteNumber: {
        type: String,
        required: true,
        unique: true
    },
    externalDeliveryNoteNumber: String,
    externalOrderNumber: String,
    customerOrderNumber: String,

    // Zeitstempel und Datumsinformationen
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    documentDate: Date,
    deliveryDate: Date,
    shippingDate: Date,

    // Statusfelder
    status: {
        type: String,
        enum: ['new', 'in_progress', 'packed', 'shipped', 'completed', 'cancelled'],
        default: 'new'
    },
    shippingStatus: String,
    type: String,

    // Kundendaten (aus No Border API)
    customer: {
        id: String,
        name: String,
        name2: String,
        department: String,
        street: String,
        zip: String,
        city: String,
        country: String,
        email: String,
        phone: String
    },

    // Versandinformationen
    shippingMethod: {
        id: String,
        name: String
    },

    // Detaillierte Versandinformationen
    shipping: {
        carrier: String,
        trackingNumber: String,
        trackingUrl: String,
        weight: Number,
        cost: Number,
        method: String,
        hasTracking: Boolean
    },

    // Verbundener Auftrag
    salesOrder: {
        id: String
    },
    orderNumber: String,

    // Auftragspositionen/Lieferscheinpositionen - VOLLSTÄNDIG KORRIGIERT
    items: [{
        // API-Felder aus No Border
        id: String,              // Positions-ID in No Border
        productId: String,       // Produkt-ID
        sku: String,             // SKU/Artikelnummer (z.B. "1011-H")
        articleNumber: String,   // Artikelnummer für Anzeige
        productCode: String,     // Produktcode
        productName: String,     // Produktname
        name: String,            // Artikelname/Beschreibung
        description: String,     // Hauptbeschreibung für Anzeige
        longDescription: String, // Ausführliche Beschreibung
        comment: String,         // Kommentare aus API

        quantity: Number,        // Menge
        unit: String,            // Einheit (Stk, kg, etc.)
        price: Number,           // Preis
        currency: String,        // Währung
        tax: Number,             // Steuer
        taxText: String,         // Steuer-Text
        discount: Number,        // Rabatt
        position: Number,        // Positionsnummer

        // Umsatz-Informationen
        netRevenue: Number,      // Netto-Umsatz einzeln
        grossRevenue: Number,    // Brutto-Umsatz einzeln

        // Lager- und Logistikinformationen
        warehouseId: String,
        warehouseName: String,
        storageLocation: String,
        storageLocationId: String,
        storageLocationName: String,
        batch: String,
        serialNumbers: [String],
        expiryDate: Date,

        // Kommissionierinformationen
        quantityPicked: {
            type: Number,
            default: 0
        },
        pickingStatus: {
            type: String,
            enum: ['pending', 'in_progress', 'partial', 'complete', 'error'],
            default: 'pending'
        },
        pickedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        pickedAt: Date,

        // Weitere Felder für die Kommissionierung
        barcode: String,
        ean: String,
        weight: Number,
        volume: Number,
        notes: String,

        // No Border spezifische Felder
        webId: String,
        hasChildren: Boolean,

        // Zusätzliche Felder für benutzerdefinierte Daten
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        }
    }],

    // Verpackungsdetails
    packagingMethod: {
        type: String,
        enum: ['package', 'pallet', 'homogeneous', 'mixed'],
        default: 'package'
    },
    packages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Package'
    }],
    pallets: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pallet'
    }],

    // Zuständige Person
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Kommentare/Notizen
    internalComment: String,
    customerComment: String,

    // Projekt-Informationen
    project: {
        id: String,
        name: String
    },

    // Batch-Picking Informationen
    batchId: {
        type: String,
        index: true
    },
    batchType: {
        type: String,
        enum: ['express', 'singleItem', 'multiItem', 'bulky', 'custom', 'project'],
        index: true
    },
    batchStartTime: Date,
    batchEndTime: Date,
    batchSequence: Number, // Position im Batch

    // Performance-Tracking
    pickingStartTime: Date,
    pickingEndTime: Date,
    pickingDuration: Number, // in Millisekunden
    pickerPerformance: {
        itemsPerMinute: Number,
        accuracy: Number, // Prozentsatz korrekt gepickter Items
        errors: [{
            itemId: String,
            errorType: String, // 'wrong-quantity', 'wrong-item', 'damaged'
            timestamp: Date,
            correctedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }]
    },

    // Express-Handling
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'express'],
        default: 'normal',
        index: true
    },
    shippingDeadline: {
        type: Date,
        index: true
    },
    expressReason: String, // Grund für Express-Versand

    // Scanning-History
    scanHistory: [{
        code: String,
        timestamp: Date,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        action: String, // 'item-scanned', 'location-confirmed', 'package-labeled'
        success: Boolean,
        errorMessage: String
    }],

    // Warehouse-Informationen
    warehouse: String,

    // Finanzinformationen
    total: {
        amount: String,
        currency: String
    },
    netSales: {
        amount: String,
        currency: String
    },

    // Rechnungsinformationen
    invoiceId: String,
    invoiceNumber: String,

    // Zusätzliche Felder für benutzerdefinierte Daten
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },

    // Aktualisierungsinformationen
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// Update updatedAt vor jedem Speichern
OrderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Order = mongoose.model('Order', OrderSchema);

// Factory-Funktion für minimalen Lieferschein
Order.createMinimalOrder = function(deliveryNoteNumber) {
    return new Order({
        deliveryNoteNumber: deliveryNoteNumber || `TEMP-${Date.now()}`,
        status: 'new',
        createdAt: new Date(),
        updatedAt: new Date()
    });
};

// Hilfsfunktion zum Mappen von No Border API-Positionen zu Schema-Positionen
Order.mapApiPositionsToSchema = function(apiPositions) {
    if (!apiPositions || !Array.isArray(apiPositions)) {
        return [];
    }

    return apiPositions.map(pos => {
        return {
            id: pos.id,
            productId: pos.product?.id,
            sku: pos.product?.number || pos.sku || pos.productCode,
            articleNumber: pos.product?.number || pos.articleNumber,
            productCode: pos.product?.number || pos.productCode,
            productName: pos.product?.name || pos.productName,
            name: pos.product?.name || pos.name || pos.productName,
            description: pos.product?.name || pos.description,
            longDescription: pos.product?.description || pos.comment,
            comment: pos.comment,
            quantity: pos.quantity || pos.amount,
            unit: pos.unit || 'Stk',
            price: parseFloat(pos.price?.amount || pos.price || 0),
            currency: pos.price?.currency || pos.currency || 'EUR',
            tax: pos.tax?.effectiveVatRate || pos.tax || pos.taxRate || 0,
            taxText: pos.tax?.taxText || '',
            discount: pos.discount || 0,
            position: pos.sort || pos.position,
            netRevenue: parseFloat(pos.netRevenueSingle?.amount || 0),
            grossRevenue: parseFloat(pos.grossRevenueSingle?.amount || 0),
            warehouseId: pos.warehouseId,
            warehouseName: pos.warehouseName,
            storageLocation: pos.storageLocation,
            storageLocationId: pos.storageLocationId,
            storageLocationName: pos.storageLocationName,
            batch: pos.batch || pos.lot,
            barcode: pos.barcode || pos.ean,
            ean: pos.ean,
            webId: pos.webId || '',
            hasChildren: pos.hasChildren || false
        };
    });
};

// Projekt-bezogene statische Methoden
OrderSchema.statics.getProjectStats = async function(projectId, dateRange = {}) {
    const match = { 'project.id': projectId };

    if (dateRange.start) {
        match.createdAt = { $gte: dateRange.start };
    }
    if (dateRange.end) {
        match.createdAt = { ...match.createdAt, $lte: dateRange.end };
    }

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalItems: { $sum: { $size: '$items' } },
                totalQuantity: {
                    $sum: {
                        $reduce: {
                            input: '$items',
                            initialValue: 0,
                            in: { $add: ['$$value', '$$this.quantity'] }
                        }
                    }
                },
                avgItemsPerOrder: { $avg: { $size: '$items' } },
                statusBreakdown: {
                    $push: '$status'
                },
                uniqueCustomers: { $addToSet: '$customer.name' },
                avgProcessingTime: {
                    $avg: {
                        $cond: [
                            { $ne: ['$shippingDate', null] },
                            { $subtract: ['$shippingDate', '$createdAt'] },
                            null
                        ]
                    }
                }
            }
        },
        {
            $project: {
                totalOrders: 1,
                totalItems: 1,
                totalQuantity: 1,
                avgItemsPerOrder: { $round: ['$avgItemsPerOrder', 2] },
                uniqueCustomers: { $size: '$uniqueCustomers' },
                avgProcessingTime: {
                    $divide: ['$avgProcessingTime', 1000 * 60 * 60] // In Stunden
                },
                statusCounts: {
                    $arrayToObject: {
                        $map: {
                            input: { $setUnion: ['$statusBreakdown'] },
                            as: 'status',
                            in: {
                                k: '$$status',
                                v: {
                                    $size: {
                                        $filter: {
                                            input: '$statusBreakdown',
                                            cond: { $eq: ['$$this', '$$status'] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    ]);
};

// Häufigste Artikel pro Projekt
OrderSchema.statics.getTopItemsByProject = async function(projectId, limit = 10) {
    return this.aggregate([
        { $match: { 'project.id': projectId } },
        { $unwind: '$items' },
        {
            $group: {
                _id: {
                    sku: '$items.sku',
                    articleNumber: '$items.articleNumber',
                    description: '$items.description'
                },
                totalQuantity: { $sum: '$items.quantity' },
                orderCount: { $sum: 1 },
                avgQuantityPerOrder: { $avg: '$items.quantity' },
                storageLocations: { $addToSet: '$items.storageLocation' }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: limit },
        {
            $project: {
                sku: '$_id.sku',
                articleNumber: '$_id.articleNumber',
                description: '$_id.description',
                totalQuantity: 1,
                orderCount: 1,
                avgQuantityPerOrder: { $round: ['$avgQuantityPerOrder', 2] },
                storageLocations: 1,
                _id: 0
            }
        }
    ]);
};

// Projekt-basierte Lagerplatz-Analyse
OrderSchema.statics.getProjectStorageAnalysis = async function(projectId) {
    return this.aggregate([
        { $match: { 'project.id': projectId } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.storageLocation',
                itemCount: { $sum: 1 },
                totalQuantity: { $sum: '$items.quantity' },
                uniqueSkus: { $addToSet: '$items.sku' }
            }
        },
        {
            $project: {
                location: '$_id',
                itemCount: 1,
                totalQuantity: 1,
                uniqueSkuCount: { $size: '$uniqueSkus' },
                _id: 0
            }
        },
        { $sort: { totalQuantity: -1 } }
    ]);
};

// Instanz-Methoden
OrderSchema.methods.isProjectOrder = function() {
    return this.project && this.project.id;
};

OrderSchema.methods.getProjectZone = function() {
    // Bestimme die Projekt-spezifische Lagerzone
    if (!this.project?.id) return null;

    // Beispiel: Erste Zeichen des Projekt-IDs als Zone
    return this.project.id.substring(0, 1).toUpperCase();
};

OrderSchema.methods.calculateProjectPriority = function() {
    let priority = 0;

    // Basis-Priorität nach Status
    const statusPriority = {
        'new': 10,
        'in_progress': 5,
        'packed': 3,
        'shipped': 1,
        'completed': 0
    };
    priority += statusPriority[this.status] || 0;

    // Express-Bonus
    if (this.priority === 'high' || this.shippingMethod?.name?.includes('Express')) {
        priority += 20;
    }

    // Deadline-Bonus
    if (this.shippingDeadline) {
        const hoursUntilDeadline = (new Date(this.shippingDeadline) - new Date()) / (1000 * 60 * 60);
        if (hoursUntilDeadline < 2) priority += 50;
        else if (hoursUntilDeadline < 4) priority += 30;
        else if (hoursUntilDeadline < 8) priority += 15;
    }

    // Projekt-spezifische Priorität
    if (this.project?.priority === 'high') {
        priority += 25;
    }

    return priority;
};

// Virtuelle Felder
OrderSchema.virtual('projectDisplayName').get(function() {
    if (!this.project) return 'Ohne Projekt';
    return this.project.name || `Projekt ${this.project.id}`;
});

OrderSchema.virtual('estimatedPickingTime').get(function() {
    // Schätze Kommissionierzeit basierend auf Projekt-Erfahrung
    const baseTimePerItem = 2; // Minuten
    const itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);

    // Projekt-spezifischer Multiplikator (könnte aus historischen Daten kommen)
    const projectMultiplier = this.project?.complexity || 1;

    return Math.ceil(itemCount * baseTimePerItem * projectMultiplier);
});

// Indizes für Projekt-Queries
OrderSchema.index({ 'project.id': 1, status: 1 });
OrderSchema.index({ 'project.id': 1, createdAt: -1 });
OrderSchema.index({ 'project.name': 1 });

// Pre-save Hook für Projekt-Validierung
OrderSchema.pre('save', function(next) {
    // Stelle sicher, dass Projekt-Daten konsistent sind
    if (this.project && !this.project.name && this.project.id) {
        // Könnte hier den Projektnamen aus einer anderen Quelle laden
        this.project.name = `Projekt ${this.project.id}`;
    }

    // Setze Projekt-basierte Standardwerte
    if (this.isNew && this.project) {
        // Projekt-spezifische Lagerzone zuweisen
        const projectZone = this.getProjectZone();
        this.items.forEach(item => {
            if (!item.storageLocation && projectZone) {
                // Generiere vorläufigen Lagerplatz
                item.storageLocation = `${projectZone}01-01-01`;
            }
        });
    }

    next();
});

// Query Helpers für Projekt-Filter
OrderSchema.query.byProject = function(projectId) {
    return this.where({ 'project.id': projectId });
};

OrderSchema.query.withoutProject = function() {
    return this.where({
        $or: [
            { project: { $exists: false } },
            { 'project.id': { $exists: false } }
        ]
    });
};

OrderSchema.query.byProjectName = function(projectName) {
    return this.where({ 'project.name': new RegExp(projectName, 'i') });
};

// Aggregation Pipeline Helpers
OrderSchema.statics.getProjectSummary = async function() {
    return this.aggregate([
        {
            $group: {
                _id: {
                    id: '$project.id',
                    name: '$project.name'
                },
                orderCount: { $sum: 1 },
                lastActivity: { $max: '$updatedAt' }
            }
        },
        {
            $project: {
                projectId: '$_id.id',
                projectName: '$_id.name',
                orderCount: 1,
                lastActivity: 1,
                _id: 0
            }
        },
        { $sort: { orderCount: -1 } }
    ]);
};

// Batch-Indizes
OrderSchema.index({ batchId: 1, batchSequence: 1 });
OrderSchema.index({ batchType: 1, status: 1 });
OrderSchema.index({ priority: 1, shippingDeadline: 1 });
OrderSchema.index({ 'pickerPerformance.itemsPerMinute': -1 });

// Batch-bezogene Methoden
OrderSchema.methods.calculatePickingDuration = function() {
    if (this.pickingStartTime && this.pickingEndTime) {
        this.pickingDuration = this.pickingEndTime - this.pickingStartTime;

        const minutes = this.pickingDuration / 60000;
        const itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0);

        this.pickerPerformance = this.pickerPerformance || {};
        this.pickerPerformance.itemsPerMinute = minutes > 0 ? Math.round(itemCount / minutes) : 0;
    }
};

OrderSchema.methods.addScanEvent = function(code, action, success, errorMessage) {
    this.scanHistory = this.scanHistory || [];
    this.scanHistory.push({
        code,
        timestamp: new Date(),
        action,
        success,
        errorMessage
    });

    // Behalte nur die letzten 100 Scans
    if (this.scanHistory.length > 100) {
        this.scanHistory = this.scanHistory.slice(-100);
    }
};

// Statische Methoden für Batch-Analysen
OrderSchema.statics.getBatchPerformance = async function(batchId) {
    return this.aggregate([
        { $match: { batchId } },
        {
            $group: {
                _id: '$batchId',
                totalOrders: { $sum: 1 },
                totalItems: { $sum: { $size: '$items' } },
                totalQuantity: {
                    $sum: {
                        $reduce: {
                            input: '$items',
                            initialValue: 0,
                            in: { $add: ['$$value', '$$this.quantity'] }
                        }
                    }
                },
                avgDuration: { $avg: '$pickingDuration' },
                avgItemsPerMinute: { $avg: '$pickerPerformance.itemsPerMinute' },
                startTime: { $min: '$batchStartTime' },
                endTime: { $max: '$batchEndTime' }
            }
        },
        {
            $project: {
                batchId: '$_id',
                totalOrders: 1,
                totalItems: 1,
                totalQuantity: 1,
                avgDurationMinutes: { $divide: ['$avgDuration', 60000] },
                avgItemsPerMinute: { $round: ['$avgItemsPerMinute', 2] },
                totalDurationMinutes: {
                    $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60000]
                },
                _id: 0
            }
        }
    ]);
};

OrderSchema.statics.getPickerPerformance = async function(userId, dateRange = {}) {
    const match = { assignedTo: userId };

    if (dateRange.start) {
        match.pickingStartTime = { $gte: dateRange.start };
    }
    if (dateRange.end) {
        match.pickingEndTime = { ...match.pickingEndTime, $lte: dateRange.end };
    }

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalDuration: { $sum: '$pickingDuration' },
                avgItemsPerMinute: { $avg: '$pickerPerformance.itemsPerMinute' },
                totalErrors: {
                    $sum: { $size: { $ifNull: ['$pickerPerformance.errors', []] } }
                },
                batchTypes: {
                    $push: '$batchType'
                }
            }
        },
        {
            $project: {
                totalOrders: 1,
                totalHours: { $divide: ['$totalDuration', 3600000] },
                avgItemsPerMinute: { $round: ['$avgItemsPerMinute', 2] },
                errorRate: {
                    $multiply: [
                        { $divide: ['$totalErrors', '$totalOrders'] },
                        100
                    ]
                },
                batchTypeDistribution: {
                    $arrayToObject: {
                        $map: {
                            input: { $setUnion: ['$batchTypes'] },
                            as: 'type',
                            in: {
                                k: '$$type',
                                v: {
                                    $size: {
                                        $filter: {
                                            input: '$batchTypes',
                                            cond: { $eq: ['$$this', '$$type'] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    ]);
};

// Express-Order Helper
OrderSchema.statics.getExpressOrders = async function() {
    const now = new Date();
    const deadline = new Date();
    deadline.setHours(14, 0, 0, 0);

    if (deadline < now) {
        deadline.setDate(deadline.getDate() + 1);
    }

    return this.find({
        $or: [
            { priority: { $in: ['high', 'express'] } },
            { 'shippingMethod.name': /express/i },
            { shippingDeadline: { $lte: deadline } }
        ],
        status: { $in: ['new', 'in_progress', 'packed'] }
    }).sort({ shippingDeadline: 1, priority: -1 });
};

module.exports = Order;