const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const passport = require('passport');
const path = require('path');
const cors = require('cors');
const flash = require('connect-flash');
const methodOverride = require('method-override');
require('dotenv').config();

// Sync Scheduler importieren
const syncScheduler = require('./services/syncScheduler');

// App-Initialisierung
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method')); // Für PUT und DELETE Anfragen

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Datenbank verbinden
const connectDB = require('./config/db');
connectDB();

// Session-Konfiguration
app.use(session({
    secret: process.env.SESSION_SECRET || 'kommissionier-geheim',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 Stunden
}));

// Flash-Nachrichten
app.use(flash());

// Passport initialisieren und konfigurieren
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// Globale Variablen
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.warning_msg = req.flash('warning_msg');
    res.locals.info_msg = req.flash('info_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    res.locals.process = process; // Für System-Informationen in Views

    // Sync-Status für Views
    res.locals.syncStatus = syncScheduler.getStats();

    next();
});

// Authentifizierungs-Middleware
const { ensureAuthenticated } = require('./middleware/auth');

// Routen
app.use('/auth', require('./routes/auth'));
app.use('/orders', require('./routes/orders'));
app.use('/settings', require('./routes/settings'));

// Dashboard-Route
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    const syncStats = syncScheduler.getStats();

    res.render('dashboard', {
        title: 'Dashboard',
        user: req.user,
        syncStats: syncStats
    });
});

// Index-Route aktualisieren, um auf Login umzuleiten, wenn nicht eingeloggt
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth/login');
});

// API Route für Dashboard-Statistiken
app.get('/api/dashboard/stats', ensureAuthenticated, async (req, res) => {
    try {
        const Order = require('./models/order');

        // Heute Start und Ende
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Statistiken abrufen
        const [newOrders, inProgressOrders, packedOrders, shippedToday] = await Promise.all([
            Order.countDocuments({ status: 'new' }),
            Order.countDocuments({ status: 'in_progress' }),
            Order.countDocuments({ status: 'packed' }),
            Order.countDocuments({
                status: 'shipped',
                shippingDate: {
                    $gte: todayStart,
                    $lte: todayEnd
                }
            })
        ]);

        res.json({
            newOrders,
            inProgressOrders,
            packedOrders,
            shippedToday,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Dashboard-Statistiken:', error);
        res.status(500).json({
            error: 'Fehler beim Abrufen der Statistiken'
        });
    }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
    const syncStats = syncScheduler.getStats();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sync: {
            enabled: process.env.AUTO_SYNC_ENABLED === 'true',
            ...syncStats
        }
    });
});

// 404 Seite (für nicht gefundene Routen)
app.use((req, res) => {
    res.status(404).render('errors/404', {
        title: '404 Seite nicht gefunden',
        user: req.user || null
    });
});

// Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/500', {
        title: 'Server-Fehler',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user || null
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);

    // Sync Scheduler starten, wenn aktiviert
    if (process.env.AUTO_SYNC_ENABLED === 'true') {
        const syncInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES) || 1;
        syncScheduler.start(syncInterval);
        console.log(`Automatische Synchronisierung aktiviert (alle ${syncInterval} Minute(n))`);
    } else {
        console.log('Automatische Synchronisierung ist deaktiviert');
    }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM empfangen, fahre Server herunter...');

    // Sync Scheduler stoppen
    if (syncScheduler.isRunning) {
        syncScheduler.stop();
    }

    // Server schließen
    app.close(() => {
        console.log('Server beendet');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT empfangen, fahre Server herunter...');

    // Sync Scheduler stoppen
    if (syncScheduler.isRunning) {
        syncScheduler.stop();
    }

    process.exit(0);
});