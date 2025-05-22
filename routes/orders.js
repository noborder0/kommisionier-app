const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Order = require('../models/order');
const NoBorderOrderController = require('../controllers/noBorderOrderController');

// No Border Controller initialisieren
const noBorderController = new NoBorderOrderController();
// ============== PROJEKT-BASIERTE ÜBERSICHTEN ==============

// Projekt-Dashboard - Neue Hauptansicht
router.get('/projects', ensureAuthenticated, async (req, res) => {
    try {
        // Aggregiere alle Projekte mit Statistiken
        const projectStats = await Order.aggregate([
            {
                $group: {
                    _id: {
                        id: '$project.id',
                        name: '$project.name'
                    },
                    totalOrders: { $sum: 1 },
                    newOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] }
                    },
                    inProgressOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
                    },
                    packedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'packed'] }, 1, 0] }
                    },
                    shippedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
                    },
                    urgentOrders: {
                        $sum: {
                            $cond: [
                                { $or: [
                                        { $eq: ['$priority', 'high'] },
                                        { $lte: ['$shippingDeadline', new Date(Date.now() + 4 * 60 * 60 * 1000)] }
                                    ]},
                                1,
                                0
                            ]
                        }
                    },
                    totalItems: { $sum: { $size: '$items' } },
                    lastActivity: { $max: '$updatedAt' }
                }
            },
            {
                $sort: { 'totalOrders': -1 }
            }
        ]);

        res.render('orders/projects-dashboard', {
            title: 'Projekt-Übersicht',
            user: req.user,
            projects: projectStats.map(p => ({
                id: p._id.id,
                name: p._id.name || 'Ohne Projekt',
                ...p
            }))
        });
    } catch (error) {
        console.error('Fehler beim Laden der Projekt-Übersicht:', error);
        req.flash('error_msg', 'Fehler beim Laden der Projekte');
        res.redirect('/dashboard');
    }
});

// Einzelnes Projekt anzeigen
router.get('/project/:projectId', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.query;

        let query = { 'project.id': projectId };
        if (status && status !== 'all') {
            query.status = status;
        }

        const orders = await Order.find(query)
            .populate('assignedTo', 'name')
            .sort({ priority: -1, createdAt: -1 });

        // Projekt-Details
        const projectName = orders.length > 0 ? orders[0].project?.name : 'Unbekanntes Projekt';

        // Projekt-spezifische Statistiken
        const stats = {
            total: orders.length,
            new: orders.filter(o => o.status === 'new').length,
            inProgress: orders.filter(o => o.status === 'in_progress').length,
            packed: orders.filter(o => o.status === 'packed').length,
            shipped: orders.filter(o => o.status === 'shipped').length,
            urgent: orders.filter(o => isUrgentOrder(o)).length
        };

        // Häufigste Artikel im Projekt
        const itemFrequency = {};
        orders.forEach(order => {
            order.items.forEach(item => {
                const key = item.sku || item.articleNumber;
                if (key) {
                    if (!itemFrequency[key]) {
                        itemFrequency[key] = {
                            sku: key,
                            description: item.description || item.productName,
                            count: 0,
                            totalQuantity: 0
                        };
                    }
                    itemFrequency[key].count++;
                    itemFrequency[key].totalQuantity += item.quantity || 0;
                }
            });
        });

        const topItems = Object.values(itemFrequency)
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, 10);

        res.render('orders/project-detail', {
            title: `Projekt: ${projectName}`,
            user: req.user,
            projectId,
            projectName,
            orders,
            stats,
            topItems,
            activeStatus: status || 'all'
        });
    } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
        req.flash('error_msg', 'Fehler beim Laden des Projekts');
        res.redirect('/orders/projects');
    }
});

// Projekt-basiertes Batch-Picking
router.get('/project/:projectId/batch-pick', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;

        const newOrders = await Order.find({
            'project.id': projectId,
            status: 'new'
        }).populate('items').sort({
            priority: -1,
            shippingDeadline: 1,
            createdAt: 1
        });

        const projectName = newOrders.length > 0 ? newOrders[0].project?.name : 'Unbekanntes Projekt';
        const batches = createOptimalBatches(newOrders);
        const stats = calculateBatchStats(batches);

        res.render('orders/project-batch-pick', {
            title: `Batch-Picking: ${projectName}`,
            user: req.user,
            projectId,
            projectName,
            batches,
            stats,
            totalOrders: newOrders.length
        });
    } catch (error) {
        console.error('Fehler beim Laden des Projekt-Batch-Pickings:', error);
        req.flash('error_msg', 'Fehler beim Laden');
        res.redirect(`/orders/project/${req.params.projectId}`);
    }
});

