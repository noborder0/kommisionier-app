const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');

// Login-Seite
router.get('/login', authController.showLogin);

// Registrierungsseite
router.get('/register', ensureAdmin, authController.showRegister);

// Registrierungsprozess
router.post('/register', ensureAdmin, authController.register);

// Login-Prozess
router.post('/login', authController.login);

// Logout
router.get('/logout', authController.logout);

module.exports = router;