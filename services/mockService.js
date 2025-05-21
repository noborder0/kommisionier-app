// Mock-Service für Testzwecke
const mockOrders = require('./mockData');

// Hilfsfunktion für zufällige Verzögerungen (simuliert Netzwerklatenzen)
const randomDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 50));

// Debug-Logging
const log = (message, data) => {
    console.log(`[MOCK-SERVICE] ${message}`);
    if (data) console.log(data);
};

// Mock für die Xentral API-Verbindung
exports.testConnection = async () => {
    await randomDelay();
    log('Test-Verbindung simuliert');

    return {
        success: true,
        status: 200,
        data: {
            message: 'Verbindung erfolgreich hergestellt (Mock)',
            service: 'Xentral Mock API',
            version: '1.0.0'
        }
    };
};

// Mock für das Abrufen aller Lieferscheine
exports.listDeliveryNotes = async () => {
    await randomDelay();
    log(`Listet alle ${mockOrders.length} Lieferscheine auf`);

    // Konvertiere die Mock-Daten in ein Format, das dem Xentral-API-Format ähnelt
    const xentralFormat = mockOrders.map(order => ({
        id: order.xentralId,
        number: order.deliveryNoteNumber,
        orderNumber: order.orderNumber,
        status: mapInternalToXentralStatus(order.status),
        createdAt: order.createdAt.toISOString(),
        deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString() : null
    }));

    return {
        data: xentralFormat,
        total: xentralFormat.length,
        page: 1,
        pageSize: 50
    };
};

// Mock für die Suche eines Lieferscheins nach Nummer
exports.findDeliveryNoteByNumber = async (deliveryNoteNumber) => {
    await randomDelay();
    log(`Suche nach Lieferschein: ${deliveryNoteNumber}`);

    const order = mockOrders.find(o => o.deliveryNoteNumber === deliveryNoteNumber);

    if (!order) {
        log(`Lieferschein ${deliveryNoteNumber} nicht gefunden`);
        return null;
    }

    log(`Lieferschein ${deliveryNoteNumber} gefunden`);

    return {
        id: order.xentralId,
        number: order.deliveryNoteNumber,
        orderNumber: order.orderNumber,
        status: mapInternalToXentralStatus(order.status),
        createdAt: order.createdAt.toISOString(),
        deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString() : null
    };
};

// Mock für das Abrufen von Lieferscheindetails
exports.getDeliveryNoteDetails = async (deliveryNoteId) => {
    await randomDelay();
    log(`Hole Details für Lieferschein-ID: ${deliveryNoteId}`);

    const order = mockOrders.find(o => o.xentralId === deliveryNoteId);

    if (!order) {
        log(`Lieferschein mit ID ${deliveryNoteId} nicht gefunden`);
        throw new Error(`Lieferschein mit ID ${deliveryNoteId} nicht gefunden`);
    }

    log(`Details für Lieferschein ${order.deliveryNoteNumber} gefunden`);

    // Simuliere den API-Response mit allen Details
    return {
        id: order.xentralId,
        number: order.deliveryNoteNumber,
        orderNumber: order.orderNumber,
        status: mapInternalToXentralStatus(order.status),
        createdAt: order.createdAt.toISOString(),
        deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString() : null,
        customer: {
            id: order.customer.id,
            name: order.customer.name,
            street: order.customer.street,
            zipCode: order.customer.zip,
            city: order.customer.city,
            country: order.customer.country,
            email: order.customer.email,
            phone: order.customer.phone
        },
        items: order.items.map(item => ({
            id: item.articleId,
            number: item.articleNumber,
            name: item.description,
            quantity: item.quantity,
            unit: item.unit,
            price: item.price,
            position: item.position,
            warehouseId: item.warehouseId,
            warehouseName: item.warehouseName,
            batch: item.batch,
            expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null
        }))
    };
};

// Status-Mapping-Funktionen (simuliert die Konvertierung zwischen Systemen)
function mapInternalToXentralStatus(internalStatus) {
    const statusMap = {
        'new': 'open',
        'in_progress': 'processing',
        'packed': 'packed',
        'shipped': 'shipped',
        'completed': 'completed'
    };

    return statusMap[internalStatus] || 'open';
}

// Export für die Mapping-Funktionen
exports.mapStatusToXentral = function(internalStatus) {
    return mapInternalToXentralStatus(internalStatus);
};

exports.mapXentralToInternalStatus = function(xentralStatus) {
    const statusMap = {
        'open': 'new',
        'processing': 'in_progress',
        'packed': 'packed',
        'shipped': 'shipped',
        'completed': 'completed'
    };

    return statusMap[xentralStatus] || 'new';
};