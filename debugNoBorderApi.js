require('dotenv').config();
const NoBorderApiDebugger = require('./services/apiDebugger');

/**
 * Debug-Script zum Testen der No Border API
 *
 * Verwendung:
 * node debugNoBorderApi.js
 */

async function main() {
    const apiDebugger = new NoBorderApiDebugger(
        process.env.NOBORDER_API_URL || 'https://api.no-border.eu',
        process.env.NOBORDER_USERNAME,
        process.env.NOBORDER_PASSWORD
    );

    try {
        const results = await apiDebugger.runFullDiscovery();

        console.log('\n🎯 EMPFOHLENE AKTION:');
        console.log('===================');

        if (results.recommendedEndpoint) {
            console.log(`✅ Verwenden Sie diesen Endpunkt: ${results.recommendedEndpoint}`);
            console.log('📝 Aktualisieren Sie Ihren Service entsprechend.');
        } else {
            console.log('❌ Keine funktionierenden Endpunkte gefunden.');
            console.log('🔧 Mögliche Lösungen:');
            console.log('  1. Überprüfen Sie Ihre Anmeldedaten');
            console.log('  2. Kontaktieren Sie den No Border Support');
            console.log('  3. Überprüfen Sie die API-Dokumentation');

            if (results.docsUrl) {
                console.log(`  4. Besuchen Sie: ${results.docsUrl}`);
            }
        }

    } catch (error) {
        console.error('❌ Fehler beim Discovery-Prozess:', error.message);
    }
}

main().catch(console.error);