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

module.exports = Order;