// ============== ERWEITERTE HAUPTÜBERSICHT MIT PROJEKT-FILTER ==============

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const { status, priority, method, project } = req.query;
        let query = {};

        if (status && status !== 'all') query.status = status;
        if (priority) query.priority = priority;
        if (method) query.packagingMethod = method;
        if (project) query['project.id'] = project;

        const orders = await Order.find(query)
            .populate('assignedTo', 'name')
            .sort({
                priority: -1,
                shippingDeadline: 1,
                createdAt: -1
            });

        // Verfügbare Projekte für Filter
        const availableProjects = await Order.distinct('project');

        // Statistiken berechnen
        const stats = {
            total: orders.length,
            new: orders.filter(o => o.status === 'new').length,
            inProgress: orders.filter(o => o.status === 'in_progress').length,
            urgent: orders.filter(o => isUrgentOrder(o)).length,
            byProject: {}
        };

        // Statistiken nach Projekt
        orders.forEach(order => {
            const projectName = order.project?.name || 'Ohne Projekt';
            if (!stats.byProject[projectName]) {
                stats.byProject[projectName] = 0;
            }
            stats.byProject[projectName]++;
        });

        res.render('orders/list', {
            title: status ? `Aufträge: ${status}` : 'Alle Aufträge',
            user: req.user,
            orders,
            stats,
            activeStatus: status || 'all',
            activeProject: project || null,
            availableProjects: availableProjects.filter(p => p && p.id)
        });
    } catch (error) {
        console.error('Fehler beim Laden der Aufträge:', error);
        req.flash('error_msg', 'Fehler beim Laden der Aufträge');
        res.redirect('/dashboard');
    }
});

// ============== BATCH-PICKING MIT PROJEKT-GRUPPIERUNG ==============

router.get('/batch-pick', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.query;

        let query = { status: 'new' };
        if (projectId) {
            query['project.id'] = projectId;
        }

        const newOrders = await Order.find(query)
            .populate('items')
            .sort({
                'project.name': 1,
                priority: -1,
                shippingDeadline: 1,
                createdAt: 1
            });

        // Gruppiere nach Projekt wenn kein spezifisches Projekt gewählt
        let batchesByProject = {};

        if (!projectId) {
            // Gruppiere Aufträge nach Projekt
            newOrders.forEach(order => {
                const projectKey = order.project?.id || 'no-project';
                const projectName = order.project?.name || 'Ohne Projekt';

                if (!batchesByProject[projectKey]) {
                    batchesByProject[projectKey] = {
                        projectId: projectKey,
                        projectName: projectName,
                        orders: []
                    };
                }

                batchesByProject[projectKey].orders.push(order);
            });

            // Erstelle Batches für jedes Projekt
            Object.keys(batchesByProject).forEach(projectKey => {
                const projectData = batchesByProject[projectKey];
                projectData.batches = createOptimalBatches(projectData.orders);
                projectData.stats = calculateBatchStats(projectData.batches);
            });
        } else {
            // Einzelnes Projekt
            const projectName = newOrders.length > 0 ? newOrders[0].project?.name : 'Unbekannt';
            batchesByProject = {
                [projectId]: {
                    projectId,
                    projectName,
                    orders: newOrders,
                    batches: createOptimalBatches(newOrders),
                    stats: calculateBatchStats(createOptimalBatches(newOrders))
                }
            };
        }

        res.render('orders/batch-pick-projects', {
            title: 'Batch-Kommissionierung nach Projekten',
            user: req.user,
            batchesByProject: Object.values(batchesByProject),
            selectedProject: projectId
        });
    } catch (error) {
        console.error('Fehler beim Laden der Batch-Übersicht:', error);
        req.flash('error_msg', 'Fehler beim Laden der Batch-Übersicht');
        res.redirect('/orders');
    }
});

// ============== PROJEKT-LAGERPLATZ OPTIMIERUNG ==============

function optimizePickingRoute(items, projectId = null) {
    // Berücksichtige projekt-spezifische Lagerbereiche
    return items.sort((a, b) => {
        const locA = parseLocation(a.storageLocation || a.location || 'Z99-99-99');
        const locB = parseLocation(b.storageLocation || b.location || 'Z99-99-99');

        // Projekt-spezifische Zonen haben Priorität
        if (projectId) {
            const projectZoneA = locA.zone.startsWith(projectId.substring(0, 1).toUpperCase());
            const projectZoneB = locB.zone.startsWith(projectId.substring(0, 1).toUpperCase());

            if (projectZoneA && !projectZoneB) return -1;
            if (!projectZoneA && projectZoneB) return 1;
        }

        // Standard-Sortierung
        if (locA.zone !== locB.zone) return locA.zone.localeCompare(locB.zone);
        if (locA.aisle !== locB.aisle) return locA.aisle - locB.aisle;
        if (locA.rack !== locB.rack) return locA.rack - locB.rack;
        return locA.level - locB.level;
    });
}

// ============== ERWEITERTE SUCHE MIT PROJEKT ==============

router.post('/search', ensureAuthenticated, async (req, res) => {
    try {
        const { deliveryNoteNumber, projectId } = req.body;

        let query = {
            $or: [
                { deliveryNoteNumber },
                { orderNumber: deliveryNoteNumber },
                { 'items.sku': deliveryNoteNumber },
                { 'items.barcode': deliveryNoteNumber }
            ]
        };

        // Projekt-Filter wenn angegeben
        if (projectId) {
            query['project.id'] = projectId;
        }

        const order = await Order.findOne(query);

        if (order) {
            return res.redirect(`/orders/${order._id}`);
        } else {
            // Versuche in No Border API zu finden
            req.flash('info_msg', `Suche in No Border API nach ${deliveryNoteNumber}...`);
            return res.redirect(`/orders/sync/${deliveryNoteNumber}`);
        }
    } catch (error) {
        console.error('Fehler bei der Suche:', error);
        req.flash('error_msg', 'Fehler bei der Suche');
        res.redirect('/orders/search');
    }
});

// ============== PROJEKT-STATISTIKEN API ==============

