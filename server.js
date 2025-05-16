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
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    next();
});

// Authentifizierungs-Middleware
const { ensureAuthenticated } = require('./middleware/auth');

// Routen
app.use('/auth', require('./routes/auth'));
app.use('/orders', require('./routes/orders'));

// Dashboard-Route hinzufügen
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        title: 'Dashboard',
        user: req.user
    });
});

// Index-Route aktualisieren, um auf Login umzuleiten, wenn nicht eingeloggt
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth/login');
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
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));