require('dotenv').config();
const NoBorderApiService = require('./services/noBorderService');

/**
 * Einfaches Test-Script für No Border API
 *
 * Verwendung: node testNoBorderApi.js
 */

async function testNoBorderConnection() {
    console.log('🚀 Teste No Border API Verbindung...\n');

    const service = new NoBorderApiService(
        process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
        process.env.NOBORDER_USERNAME,
        process.env.NOBORDER_PASSWORD
    );

    // 1. Verbindungstest
    console.log('1️⃣ Teste Authentifizierung...');
    const connectionTest = await service.testConnection();

    if (connectionTest.success) {
        console.log('✅ Authentifizierung erfolgreich!');
        console.log(`   Token gültig bis: ${connectionTest.data.tokenExpiry}`);
        console.log(`   Base URL: ${connectionTest.data.baseUrl}`);
        console.log(`   Username: ${connectionTest.data.username}\n`);

        // 2. Sales Orders abrufen
        console.log('2️⃣ Teste Sales Orders Abruf...');
        try {
            const ordersResult = await service.getOpenDeliveryNotes(1, 5);

            if (ordersResult.success) {
                console.log(`✅ ${ordersResult.data.length} Sales Orders gefunden`);
                console.log(`   Total: ${ordersResult.meta.total}`);
                console.log(`   Seite: ${ordersResult.meta.page}/${ordersResult.meta.totalPages}\n`);

                // 3. Erste Order Details anzeigen
                if (ordersResult.data.length > 0) {
                    console.log('3️⃣ Beispiel Sales Order:');
                    const firstOrder = ordersResult.data[0];
                    console.log(`   ID: ${firstOrder.id}`);
                    console.log(`   Order Number: ${firstOrder.orderNumber || firstOrder.number}`);
                    console.log(`   Status: ${firstOrder.status}`);
                    console.log(`   Date: ${firstOrder.date || firstOrder.createdAt}`);

                    // Konvertiere zu internem Format
                    console.log('\n4️⃣ Konvertiertes Format:');
                    const converted = service.convertToInternalFormat(firstOrder);
                    console.log(`   Delivery Note Number: ${converted.deliveryNoteNumber}`);
                    console.log(`   Internal Status: ${converted.status}`);
                    console.log(`   Customer: ${converted.customer.name}`);
                    console.log(`   Items: ${converted.items.length}`);
                }

            } else {
                console.log('❌ Keine Sales Orders gefunden');
            }

        } catch (error) {
            console.log('❌ Fehler beim Sales Orders Abruf:', error.message);
        }

    } else {
        console.log('❌ Authentifizierung fehlgeschlagen!');
        console.log(`   Fehler: ${connectionTest.error}`);
        console.log(`   Suggestion: ${connectionTest.data?.suggestion}`);
    }

    console.log('\n🏁 Test abgeschlossen!');
}

// Script ausführen
testNoBorderConnection().catch(error => {
    console.error('💥 Unerwarteter Fehler:', error.message);
    process.exit(1);
});