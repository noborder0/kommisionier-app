const LocalStrategy = require('passport-local').Strategy;
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Benutzermodell laden (erstellen Sie dieses als nächstes, falls nicht vorhanden)
const User = require('../models/User');

module.exports = function(passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'username' }, async (username, password, done) => {
            try {
                // Benutzer suchen
                const user = await User.findOne({ username });

                if (!user) {
                    return done(null, false, { message: 'Dieser Benutzer existiert nicht' });
                }

                // Passwort überprüfen
                const isMatch = await bcrypt.compare(password, user.password);

                if (!isMatch) {
                    return done(null, false, { message: 'Falsches Passwort' });
                }

                return done(null, user);
            } catch (err) {
                console.error(err);
                return done(err);
            }
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};
