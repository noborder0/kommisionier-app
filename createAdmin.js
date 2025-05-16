require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// Verbindung zur Datenbank herstellen
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB verbunden'))
    .catch(err => {
        console.error('MongoDB Verbindungsfehler:', err);
        process.exit(1);
    });

const createAdmin = async () => {
    try {
        // Prüfen, ob bereits ein Admin existiert
        const adminExists = await User.findOne({ role: 'admin' });

        if (adminExists) {
            console.log('Admin-Benutzer existiert bereits!');
            process.exit(0);
        }

        // Admin-Benutzer erstellen
        const admin = new User({
            username: 'admin',
            password: 'admin123',  // Dies wird automatisch gehasht
            name: 'Administrator',
            role: 'admin'
        });

        await admin.save();
        console.log('Admin-Benutzer wurde erfolgreich erstellt!');
        console.log('Username: admin');
        console.log('Passwort: admin123');

        process.exit(0);
    } catch (error) {
        console.error('Fehler beim Erstellen des Admin-Benutzers:', error);
        process.exit(1);
    }
};

createAdmin();