router.get('/api/project-stats/:projectId', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { period = 'week' } = req.query;

        const dateFilter = getDateFilter(period);

        const stats = await Order.aggregate([
            {
                $match: {
                    'project.id': projectId,
                    createdAt: { $gte: dateFilter }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        status: '$status'
                    },
                    count: { $sum: 1 },
                    items: { $sum: { $size: '$items' } }
                }
            },
            {
                $group: {
                    _id: '$_id.date',
                    statusCounts: {
                        $push: {
                            status: '$_id.status',
                            count: '$count',
                            items: '$items'
                        }
                    },
                    totalOrders: { $sum: '$count' },
                    totalItems: { $sum: '$items' }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);

        res.json({
            projectId,
            period,
            stats
        });
    } catch (error) {
        console.error('Fehler bei Projekt-Statistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============== HILFSFUNKTIONEN MIT PROJEKT-UNTERSTÜTZUNG ==============

function createOptimalBatches(orders) {
    const batches = {
        express: {
            type: 'express',
            name: 'Express & Eilaufträge',
            priority: 1,
            orders: [],
            icon: '🚀',
            color: 'danger'
        },
        singleItem: {
            type: 'singleItem',
            name: 'Einzelartikel',
            priority: 2,
            orders: [],
            icon: '📦',
            color: 'success'
        },
        projectBulk: {
            type: 'projectBulk',
            name: 'Projekt-Großaufträge',
            priority: 3,
            orders: [],
            icon: '🏭',
            color: 'info'
        },
        multiItem: {
            type: 'multiItem',
            name: 'Standardaufträge',
            priority: 4,
            orders: [],
            icon: '📋',
            color: 'primary'
        },
        bulky: {
            type: 'bulky',
            name: 'Sperrgut & Paletten',
            priority: 5,
            orders: [],
            icon: '🏗️',
            color: 'warning'
        }
    };

    // Gruppiere Aufträge gleicher Projekte für effizienteres Picking
    const projectGroups = {};

    orders.forEach(order => {
        const projectId = order.project?.id || 'no-project';
        if (!projectGroups[projectId]) {
            projectGroups[projectId] = [];
        }
        projectGroups[projectId].push(order);
    });

    // Klassifiziere Aufträge mit Projekt-Berücksichtigung
    orders.forEach(order => {
        const classification = classifyOrder(order);

        // Projekt-Großaufträge separat behandeln
        if (order.project && order.items.length > 20) {
            batches.projectBulk.orders.push(order);
        } else if (batches[classification]) {
            batches[classification].orders.push(order);
        }
    });

    return Object.values(batches)
        .filter(batch => batch.orders.length > 0)
        .map(batch => {
            const consolidatedItems = consolidateItems(batch.orders);
            return {
                ...batch,
                consolidatedItems: consolidatedItems,
                estimatedTime: estimateBatchTime({ ...batch, consolidatedItems }),
                projectCount: [...new Set(batch.orders.map(o => o.project?.id).filter(Boolean))].length
            };
        });
}

function getDateFilter(period) {
    const now = new Date();
    switch(period) {
        case 'today':
            now.setHours(0, 0, 0, 0);
            return now;
        case 'week':
            now.setDate(now.getDate() - 7);
            return now;
        case 'month':
            now.setMonth(now.getMonth() - 1);
            return now;
        default:
            now.setDate(now.getDate() - 7);
            return now;
    }
}

// Erweitere die bestehenden Funktionen...
function isUrgentOrder(order) {
    if (order.priority === 'high') return true;
    if (order.shippingMethod?.name?.toLowerCase().includes('express')) return true;
    if (order.project?.priority === 'high') return true; // Projekt-Priorität
    if (order.shippingDeadline) {
        const hoursUntilDeadline = (new Date(order.shippingDeadline) - new Date()) / (1000 * 60 * 60);
        return hoursUntilDeadline < 4;
    }
    return false;
}

// ============== PERFORMANCE TRACKING MIDDLEWARE ==============
router.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});

// ============== DASHBOARD & ÜBERSICHTEN ==============

// Hauptübersicht mit erweiterten Filtern
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const { status, priority, method } = req.query;
        let query = {};

        if (status && status !== 'all') query.status = status;
        if (priority) query.priority = priority;
        if (method) query.packagingMethod = method;

        const orders = await Order.find(query)
            .populate('assignedTo', 'name')
            .sort({
                priority: -1,
                shippingDeadline: 1,
                createdAt: -1
            });

        // Statistiken berechnen
        const stats = {
            total: orders.length,
            new: orders.filter(o => o.status === 'new').length,
            inProgress: orders.filter(o => o.status === 'in_progress').length,
            urgent: orders.filter(o => isUrgentOrder(o)).length
        };

        res.render('orders/list', {
            title: status ? `Aufträge: ${status}` : 'Alle Aufträge',
            user: req.user,
            orders,
            stats,
            activeStatus: status || 'all'
        });
    } catch (error) {
        console.error('Fehler beim Laden der Aufträge:', error);
        req.flash('error_msg', 'Fehler beim Laden der Aufträge');
        res.redirect('/dashboard');
    }
});

