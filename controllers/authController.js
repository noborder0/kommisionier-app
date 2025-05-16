const passport = require('passport');
const User = require('../models/User');

// Login-Seite anzeigen
exports.showLogin = (req, res) => {
    res.render('auth/login', {
        title: 'Login'
    });
};

// Registrierungsseite anzeigen
exports.showRegister = (req, res) => {
    res.render('auth/register', {
        title: 'Registrierung'
    });
};

// Registrierungsprozess
exports.register = async (req, res) => {
    try {
        const { name, username, password, password2, role } = req.body;
        let errors = [];

        // Validierung
        if (!name || !username || !password || !password2) {
            errors.push({ msg: 'Bitte füllen Sie alle Felder aus' });
        }

        if (password !== password2) {
            errors.push({ msg: 'Passwörter stimmen nicht überein' });
        }

        if (password.length < 6) {
            errors.push({ msg: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }

        if (errors.length > 0) {
            return res.render('auth/register', {
                title: 'Registrierung',
                errors,
                name,
                username,
                role
            });
        }

        // Prüfen, ob Benutzer bereits existiert
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            errors.push({ msg: 'Benutzername bereits vergeben' });
            return res.render('auth/register', {
                title: 'Registrierung',
                errors,
                name,
                username,
                role
            });
        }

        // Neuen Benutzer erstellen
        const newUser = new User({
            name,
            username,
            password,
            role: role || 'warehouse'
        });

        await newUser.save();
        req.flash('success_msg', 'Sie sind jetzt registriert und können sich einloggen');
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Fehler bei der Registrierung:', error);
        req.flash('error_msg', 'Ein Fehler ist aufgetreten');
        res.redirect('/auth/register');
    }
};

// Login-Prozess
exports.login = (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/auth/login',
        failureFlash: true
    })(req, res, next);
};

// Logout-Prozess
exports.logout = (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        req.flash('success_msg', 'Sie wurden abgemeldet');
        res.redirect('/auth/login');
    });
};