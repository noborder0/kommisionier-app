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
        unique: true
    },
    noBorderId: String, // No Border API ID
    deliveryNoteNumber: {
        type: String,
        required: true,
        unique: true
    },
    externalDeliveryNoteNumber: String,

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
        method: String
    },

    // Verbundener Auftrag
    salesOrder: {
        id: String
    },
    orderNumber: String,

    // Auftragspositionen/Lieferscheinpositionen
    items: [{
        // API-Felder aus No Border
        id: String,              // Positions-ID in No Border
        productId: String,       // Produkt-ID
        sku: String,             // SKU/Artikelnummer
        productCode: String,     // Produktcode
        productName: String,     // Produktname
        name: String,            // Artikelname/Beschreibung
        description: String,     // Zusätzliche Beschreibung
        quantity: Number,        // Menge
        unit: String,            // Einheit (Stk, kg, etc.)
        price: Number,           // Preis
        tax: Number,             // Steuer
        discount: Number,        // Rabatt
        position: Number,        // Positionsnummer

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
            productId: pos.productId,
            sku: pos.sku || pos.productCode,
            productCode: pos.productCode,
            productName: pos.productName,
            name: pos.name || pos.productName,
            description: pos.description,
            quantity: pos.quantity || pos.amount,
            unit: pos.unit,
            price: pos.price,
            tax: pos.tax || pos.taxRate,
            discount: pos.discount,
            position: pos.position || pos.sort,
            warehouseId: pos.warehouseId,
            warehouseName: pos.warehouseName,
            storageLocation: pos.storageLocation,
            storageLocationId: pos.storageLocationId,
            storageLocationName: pos.storageLocationName,
            batch: pos.batch || pos.lot,
            barcode: pos.barcode || pos.ean,
            ean: pos.ean
        };
    });
};

module.exports = Order;