// Express-Aufträge Dashboard
router.get('/express', ensureAuthenticated, async (req, res) => {
    try {
        const expressOrders = await Order.find({
            status: { $in: ['new', 'in_progress'] },
            $or: [
                { 'shippingMethod.name': /express/i },
                { priority: 'high' },
                { shippingDeadline: { $lte: new Date(Date.now() + 4 * 60 * 60 * 1000) } }
            ]
        })
            .populate('assignedTo', 'name')
            .sort({ shippingDeadline: 1, priority: -1 });

        // Zeitkritische Informationen hinzufügen
        expressOrders.forEach(order => {
            if (order.shippingDeadline) {
                const remaining = order.shippingDeadline - new Date();
                order.remainingHours = Math.max(0, Math.floor(remaining / (1000 * 60 * 60)));
                order.remainingMinutes = Math.max(0, Math.floor(remaining / (1000 * 60)));
                order.isUrgent = order.remainingHours < 2;
                order.isCritical = order.remainingHours < 1;
            }
        });

        res.render('orders/express-dashboard', {
            title: 'Express-Aufträge',
            user: req.user,
            orders: expressOrders,
            currentTime: new Date()
        });
    } catch (error) {
        console.error('Fehler beim Laden der Express-Aufträge:', error);
        req.flash('error_msg', 'Fehler beim Laden der Express-Aufträge');
        res.redirect('/orders');
    }
});

// ============== BATCH-PICKING FUNKTIONALITÄT ==============

// Batch-Picking Übersicht
router.get('/batch-pick', ensureAuthenticated, async (req, res) => {
    try {
        const newOrders = await Order.find({
            status: 'new'
        }).populate('items').sort({
            priority: -1,
            shippingDeadline: 1,
            createdAt: 1
        });

        const batches = createOptimalBatches(newOrders);
        const stats = calculateBatchStats(batches);

        res.render('orders/batch-pick', {
            title: 'Batch-Kommissionierung',
            user: req.user,
            batches,
            stats,
            totalOrders: newOrders.length
        });
    } catch (error) {
        console.error('Fehler beim Laden der Batch-Übersicht:', error);
        req.flash('error_msg', 'Fehler beim Laden der Batch-Übersicht');
        res.redirect('/orders');
    }
});

// Batch erstellen
router.post('/create-batch', ensureAuthenticated, async (req, res) => {
    try {
        const { orderIds, batchType } = req.body;

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'Keine Aufträge ausgewählt' });
        }

        const orders = await Order.find({
            _id: { $in: orderIds },
            status: 'new'
        }).populate('items');

        if (orders.length === 0) {
            return res.status(400).json({ error: 'Keine gültigen Aufträge gefunden' });
        }

        // Konsolidierte Pickliste erstellen
        const consolidatedItems = consolidateItems(orders);
        const optimizedRoute = optimizePickingRoute(consolidatedItems);

        // Batch-Session erstellen
        const batchSession = {
            id: generateBatchId(),
            type: batchType || 'mixed',
            orders: orders.map(o => ({
                _id: o._id.toString(),
                deliveryNoteNumber: o.deliveryNoteNumber,
                customer: o.customer
            })),
            items: optimizedRoute,
            totalItems: optimizedRoute.reduce((sum, item) => sum + item.totalQuantity, 0),
            totalOrders: orders.length,
            startTime: new Date(),
            picker: req.user._id,
            currentItemIndex: 0,
            pickedItems: {}
        };

        // In Session speichern
        req.session.currentBatch = batchSession;

        // Status aller Aufträge aktualisieren
        await Order.updateMany(
            { _id: { $in: orderIds } },
            {
                status: 'in_progress',
                assignedTo: req.user._id,
                packagingMethod: batchType || 'mixed',
                batchId: batchSession.id
            }
        );

        res.json({
            success: true,
            batchId: batchSession.id,
            itemCount: optimizedRoute.length,
            orderCount: orders.length,
            estimatedTime: Math.ceil(optimizedRoute.length * 2.5)
        });

    } catch (error) {
        console.error('Fehler beim Erstellen des Batches:', error);
        res.status(500).json({ error: error.message });
    }
});

// Batch-Picking Prozess
router.get('/batch/:batchId', ensureAuthenticated, async (req, res) => {
    try {
        const batch = req.session.currentBatch;

        if (!batch || batch.id !== req.params.batchId) {
            req.flash('error_msg', 'Batch nicht gefunden oder abgelaufen');
            return res.redirect('/orders/batch-pick');
        }

        res.render('orders/batch-picking-process', {
            title: `Batch ${batch.id}`,
            user: req.user,
            batch,
            currentItem: batch.items[batch.currentItemIndex] || null,
            progress: Math.round((batch.currentItemIndex / batch.items.length) * 100)
        });

    } catch (error) {
        console.error('Fehler beim Batch-Picking:', error);
        req.flash('error_msg', 'Fehler beim Batch-Picking');
        res.redirect('/orders/batch-pick');
    }
});

