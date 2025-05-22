const axios = require('axios');

/**
 * Debug Helper für No Border API
 * Hilft dabei herauszufinden, welche Endpunkte verfügbar sind
 */
class NoBorderApiDebugger {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
    }

    /**
     * Testet verschiedene Login-Endpunkte
     */
    async discoverLoginEndpoint() {
        const endpoints = [
            '/api/auth/login',
            '/api/login',
            '/auth/login',
            '/login',
            '/api/authenticate',
            '/api/v1/auth/login',
            '/api/v1/login',
            '/v1/auth/login',
            '/oauth/token'
        ];

        const results = [];

        for (const endpoint of endpoints) {
            try {
                console.log(`\n🔍 Teste: ${this.baseUrl}${endpoint}`);

                const response = await axios.post(`${this.baseUrl}${endpoint}`, {
                    username: this.username,
                    password: this.password
                }, {
                    timeout: 5000,
                    validateStatus: () => true // Alle Status-Codes akzeptieren
                });

                results.push({
                    endpoint,
                    status: response.status,
                    statusText: response.statusText,
                    success: response.status < 400,
                    data: response.data,
                    headers: response.headers
                });

                console.log(`✅ ${endpoint}: ${response.status} ${response.statusText}`);
                if (response.data) {
                    console.log('📄 Response:', JSON.stringify(response.data, null, 2));
                }

            } catch (error) {
                results.push({
                    endpoint,
                    error: error.message,
                    success: false,
                    status: error.response?.status,
                    data: error.response?.data
                });

                console.log(`❌ ${endpoint}: ${error.message}`);
                if (error.response?.data) {
                    console.log('📄 Error Response:', JSON.stringify(error.response.data, null, 2));
                }
            }
        }

        return results;
    }

    /**
     * Testet die API-Dokumentation oder Swagger-Endpunkte
     */
    async discoverApiDocs() {
        const docEndpoints = [
            '/api/docs',
            '/docs',
            '/swagger',
            '/api-docs',
            '/swagger-ui',
            '/swagger/ui',
            '/api/swagger',
            '/openapi.json',
            '/api/openapi.json'
        ];

        console.log('\n📚 Suche nach API-Dokumentation...');

        for (const endpoint of docEndpoints) {
            try {
                const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                    timeout: 5000,
                    validateStatus: () => true
                });

                if (response.status < 400) {
                    console.log(`✅ Dokumentation gefunden: ${this.baseUrl}${endpoint}`);
                    return `${this.baseUrl}${endpoint}`;
                }
            } catch (error) {
                // Ignoriere Fehler
            }
        }

        console.log('❌ Keine API-Dokumentation gefunden');
        return null;
    }

    /**
     * Vollständiger API-Discovery-Prozess
     */
    async runFullDiscovery() {
        console.log('🚀 No Border API Discovery gestartet...');
        console.log(`🎯 Base URL: ${this.baseUrl}`);
        console.log(`👤 Username: ${this.username}`);
        console.log(`🔐 Password: ${this.password ? '[GESETZT]' : '[NICHT GESETZT]'}`);

        // 1. API-Dokumentation suchen
        const docsUrl = await this.discoverApiDocs();

        // 2. Login-Endpunkte testen
        const loginResults = await this.discoverLoginEndpoint();

        // 3. Erfolgreiche Login-Endpunkte filtern
        const successfulLogins = loginResults.filter(r => r.success);

        console.log('\n📊 ZUSAMMENFASSUNG:');
        console.log('==================');

        if (docsUrl) {
            console.log(`📚 API-Dokumentation: ${docsUrl}`);
        }

        if (successfulLogins.length > 0) {
            console.log('\n✅ Funktionierende Login-Endpunkte:');
            successfulLogins.forEach(login => {
                console.log(`  - ${login.endpoint} (${login.status})`);
                if (login.data?.token || login.data?.access_token) {
                    console.log(`    🔑 Token erhalten: ${login.data.token ? 'token' : 'access_token'}`);
                }
            });
        } else {
            console.log('\n❌ Keine funktionierenden Login-Endpunkte gefunden');
            console.log('\n🔍 Details der Fehler:');
            loginResults.forEach(result => {
                console.log(`  - ${result.endpoint}: ${result.error || result.status}`);
            });
        }

        return {
            docsUrl,
            loginResults,
            successfulLogins,
            recommendedEndpoint: successfulLogins[0]?.endpoint
        };
    }
}

module.exports = NoBorderApiDebugger;