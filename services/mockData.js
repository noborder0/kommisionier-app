// Mock-Daten für Testzwecke
const mockOrders = [
    {
        _id: '60d21b4667d0d8992e610c85',
        xentralId: '12345',
        deliveryNoteNumber: '300029',  // Passt zur im Screenshot gezeigten Nummer
        orderNumber: 'AB-2025-001',
        status: 'new',
        createdAt: new Date('2021-02-15'),  // Passt zum Datum im Screenshot: 15.2.2021
        deliveryDate: new Date('2021-02-20'),
        customer: {
            id: '1001',
            name: 'Musterfirma GmbH',
            street: 'Hauptstraße 1',
            zip: '12345',
            city: 'Berlin',
            country: 'Deutschland',
            email: 'kontakt@musterfirma.de',
            phone: '+49 30 1234567'
        },
        items: [
            {
                articleId: 'A1001',
                articleNumber: 'P-1001',
                description: 'Premium Produkt 1',
                quantity: 5,
                quantityPicked: 0,
                unit: 'Stk',
                price: 99.95,
                position: 1,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-001'
            },
            {
                articleId: 'A1002',
                articleNumber: 'P-1002',
                description: 'Premium Produkt 2',
                quantity: 3,
                quantityPicked: 0,
                unit: 'Stk',
                price: 149.95,
                position: 2,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-002'
            }
        ],
        assignedTo: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'  // Passt zum "Administrator" im Screenshot
        },
        updatedBy: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'
        }
    },
    {
        _id: '60d21b4667d0d8992e610c86',
        xentralId: '12346',
        deliveryNoteNumber: '300030',
        orderNumber: 'AB-2021-002',
        status: 'in_progress',
        createdAt: new Date('2021-02-16'),
        deliveryDate: new Date('2021-02-25'),
        customer: {
            id: '1002',
            name: 'Beispiel AG',
            street: 'Industrieweg 7',
            zip: '54321',
            city: 'München',
            country: 'Deutschland',
            email: 'info@beispiel-ag.de',
            phone: '+49 89 7654321'
        },
        items: [
            {
                articleId: 'A2001',
                articleNumber: 'P-2001',
                description: 'Business Produkt A',
                quantity: 10,
                quantityPicked: 5,
                unit: 'Stk',
                price: 45.50,
                position: 1,
                warehouseId: 'WH2',
                warehouseName: 'Außenlager',
                batch: 'B2021-010'
            }
        ],
        packagingMethod: 'package',
        assignedTo: {
            _id: '60d21b4667d0d8992e610c02',
            name: 'Lisa Schmidt'
        },
        updatedBy: {
            _id: '60d21b4667d0d8992e610c02',
            name: 'Lisa Schmidt'
        }
    },
    {
        _id: '60d21b4667d0d8992e610c87',
        xentralId: '12347',
        deliveryNoteNumber: '300031',
        orderNumber: 'AB-2021-003',
        status: 'packed',
        createdAt: new Date('2021-02-17'),
        deliveryDate: new Date('2021-02-23'),
        customer: {
            id: '1003',
            name: 'Test & Co. KG',
            street: 'Teststraße 123',
            zip: '98765',
            city: 'Hamburg',
            country: 'Deutschland',
            email: 'service@test-co.de',
            phone: '+49 40 9876543'
        },
        items: [
            {
                articleId: 'A3001',
                articleNumber: 'P-3001',
                description: 'Eco Produkt X',
                quantity: 15,
                quantityPicked: 15,
                unit: 'Stk',
                price: 12.99,
                position: 1,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-020'
            },
            {
                articleId: 'A3002',
                articleNumber: 'P-3002',
                description: 'Eco Produkt Y',
                quantity: 8,
                quantityPicked: 8,
                unit: 'Stk',
                price: 9.99,
                position: 2,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-021'
            }
        ],
        packagingMethod: 'homogeneous',
        assignedTo: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'
        },
        updatedBy: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'
        }
    },
    {
        _id: '60d21b4667d0d8992e610c88',
        xentralId: '12348',
        deliveryNoteNumber: '300032',
        orderNumber: 'AB-2021-004',
        status: 'shipped',
        createdAt: new Date('2021-02-10'),
        deliveryDate: new Date('2021-02-18'),
        shippingDate: new Date('2021-02-17'),
        customer: {
            id: '1004',
            name: 'Großhandel GmbH',
            street: 'Großhandelsring 42',
            zip: '28195',
            city: 'Bremen',
            country: 'Deutschland',
            email: 'bestellung@grosshandel.de',
            phone: '+49 421 9876543'
        },
        items: [
            {
                articleId: 'A4001',
                articleNumber: 'P-4001',
                description: 'Industrie Teile Set',
                quantity: 2,
                quantityPicked: 2,
                unit: 'Set',
                price: 299.00,
                position: 1,
                warehouseId: 'WH2',
                warehouseName: 'Außenlager',
                batch: 'B2021-030'
            }
        ],
        packagingMethod: 'pallet',
        shipping: {
            method: 'Spedition',
            carrier: 'SpeedLogistic',
            trackingNumber: 'SPL2021123456',
            trackingUrl: 'https://speedlogistic.de/tracking/SPL2021123456',
            weight: 120,
            cost: 45.00
        },
        assignedTo: {
            _id: '60d21b4667d0d8992e610c02',
            name: 'Lisa Schmidt'
        },
        updatedBy: {
            _id: '60d21b4667d0d8992e610c02',
            name: 'Lisa Schmidt'
        }
    },
    {
        _id: '60d21b4667d0d8992e610c89',
        xentralId: '12349',
        deliveryNoteNumber: '300033',
        orderNumber: 'AB-2021-005',
        status: 'completed',
        createdAt: new Date('2021-02-01'),
        deliveryDate: new Date('2021-02-08'),
        shippingDate: new Date('2021-02-05'),
        customer: {
            id: '1005',
            name: 'Einzelhandel e.K.',
            street: 'Marktplatz 7',
            zip: '01067',
            city: 'Dresden',
            country: 'Deutschland',
            email: 'kontakt@einzelhandel-dresden.de',
            phone: '+49 351 1234567'
        },
        items: [
            {
                articleId: 'A5001',
                articleNumber: 'P-5001',
                description: 'Premium-Box Starterset',
                quantity: 3,
                quantityPicked: 3,
                unit: 'Box',
                price: 79.90,
                position: 1,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-040'
            },
            {
                articleId: 'A5002',
                articleNumber: 'P-5002',
                description: 'Premium-Box Erweiterung',
                quantity: 1,
                quantityPicked: 1,
                unit: 'Box',
                price: 39.90,
                position: 2,
                warehouseId: 'WH1',
                warehouseName: 'Hauptlager',
                batch: 'B2021-041'
            }
        ],
        packagingMethod: 'package',
        shipping: {
            method: 'Paketdienst',
            carrier: 'Express Post',
            trackingNumber: 'EP2021654321',
            trackingUrl: 'https://expresspost.de/tracking/EP2021654321',
            weight: 5.2,
            cost: 6.90
        },
        assignedTo: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'
        },
        updatedBy: {
            _id: '60d21b4667d0d8992e610c01',
            name: 'Administrator'
        }
    }
];

module.exports = mockOrders;