// Batch-Item pick
router.post('/batch/:batchId/pick', ensureAuthenticated, async (req, res) => {
    try {
        const { quantity, itemIndex } = req.body;
        const batch = req.session.currentBatch;

        if (!batch || batch.id !== req.params.batchId) {
            return res.status(400).json({ error: 'Batch nicht gefunden' });
        }

        const currentItem = batch.items[itemIndex || batch.currentItemIndex];
        if (!currentItem) {
            return res.status(400).json({ error: 'Kein Artikel zum Picken' });
        }

        // Menge auf Aufträge verteilen
        let remainingQty = parseInt(quantity);

        for (const orderBreakdown of currentItem.orderBreakdown) {
            if (remainingQty <= 0) break;

            const pickQty = Math.min(remainingQty, orderBreakdown.quantity);

            // Update in Datenbank
            await Order.updateOne(
                {
                    _id: orderBreakdown.orderId,
                    'items.sku': currentItem.sku
                },
                {
                    $set: {
                        'items.$.quantityPicked': pickQty,
                        'items.$.pickingStatus': pickQty >= orderBreakdown.quantity ? 'complete' : 'partial',
                        'items.$.pickedAt': new Date(),
                        'items.$.pickedBy': req.user._id
                    }
                }
            );

            remainingQty -= pickQty;
        }

        // Batch-Session aktualisieren
        batch.pickedItems[`${currentItem.sku}-${currentItem.location}`] = quantity;
        batch.currentItemIndex++;
        req.session.currentBatch = batch;

        // Prüfen ob Batch fertig
        const isComplete = batch.currentItemIndex >= batch.items.length;

        res.json({
            success: true,
            nextItem: isComplete ? null : batch.items[batch.currentItemIndex],
            progress: Math.round((batch.currentItemIndex / batch.items.length) * 100),
            isComplete
        });

    } catch (error) {
        console.error('Fehler beim Batch-Pick:', error);
        res.status(500).json({ error: error.message });
    }
});

// Batch abschließen
router.post('/batch/:batchId/complete', ensureAuthenticated, async (req, res) => {
    try {
        const batch = req.session.currentBatch;

        if (!batch || batch.id !== req.params.batchId) {
            return res.status(400).json({ error: 'Batch nicht gefunden' });
        }

        // Alle Aufträge auf "packed" setzen
        const orderIds = batch.orders.map(o => o._id);

        await Order.updateMany(
            { _id: { $in: orderIds } },
            {
                status: 'packed',
                packedAt: new Date()
            }
        );

        // Performance-Daten speichern
        const duration = new Date() - new Date(batch.startTime);
        const performance = {
            batchId: batch.id,
            userId: req.user._id,
            orderCount: batch.totalOrders,
            itemCount: batch.totalItems,
            duration: duration,
            itemsPerMinute: (batch.totalItems / (duration / 60000)).toFixed(2)
        };

        // Session bereinigen
        delete req.session.currentBatch;

        res.json({
            success: true,
            performance,
            redirect: '/orders/batch-pick'
        });

    } catch (error) {
        console.error('Fehler beim Abschließen des Batches:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============== EINZELAUFTRAG KOMMISSIONIERUNG ==============

// Auftragssuche
router.get('/search', ensureAuthenticated, (req, res) => {
    res.render('orders/search', {
        title: 'Lieferschein suchen',
        user: req.user
    });
});

// Auftragssuche verarbeiten
router.post('/search', ensureAuthenticated, async (req, res) => {
    try {
        const { deliveryNoteNumber } = req.body;

        const order = await Order.findOne({
            $or: [
                { deliveryNoteNumber },
                { orderNumber: deliveryNoteNumber },
                { 'items.sku': deliveryNoteNumber },
                { 'items.barcode': deliveryNoteNumber }
            ]
        });

        if (order) {
            return res.redirect(`/orders/${order._id}`);
        } else {
            // Versuche in No Border API zu finden
            return res.redirect(`/orders/sync/${deliveryNoteNumber}`);
        }
    } catch (error) {
        console.error('Fehler bei der Suche:', error);
        req.flash('error_msg', 'Fehler bei der Suche');
        res.redirect('/orders/search');
    }
});

// Einzelauftrag Details
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('assignedTo', 'name')
            .populate('updatedBy', 'name');

        if (!order) {
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        // Automatische Verpackungsmethode vorschlagen
        if (order.status === 'new' && !order.packagingMethod) {
            order.suggestedPackaging = detectOptimalPackaging(order);
        }

        // Performance-Daten für den Benutzer
        const userStats = await calculateUserDailyStats(req.user._id);

        res.render('orders/details', {
            title: `Lieferschein: ${order.deliveryNoteNumber}`,
            user: req.user,
            order,
            userStats
        });
    } catch (error) {
        console.error('Fehler beim Laden der Details:', error);
        req.flash('error_msg', 'Fehler beim Laden der Details');
        res.redirect('/orders');
    }
});

// Automatische Verpackungsmethode + Start
router.post('/:id/auto-pack', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items');

        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        if (order.status !== 'new') {
            return res.status(400).json({ error: 'Auftrag bereits in Bearbeitung' });
        }

        // Intelligente Verpackungsmethode
        const packagingMethod = detectOptimalPackaging(order);

        // Picking-Reihenfolge optimieren
        order.items = optimizePickingRoute(order.items);

        // Status aktualisieren
        order.packagingMethod = packagingMethod;
        order.status = 'in_progress';
        order.assignedTo = req.user._id;
        order.startedAt = new Date();

        // Items vorbereiten
        order.items.forEach(item => {
            item.pickingStatus = 'in_progress';
            item.quantityPicked = 0;
        });

        await order.save();

        // No Border API Update
        try {
            await noBorderController.updateOrderStatus(order._id, 'in_progress');
        } catch (apiError) {
            console.error('No Border API Update fehlgeschlagen:', apiError);
        }

        res.json({
            success: true,
            packagingMethod,
            itemCount: order.items.length,
            estimatedTime: Math.ceil(order.items.length * 1.5)
        });

    } catch (error) {
        console.error('Fehler bei Auto-Pack:', error);
        res.status(500).json({ error: error.message });
    }
});

