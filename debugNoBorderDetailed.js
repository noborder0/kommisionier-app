require('dotenv').config();
const NoBorderApiService = require('./services/noBorderService');

/**
 * Erweiterte Debug-Tests für No Border API
 *
 * Verwendung: node debugNoBorderDetailed.js
 */

async function runDetailedTests() {
    console.log('🚀 Detaillierte No Border API Tests gestartet...\n');

    const service = new NoBorderApiService(
        process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
        process.env.NOBORDER_USERNAME,
        process.env.NOBORDER_PASSWORD
    );

    try {
        // 1. Vollständige Analyse ausführen
        console.log('🔍 Führe vollständige API-Analyse durch...\n');
        const analysis = await service.runFullAnalysis();

        console.log('\n📊 ANALYSE-ERGEBNISSE:');
        console.log('===================');

        if (analysis.recommendation?.status) {
            console.log(`✅ EMPFOHLENER STATUS: "${analysis.recommendation.status}"`);
            console.log(`📈 ANZAHL VERFÜGBARER EINTRÄGE: ${analysis.recommendation.count}`);
            console.log(`💡 GRUND: ${analysis.recommendation.reason}\n`);

            // 2. Teste den empfohlenen Status im Detail
            console.log(`🔍 Teste empfohlenen Status "${analysis.recommendation.status}" im Detail...`);

            try {
                const detailResult = await service.getOpenDeliveryNotesWithStatus(
                    analysis.recommendation.status,
                    1,
                    5 // Nur die ersten 5 für Details
                );

                console.log(`✅ ${detailResult.data.length} Einträge erhalten:`);

                detailResult.data.forEach((order, index) => {
                    console.log(`\n📋 Eintrag ${index + 1}:`);
                    console.log(`   ID: ${order.id}`);
                    console.log(`   Nummer: ${order.orderNumber || order.number || 'N/A'}`);
                    console.log(`   Status: ${order.status}`);
                    console.log(`   Datum: ${order.date || order.createdAt || 'N/A'}`);
                    console.log(`   Kunde: ${order.customer?.name || order.shippingAddress?.name || 'N/A'}`);

                    if (order.items && order.items.length > 0) {
                        console.log(`   Artikel: ${order.items.length} Stück`);
                        console.log(`   Erster Artikel: ${order.items[0].productName || order.items[0].name || 'N/A'}`);
                    }
                });

                // 3. Teste Konvertierung zu internem Format
                console.log('\n🔄 Teste Konvertierung zu internem Format...');

                if (detailResult.data.length > 0) {
                    const converted = service.convertToInternalFormat(detailResult.data[0]);
                    console.log('✅ Konvertierung erfolgreich:');
                    console.log(`   Lieferschein-Nr.: ${converted.deliveryNoteNumber}`);
                    console.log(`   Interner Status: ${converted.status}`);
                    console.log(`   Kunde: ${converted.customer.name}`);
                    console.log(`   Artikel: ${converted.items.length}`);
                }

            } catch (detailError) {
                console.error(`❌ Fehler beim Detailtest: ${detailError.message}`);
            }

        } else {
            console.log('❌ KEIN PASSENDER STATUS GEFUNDEN');
            console.log('💡 Mögliche Ursachen:');
            console.log('   - Keine Lieferscheine im System');
            console.log('   - Falsche Authentifizierung');
            console.log('   - Andere API-Struktur');
            console.log('   - Andere Feldnamen für Status');
        }

        // 4. Zeige verfügbare Status an
        const step1 = analysis.steps.find(s => s.step === 1);
        if (step1?.result?.foundStatuses) {
            console.log('\n📋 ALLE VERFÜGBAREN STATUS IN DER API:');
            step1.result.foundStatuses.forEach(status => {
                console.log(`   • ${status}`);
            });
        }

        // 5. Manuelle Empfehlungen
        console.log('\n🛠️ MANUELLE SCHRITTE ZUR PROBLEMLÖSUNG:');
        console.log('=====================================');

        if (analysis.recommendation?.status) {
            console.log(`1. Ersetzen Sie "inFulfillment" durch "${analysis.recommendation.status}" in Ihrer getOpenDeliveryNotes Methode`);
            console.log(`2. Aktualisieren Sie die Status-Mappings in mapNoBorderToInternalStatus()`);
            console.log(`3. Testen Sie die Synchronisierung erneut`);
        } else {
            console.log('1. Überprüfen Sie Ihre No Border API-Zugangsdaten');
            console.log('2. Kontaktieren Sie den No Border Support für die korrekte API-Dokumentation');
            console.log('3. Prüfen Sie, ob Lieferscheine im System vorhanden sind');
        }

        // 6. Code-Beispiel generieren
        if (analysis.recommendation?.status) {
            console.log('\n💻 CODE-BEISPIEL FÜR DIE KORREKTUR:');
            console.log('==================================');
            console.log('Ersetzen Sie in services/noBorderService.js:');
            console.log('');
            console.log('// ALT:');
            console.log('filters: [{ key: "status", op: "in", value: ["inFulfillment"] }]');
            console.log('');
            console.log('// NEU:');
            console.log(`filters: [{ key: "status", op: "eq", value: "${analysis.recommendation.status}" }]`);
        }

    } catch (error) {
        console.error('💥 Kritischer Fehler bei der Analyse:', error.message);

        if (error.response) {
            console.error('📡 HTTP-Response Details:');
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Status Text: ${error.response.statusText}`);
            console.error(`   Data:`, error.response.data);
        }

        console.log('\n🔧 GRUNDLEGENDE PROBLEMLÖSUNG:');
        console.log('1. Überprüfen Sie die .env Datei auf korrekte Werte');
        console.log('2. Testen Sie die API-Verbindung mit einem anderen Tool (z.B. Postman)');
        console.log('3. Kontaktieren Sie den No Border Support');
    }

    console.log('\n🏁 Debug-Test abgeschlossen!');
}

// Script ausführen
runDetailedTests().catch(error => {
    console.error('💥 Unerwarteter Fehler:', error.message);
    process.exit(1);
});
