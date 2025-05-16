module.exports = {
    ensureAuthenticated: function(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error_msg', 'Bitte loggen Sie sich ein, um diese Seite zu sehen');
        res.redirect('/auth/login');
    },

    ensureAdmin: function(req, res, next) {
        if (req.isAuthenticated() && req.user.role === 'admin') {
            return next();
        }
        req.flash('error_msg', 'Sie benötigen Admin-Rechte, um auf diese Seite zuzugreifen');
        res.redirect('/dashboard');
    }
};