// Artikel scannen/picken (AJAX)
router.post('/:id/scan', ensureAuthenticated, async (req, res) => {
    try {
        const { barcode, quantity } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        // Finde Artikel durch verschiedene Identifikatoren
        const item = order.items.find(item =>
            item.sku === barcode ||
            item.articleNumber === barcode ||
            item.barcode === barcode ||
            item.ean === barcode
        );

        if (!item) {
            // Intelligente Suche mit teilweiser Übereinstimmung
            const partialMatch = order.items.find(item =>
                (item.sku && item.sku.includes(barcode)) ||
                (item.barcode && item.barcode.includes(barcode))
            );

            if (partialMatch) {
                return res.status(400).json({
                    error: 'Artikel nicht eindeutig',
                    suggestion: partialMatch.sku,
                    possibleMatches: [partialMatch]
                });
            }

            return res.status(404).json({ error: 'Artikel nicht gefunden' });
        }

        // Menge aktualisieren
        const pickQuantity = quantity || 1;
        item.quantityPicked = Math.min(
            (item.quantityPicked || 0) + pickQuantity,
            item.quantity
        );

        // Status aktualisieren
        if (item.quantityPicked >= item.quantity) {
            item.pickingStatus = 'complete';
        } else {
            item.pickingStatus = 'partial';
        }

        item.pickedBy = req.user._id;
        item.pickedAt = new Date();

        await order.save();

        // Fortschritt berechnen
        const progress = calculateOrderProgress(order);

        res.json({
            success: true,
            item: {
                sku: item.sku,
                description: item.description,
                quantityPicked: item.quantityPicked,
                quantity: item.quantity,
                status: item.pickingStatus
            },
            progress,
            orderComplete: progress === 100
        });

    } catch (error) {
        console.error('Fehler beim Scannen:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kommissionierung abschließen
router.post('/:id/complete-picking', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        // Validierung
        const validation = validateOrderCompletion(order);
        if (!validation.valid) {
            return res.status(400).json({
                error: validation.message,
                details: validation.details
            });
        }

        // Performance-Daten sammeln
        const duration = new Date() - order.startedAt;
        const itemCount = order.items.reduce((sum, item) => sum + item.quantityPicked, 0);

        order.status = 'packed';
        order.packedAt = new Date();
        order.packingDuration = duration;
        order.performance = {
            itemsPerMinute: (itemCount / (duration / 60000)).toFixed(2),
            accuracy: calculateAccuracy(order)
        };

        await order.save();

        // No Border Update
        try {
            await noBorderController.updateOrderStatus(order._id, 'packed');
        } catch (apiError) {
            console.error('No Border Update fehlgeschlagen:', apiError);
        }

        res.json({
            success: true,
            performance: order.performance,
            redirectUrl: `/orders/${order._id}/print`
        });

    } catch (error) {
        console.error('Fehler beim Abschließen:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============== DRUCK & VERSAND ==============

// Druck-Seite
router.get('/:id/print', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('assignedTo', 'name');

        if (!order) {
            req.flash('error_msg', 'Auftrag nicht gefunden');
            return res.redirect('/orders');
        }

        if (!['packed', 'shipped'].includes(order.status)) {
            req.flash('error_msg', 'Auftrag muss erst kommissioniert werden');
            return res.redirect(`/orders/${order._id}`);
        }

        // Verfügbare Carrier basierend auf Zielland
        const availableCarriers = getAvailableCarriers(order.customer?.country);

        res.render('orders/print', {
            title: `Drucken: ${order.deliveryNoteNumber}`,
            user: req.user,
            order,
            availableCarriers
        });

    } catch (error) {
        console.error('Fehler beim Laden der Druck-Seite:', error);
        req.flash('error_msg', 'Fehler beim Laden der Druck-Seite');
        res.redirect('/orders');
    }
});

// Als versendet markieren
router.post('/:id/mark-shipped', ensureAuthenticated, async (req, res) => {
    try {
        const { trackingNumber, carrier, shippingCost, notes } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Auftrag nicht gefunden' });
        }

        order.status = 'shipped';
        order.shippingDate = new Date();
        order.shipping = {
            ...order.shipping,
            trackingNumber,
            carrier,
            cost: shippingCost,
            notes,
            trackingUrl: generateTrackingUrl(carrier, trackingNumber)
        };

        await order.save();

        // No Border Update mit Tracking
        try {
            await noBorderController.updateOrderStatus(order._id, 'shipped', trackingNumber);
        } catch (apiError) {
            console.error('No Border Update fehlgeschlagen:', apiError);
        }

        res.json({
            success: true,
            message: 'Auftrag wurde als versendet markiert'
        });

    } catch (error) {
        console.error('Fehler beim Markieren als versendet:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============== SYNCHRONISIERUNG ==============

// Vollständige Synchronisierung
router.get('/sync', ensureAuthenticated, async (req, res) => {
    try {
        await noBorderController.syncOpenOrders(req, res);
    } catch (error) {
        console.error('Fehler bei der Synchronisierung:', error);
        if (!res.headersSent) {
            req.flash('error_msg', `Synchronisierungsfehler: ${error.message}`);
            res.redirect('/orders');
        }
    }
});

// Einzelnen Lieferschein synchronisieren
router.get('/sync/:deliveryNoteNumber', ensureAuthenticated, async (req, res) => {
    try {
        const { deliveryNoteNumber } = req.params;

        const noBorderOrder = await noBorderController.noBorderService.findDeliveryNoteByNumber(deliveryNoteNumber);

        if (!noBorderOrder) {
            req.flash('error_msg', `Lieferschein ${deliveryNoteNumber} wurde nicht gefunden.`);
            return res.redirect('/orders/search');
        }

        const order = await noBorderController.importOrUpdateSingleOrder(noBorderOrder);

        req.flash('success_msg', `Lieferschein ${deliveryNoteNumber} wurde erfolgreich synchronisiert.`);
        return res.redirect(`/orders/${order._id}`);

    } catch (error) {
        console.error('Fehler bei der Einzelsynchronisierung:', error);
        req.flash('error_msg', `Fehler bei der Synchronisierung: ${error.message}`);
        res.redirect('/orders/search');
    }
});

// API Test
router.get('/api-test', ensureAuthenticated, async (req, res) => {
    await noBorderController.testApiConnection(req, res);
});

// ============== HILFSFUNKTIONEN ==============

function createOptimalBatches(orders) {
    const batches = {
        express: {
            type: 'express',
            name: 'Express & Eilaufträge',
            priority: 1,
            orders: [],
            icon: '🚀',
            color: 'danger'
        },
        singleItem: {
            type: 'singleItem',
            name: 'Einzelartikel',
            priority: 2,
            orders: [],
            icon: '📦',
            color: 'success'
        },
        multiItem: {
            type: 'multiItem',
            name: 'Standardaufträge',
            priority: 3,
            orders: [],
            icon: '📋',
            color: 'primary'
        },
        bulky: {
            type: 'bulky',
            name: 'Sperrgut & Paletten',
            priority: 4,
            orders: [],
            icon: '🏗️',
            color: 'warning'
        }
    };

    orders.forEach(order => {
        const classification = classifyOrder(order);
        if (batches[classification]) {
            batches[classification].orders.push(order);
        }
    });

    return Object.values(batches)
        .filter(batch => batch.orders.length > 0)
        .map(batch => {
            const consolidatedItems = consolidateItems(batch.orders);
            return {
                ...batch,
                consolidatedItems: consolidatedItems,
                estimatedTime: estimateBatchTime({ ...batch, consolidatedItems })
            };
        });
}

function classifyOrder(order) {
    if (!order || !order.items || !Array.isArray(order.items)) {
        return 'multiItem'; // Default
    }

    const totalItems = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalWeight = order.items.reduce((sum, item) =>
        sum + (item.weight || 0.5) * (item.quantity || 0), 0
    );

    if (isUrgentOrder(order)) {
        return 'express';
    } else if (order.items.length === 1 && totalItems < 5) {
        return 'singleItem';
    } else if (totalWeight > 20 || order.items.some(item => (item.weight || 0) > 10)) {
        return 'bulky';
    } else {
        return 'multiItem';
    }
}

function consolidateItems(orders) {
    const itemMap = new Map();

    if (!orders || !Array.isArray(orders)) {
        return [];
    }

    orders.forEach(order => {
        if (!order.items || !Array.isArray(order.items)) {
            return;
        }

        order.items.forEach(item => {
            if (!item) return;

            const key = `${item.sku || 'UNKNOWN'}-${item.storageLocation || 'LAGER'}`;

            if (itemMap.has(key)) {
                const existing = itemMap.get(key);
                existing.totalQuantity += (item.quantity || 0);
                existing.orderBreakdown.push({
                    orderId: order._id,
                    deliveryNote: order.deliveryNoteNumber || 'N/A',
                    quantity: item.quantity || 0,
                    customer: order.customer?.name || 'Unbekannt'
                });
            } else {
                itemMap.set(key, {
                    sku: item.sku || item.articleNumber || 'UNKNOWN',
                    articleNumber: item.articleNumber || item.sku || 'UNKNOWN',
                    description: item.description || item.productName || item.name || 'Keine Beschreibung',
                    location: item.storageLocation || 'LAGER',
                    totalQuantity: item.quantity || 0,
                    unit: item.unit || 'Stk',
                    weight: item.weight || 0,
                    orderBreakdown: [{
                        orderId: order._id,
                        deliveryNote: order.deliveryNoteNumber || 'N/A',
                        quantity: item.quantity || 0,
                        customer: order.customer?.name || 'Unbekannt'
                    }]
                });
            }
        });
    });

    return Array.from(itemMap.values());
}

function optimizePickingRoute(items) {
    return items.sort((a, b) => {
        const locA = parseLocation(a.storageLocation || a.location || 'Z99-99-99');
        const locB = parseLocation(b.storageLocation || b.location || 'Z99-99-99');

        // Sortierung: Zone > Gang > Regal > Ebene
        if (locA.zone !== locB.zone) return locA.zone.localeCompare(locB.zone);
        if (locA.aisle !== locB.aisle) return locA.aisle - locB.aisle;
        if (locA.rack !== locB.rack) return locA.rack - locB.rack;
        return locA.level - locB.level;
    });
}

function parseLocation(location) {
    // Format: A01-02-03 (Zone-Gang-Regal-Ebene)
    const match = location.match(/([A-Z])(\d+)-(\d+)-(\d+)/);
    if (match) {
        return {
            zone: match[1],
            aisle: parseInt(match[2]),
            rack: parseInt(match[3]),
            level: parseInt(match[4])
        };
    }
    return { zone: 'Z', aisle: 99, rack: 99, level: 99 };
}

function detectOptimalPackaging(order) {
    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueItems = order.items.length;
    const totalWeight = order.items.reduce((sum, item) =>
        sum + (item.weight || 0.5) * item.quantity, 0
    );
    const totalVolume = order.items.reduce((sum, item) =>
        sum + (item.volume || 1) * item.quantity, 0
    );

    // Intelligente Regeln
    if (totalWeight > 25 || order.items.some(item => (item.weight || 0) > 10)) {
        return 'pallet';
    } else if (uniqueItems === 1 && totalItems > 10) {
        return 'homogeneous';
    } else if (totalVolume > 50 || totalItems > 20 || uniqueItems > 10) {
        return 'mixed';
    } else {
        return 'package';
    }
}

function isUrgentOrder(order) {
    if (order.priority === 'high') return true;
    if (order.shippingMethod?.name?.toLowerCase().includes('express')) return true;
    if (order.shippingDeadline) {
        const hoursUntilDeadline = (new Date(order.shippingDeadline) - new Date()) / (1000 * 60 * 60);
        return hoursUntilDeadline < 4;
    }
    return false;
}

function generateBatchId() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.toTimeString().slice(0, 5).replace(':', '');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `B${dateStr}-${timeStr}-${random}`;
}

function calculateBatchStats(batches) {
    if (!batches || !Array.isArray(batches)) {
        return [];
    }

    return batches.map(batch => ({
        type: batch.type,
        name: batch.name,
        orderCount: batch.orders ? batch.orders.length : 0,
        itemCount: batch.consolidatedItems ? batch.consolidatedItems.reduce((sum, item) => sum + (item.totalQuantity || 0), 0) : 0,
        uniqueItems: batch.consolidatedItems ? batch.consolidatedItems.length : 0,
        estimatedTime: batch.estimatedTime || 0,
        locations: batch.consolidatedItems ? [...new Set(batch.consolidatedItems.map(item => item.location || 'LAGER'))].length : 0,
        totalWeight: batch.consolidatedItems ? batch.consolidatedItems.reduce((sum, item) =>
            sum + (item.weight || 0.5) * (item.totalQuantity || 0), 0
        ) : 0
    }));
}

function estimateBatchTime(batch) {
    // Sicherstellen dass consolidatedItems existiert
    if (!batch.consolidatedItems || !Array.isArray(batch.consolidatedItems)) {
        return 0;
    }

    const baseTimePerItem = 2.5; // Minuten
    const locationCount = [...new Set(batch.consolidatedItems.map(i => i.location))].length;
    const walkingTime = locationCount * 0.5; // 30 Sekunden pro Lagerplatz

    return Math.ceil(
        batch.consolidatedItems.length * baseTimePerItem + walkingTime
    );
}

function calculateOrderProgress(order) {
    const totalRequired = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPicked = order.items.reduce((sum, item) => sum + (item.quantityPicked || 0), 0);

    return totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 100) : 0;
}

function validateOrderCompletion(order) {
    const incompletePicks = order.items.filter(item =>
        (item.quantityPicked || 0) < item.quantity
    );

    if (incompletePicks.length > 0) {
        return {
            valid: false,
            message: `${incompletePicks.length} Artikel sind noch nicht vollständig kommissioniert`,
            details: incompletePicks.map(item => ({
                sku: item.sku,
                description: item.description,
                required: item.quantity,
                picked: item.quantityPicked || 0
            }))
        };
    }

    return { valid: true };
}

function calculateAccuracy(order) {
    // Basis: 100% - später können hier Fehler abgezogen werden
    return 100;
}

async function calculateUserDailyStats(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Order.aggregate([
        {
            $match: {
                'items.pickedBy': userId,
                'items.pickedAt': { $gte: today }
            }
        },
        {
            $unwind: '$items'
        },
        {
            $match: {
                'items.pickedBy': userId,
                'items.pickedAt': { $gte: today }
            }
        },
        {
            $group: {
                _id: null,
                totalItems: { $sum: '$items.quantityPicked' },
                orderCount: { $addToSet: '$_id' }
            }
        }
    ]);

    return {
        items: stats[0]?.totalItems || 0,
        orders: stats[0]?.orderCount?.length || 0,
        avgTime: '2:30',
        accuracy: 98.5
    };
}

function getAvailableCarriers(country) {
    const carriers = {
        DE: ['dhl', 'dpd', 'ups', 'fedex', 'gls', 'hermes'],
        AT: ['post-at', 'dpd', 'ups', 'gls'],
        CH: ['swiss-post', 'dpd', 'ups', 'fedex'],
        default: ['dhl', 'ups', 'fedex']
    };

    return carriers[country] || carriers.default;
}

function generateTrackingUrl(carrier, trackingNumber) {
    const urls = {
        dhl: `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${trackingNumber}`,
        dpd: `https://tracking.dpd.de/parcelstatus?query=${trackingNumber}`,
        ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
        fedex: `https://www.fedex.com/fedextrack/?tracknumbers=${trackingNumber}`,
        gls: `https://gls-group.eu/EU/de/paket-verfolgen?match=${trackingNumber}`,
        hermes: `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/${trackingNumber}`
    };

    return urls[carrier] || '#';
}

// Export
module.exports = router;