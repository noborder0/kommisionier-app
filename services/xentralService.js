const axios = require('axios');

/**
 * Xentral API Service
 * Stellt Methoden zur Kommunikation mit der Xentral API bereit.
 */
class XentralApiService {
    /**
     * Initialisiert den Xentral API Service.
     * @param {string} baseUrl - Die Basis-URL der Xentral API (z.B. 'https://ihre-xentral-instanz.de/api')
     * @param {string} apiKey - Der API-Schlüssel für die Authentifizierung
     */
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Ruft eine Liste von Lieferscheinen aus der Xentral API ab.
     * Dieser Endpunkt enthält nur grundlegende Informationen, keine Positionen.
     *
     * @param {number} page - Die aktuelle Seite (für Paginierung)
     * @param {number} pageSize - Die Anzahl der Einträge pro Seite
     * @param {Object} filters - Filter für die Abfrage (z.B. { status: 'released' })
     * @returns {Promise<Object>} - Die API-Antwort mit Lieferscheinen und Paginierungsinformationen
     */
    async listDeliveryNotes(page = 1, pageSize = 100, filters = {}) {
        try {
            const response = await axios.get(`${this.baseUrl}/deliverynotes`, {
                headers: this.headers,
                params: {
                    page: page,
                    pageSize: pageSize,
                    ...filters
                }
            });
            return response.data;
        } catch (error) {
            console.error('Fehler beim Abrufen der Lieferscheinliste:', error);
            throw error;
        }
    }

    /**
     * Ruft detaillierte Informationen zu einem bestimmten Lieferschein ab.
     * Dieser Endpunkt enthält alle Informationen einschließlich Positionen.
     *
     * @param {string} id - Die ID des Lieferscheins in Xentral
     * @returns {Promise<Object>} - Die detaillierten Informationen zum Lieferschein
     */
    async getDeliveryNoteDetails(id) {
        try {
            const response = await axios.get(`${this.baseUrl}/deliverynoteview/${id}`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error(`Fehler beim Abrufen des Lieferscheins mit ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Markiert einen Lieferschein als versendet.
     *
     * @param {string} id - Die ID des Lieferscheins in Xentral
     * @param {string} trackingNumber - Die Sendungsverfolgungsnummer (optional)
     * @returns {Promise<Object>} - Die API-Antwort
     */
    async markDeliveryNoteAsShipped(id, trackingNumber = null) {
        try {
            const data = {
                status: 'shipped',
                trackingNumber: trackingNumber
            };

            const response = await axios.patch(`${this.baseUrl}/deliverynotes/${id}`, data, {
                headers: this.headers
            });

            return response.data;
        } catch (error) {
            console.error(`Fehler beim Markieren des Lieferscheins ${id} als versendet:`, error);
            throw error;
        }
    }

    /**
     * Ruft Informationen zu einem Artikel ab.
     *
     * @param {string} id - Die ID des Artikels in Xentral
     * @returns {Promise<Object>} - Die Artikelinformationen
     */
    async getArticle(id) {
        try {
            const response = await axios.get(`${this.baseUrl}/articles/${id}`, {
                headers: this.headers
            });
            return response.data;
        } catch (error) {
            console.error(`Fehler beim Abrufen des Artikels mit ID ${id}:`, error);
            throw error;
        }
    }
}

module.exports = XentralApiService;