const mongoose = require('mongoose');

// Basierend auf der Xentral DeliveryNoteView-Dokumentation und den Testdaten
const OrderSchema = new mongoose.Schema({
    // Kerninformationen zur Identifikation
    id: {
        type: String,
        required: false  // Nicht erforderlich, falls automatisch generiert
    },
    number: {
        type: String,
        required: false,  // Nicht erforderlich, falls automatisch generiert
        unique: true
    },
    xentralId: String,
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
        enum: ['new', 'in_progress', 'packed', 'shipped', 'completed', 'released', 'sent'],
        default: 'new'
    },
    shippingStatus: String,
    type: String,

    // Kundendaten (basierend auf "receiver" in den Testdaten)
    receiver: {
        id: String,
        name: String,
        number: String,
        department: String,
        street: String,
        zip: String,
        city: String,
        email: String,
        phone: String
    },

    // Länderdaten
    country: String,
    countryIso: String,

    // Projektinformationen
    project: {
        id: String,
        name: String
    },

    // Versandinformationen
    shippingMethod: {
        id: String,
        name: String
    },

    // Detaillierte Versandinformationen (aus dem ursprünglichen Schema)
    shipping: {
        carrier: String,
        trackingNumber: String,
        trackingUrl: String,
        weight: Number,
        cost: Number
    },

    // Verbundener Auftrag
    salesOrder: {
        id: String
    },
    orderNumber: String,

    // Auftragspositionen/Lieferscheinpositionen
    items: [{
        // API-Felder aus Xentral
        id: String,              // Positions-ID in Xentral
        articleId: String,       // Artikel-ID
        articleNumber: String,   // Artikelnummer
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

// Hilfsfunktion zum Mappen von API-Positionen zu Schema-Positionen
// Basierend auf der DeliveryNoteView API von Xentral
Order.mapApiPositionsToSchema = function(apiPositions) {
    if (!apiPositions || !Array.isArray(apiPositions)) {
        return [];
    }

    return apiPositions.map(pos => {
        return {
            id: pos.id,
            articleId: pos.articleId,
            articleNumber: pos.articleNumber,
            name: pos.name || pos.title,
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