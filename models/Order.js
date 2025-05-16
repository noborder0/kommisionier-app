const mongoose = require('mongoose');

// Basierend auf der Xentral DeliveryNoteView-Dokumentation
const OrderSchema = new mongoose.Schema({
    // Kerninformationen zur Identifikation
    xentralId: {
        type: String,
        required: true
    },
    deliveryNoteNumber: {
        type: String,
        required: true,
        unique: true
    },
    orderNumber: String,
    externalDeliveryNoteNumber: String,

    // Statusfelder
    status: {
        type: String,
        enum: ['new', 'in_progress', 'packed', 'shipped', 'completed'],
        default: 'new'
    },
    shippingStatus: String,

    // Daten
    createdAt: {
        type: Date,
        default: Date.now
    },
    deliveryDate: Date,
    shippingDate: Date,

    // Kundeninformationen (basierend auf Xentral's "address" Feld)
    customer: {
        id: String,
        name: String,
        name2: String,
        department: String,
        street: String,
        zip: String,
        city: String,
        country: String,
        countryIso: String,
        email: String,
        phone: String
    },

    // Versandinformationen
    shipping: {
        method: String,
        carrier: String,
        trackingNumber: String,
        trackingUrl: String,
        weight: Number,
        cost: Number
    },

    // Auftragspositionen/Lieferscheinpositionen (basierend auf Xentral positions)
    items: [{
        positionId: String,
        articleId: String,
        articleNumber: String,
        description: String,
        quantity: Number,
        quantityPicked: {
            type: Number,
            default: 0
        },
        unit: String,
        price: Number,
        tax: Number,
        discount: Number,
        position: Number,
        warehouseId: String,
        warehouseName: String,
        storageLocation: String,
        batch: String,
        serialNumbers: [String],
        expiryDate: Date
    }],

    // Verpackungsdetails (eigene Ergänzung, nicht in Xentral API)
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

    // Übergeordnete Auftrags-Informationen (basierend auf Xentral's "project" Feld)
    project: {
        id: String,
        name: String
    },

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
    updatedAt: {
        type: Date,
        default: Date.now
    },
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

module.exports = mongoose.model('Order', OrderSchema);