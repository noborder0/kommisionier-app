const axios = require('axios');
require('dotenv').config();

// Verwenden Sie die bereits konfigurierte Base-URL direkt
const xentralClient = axios.create({
    baseURL: process.env.XENTRAL_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XENTRAL_API_KEY}`
    },
    timeout: 10000
});

// Einfache Testfunktion für die API-Verbindung
exports.testConnection = async () => {
    try {
        // Versuchen Sie einen einfachen GET-Request an den deliveryNotes-Endpunkt
        const response = await xentralClient.get('/deliveryNotes', {
            params: { limit: 1 }
        });

        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        console.error('API-Verbindungsfehler:', error.message);
        console.error('Response data:', error.response?.data);
        console.error('Request config:', {
            url: error.config?.url,
            method: error.config?.method,
            headers: {
                ...error.config?.headers,
                Authorization: 'Bearer ***' // Maskiere den API-Key
            }
        });

        return {
            success: false,
            error: error.message,
            status: error.response?.status,
            details: error.response?.data
        };
    }
};

// Status-Mapping-Funktionen (können später angepasst werden)
function mapStatusToXentral(internalStatus) {
    return internalStatus;  // Vorerst 1:1 Mapping
}

function mapXentralToInternalStatus(xentralStatus) {
    return xentralStatus;  // Vorerst 1:1 Mapping
}

exports.mapStatusToXentral = mapStatusToXentral;
exports.mapXentralToInternalStatus = mapXentralToInternalStatus;