const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Order = require('../models/order');
const NoBorderOrderController = require('../controllers/noBorderOrderController');

// Controller initialisieren
const noBorderController = new NoBorderOrderController();

// Projekt-Dashboard
router.get('/projects', ensureAuthenticated, async (req, res) => {
    try {
        // Projekte aus Orders aggregieren
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
                                {
                                    $or: [
                                        { $eq: ['$priority', 'high'] },
                                        { $lte: ['$shippingDeadline', new Date(Date.now() + 2 * 60 * 60 * 1000)] }
                                    ]
                                },
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
                $match: {
                    '_id.id': { $ne: null }
                }
            },
            {
                $project: {
                    id: '$_id.id',
                    name: '$_id.name',
                    totalOrders: 1,
                    newOrders: 1,
                    inProgressOrders: 1,
                    packedOrders: 1,
                    shippedOrders: 1,
                    urgentOrders: 1,
                    totalItems: 1,
                    lastActivity: 1,
                    _id: 0
                }
            },
            { $sort: { totalOrders: -1 } }
        ]);

        // Projekte von API abrufen und mit lokalen Daten mergen
        try {
            const apiProjects = await noBorderController.noBorderService.getAllProjects();

            // Merge API-Projekte mit lokalen Stats
            const mergedProjects = apiProjects.map(apiProject => {
                const localStats = projectStats.find(p => p.id === apiProject.id);
                return {
                    ...apiProject,
                    ...localStats,
                    name: localStats?.name || apiProject.name || `Projekt ${apiProject.id}`
                };
            });

            // Füge lokale Projekte hinzu, die nicht in API sind
            projectStats.forEach(localProject => {
                if (!mergedProjects.find(p => p.id === localProject.id)) {
                    mergedProjects.push(localProject);
                }
            });

            res.render('orders/projects-dashboard', {
                title: 'Projekt-Übersicht',
                user: req.user,
                projects: mergedProjects
            });
        } catch (apiError) {
            console.warn('Fehler beim Abrufen der API-Projekte:', apiError);
            // Fallback auf lokale Daten
            res.render('orders/projects-dashboard', {
                title: 'Projekt-Übersicht',
                user: req.user,
                projects: projectStats
            });
        }

    } catch (error) {
        console.error('Fehler beim Laden der Projekte:', error);
        req.flash('error_msg', 'Fehler beim Laden der Projekte');
        res.redirect('/orders');
    }
});

// Projekt-Detail-Ansicht
router.get('/project/:projectId', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.query;

        // Filter erstellen
        const filter = { 'project.id': projectId };
        if (status && status !== 'all') {
            filter.status = status;
        }

        // Aufträge abrufen
        const orders = await Order.find(filter)
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 });

        // Statistiken berechnen
        const stats = {
            total: orders.length,
            new: orders.filter(o => o.status === 'new').length,
            inProgress: orders.filter(o => o.status === 'in_progress').length,
            packed: orders.filter(o => o.status === 'packed').length,
            shipped: orders.filter(o => o.status === 'shipped').length,
            urgent: orders.filter(o => o.priority === 'high' ||
                (o.shippingDeadline && o.shippingDeadline < new Date(Date.now() + 2 * 60 * 60 * 1000))).length
        };

        // Top-Artikel für das Projekt
        const topItems = await Order.getTopItemsByProject(projectId, 10);

        // Projekt-Name ermitteln
        const projectName = orders[0]?.project?.name || `Projekt ${projectId}`;

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

// Express-Dashboard Route
router.get('/express', ensureAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const expressDeadline = new Date();
        expressDeadline.setHours(14, 0, 0, 0);

        if (expressDeadline < now) {
            expressDeadline.setDate(expressDeadline.getDate() + 1);
        }

        // Express-Aufträge abrufen
        const expressOrders = await Order.find({
            $or: [
                { priority: 'high' },
                { 'shippingMethod.name': /express/i },
                { shippingDeadline: { $lte: expressDeadline } }
            ],
            status: { $in: ['new', 'in_progress', 'packed'] }
        })
            .populate('assignedTo', 'name')
            .sort({ shippingDeadline: 1, createdAt: 1 });

        // Zeit-Berechnungen
        const ordersWithTime = expressOrders.map(order => {
            const deadline = order.shippingDeadline || expressDeadline;
            const timeDiff = deadline - now;
            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

            return {
                ...order.toObject(),
                remainingHours: hours,
                remainingMinutes: minutes,
                totalRemainingMinutes: Math.floor(timeDiff / (1000 * 60)),
                isCritical: hours < 1,
                isUrgent: hours < 2
            };
        });

        res.render('orders/express-dashboard', {
            title: 'Express-Aufträge',
            user: req.user,
            orders: ordersWithTime
        });

    } catch (error) {
        console.error('Fehler beim Laden der Express-Aufträge:', error);
        req.flash('error_msg', 'Fehler beim Laden der Express-Aufträge');
        res.redirect('/orders');
    }
});

// Batch-Picking Route
router.get('/batch-pick', ensureAuthenticated, async (req, res) => {
    try {
        // Neue Aufträge für Batch-Picking
        const newOrders = await Order.find({ status: 'new' })
            .populate('items')
            .sort({ priority: -1, createdAt: 1 });

        // Batches nach verschiedenen Kriterien erstellen
        const batches = [];
        const stats = [];

        // 1. Express-Batch (zeitkritisch)
        const expressOrders = newOrders.filter(o =>
            o.priority === 'high' ||
            o.shippingMethod?.name?.includes('Express') ||
            (o.shippingDeadline && o.shippingDeadline < new Date(Date.now() + 4 * 60 * 60 * 1000))
        );

        if (expressOrders.length > 0) {
            const expressBatch = createBatch('express', 'Express-Aufträge', expressOrders, '🚀', 'danger');
            batches.push(expressBatch);
            stats.push(calculateBatchStats(expressBatch));
        }

        // 2. Single-Item-Batch (nur ein Artikel)
        const singleItemOrders = newOrders.filter(o =>
            o.items.length === 1 && !expressOrders.includes(o)
        );

        if (singleItemOrders.length > 0) {
            const singleBatch = createBatch('singleItem', 'Einzelartikel', singleItemOrders, '📦', 'success');
            batches.push(singleBatch);
            stats.push(calculateBatchStats(singleBatch));
        }

        // 3. Multi-Item-Batch (mehrere Artikel)
        const multiItemOrders = newOrders.filter(o =>
            o.items.length > 1 && o.items.length <= 10 &&
            !expressOrders.includes(o) && !singleItemOrders.includes(o)
        );

        if (multiItemOrders.length > 0) {
            const multiBatch = createBatch('multiItem', 'Standard Multi-Artikel', multiItemOrders, '📋', 'primary');
            batches.push(multiBatch);
            stats.push(calculateBatchStats(multiBatch));
        }

        // 4. Bulk-Batch (viele Artikel oder große Mengen)
        const bulkOrders = newOrders.filter(o =>
            o.items.length > 10 ||
            o.items.some(item => item.quantity > 20)
        ).filter(o => !expressOrders.includes(o));

        if (bulkOrders.length > 0) {
            const bulkBatch = createBatch('bulky', 'Großaufträge', bulkOrders, '🏗️', 'warning');
            batches.push(bulkBatch);
            stats.push(calculateBatchStats(bulkBatch));
        }

        res.render('orders/batch-pick', {
            title: 'Batch-Picking',
            user: req.user,
            batches,
            stats,
            totalOrders: newOrders.length
        });

    } catch (error) {
        console.error('Fehler beim Laden der Batch-Picking Ansicht:', error);
        req.flash('error_msg', 'Fehler beim Laden der Batch-Picking Ansicht');
        res.redirect('/orders');
    }
});

// Batch erstellen und starten
router.post('/create-batch', ensureAuthenticated, async (req, res) => {
    try {
        const { batchType, orderIds } = req.body;

        if (!orderIds || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Keine Aufträge ausgewählt'
            });
        }

        // Batch-ID generieren
        const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Aufträge aktualisieren
        await Order.updateMany(
            { _id: { $in: orderIds } },
            {
                $set: {
                    status: 'in_progress',
                    assignedTo: req.user._id,
                    batchId: batchId,
                    batchType: batchType,
                    batchStartTime: new Date()
                }
            }
        );

        res.json({
            success: true,
            batchId: batchId
        });

    } catch (error) {
        console.error('Fehler beim Erstellen des Batches:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Erstellen des Batches'
        });
    }
});

// Batch-Picking-Prozess
router.get('/batch/:batchId', ensureAuthenticated, async (req, res) => {
    try {
        const { batchId } = req.params;
        const itemIndex = parseInt(req.query.item) || 0;

        // Batch-Aufträge laden
        const batchOrders = await Order.find({ batchId })
            .populate('assignedTo', 'name');

        if (batchOrders.length === 0) {
            req.flash('error_msg', 'Batch nicht gefunden');
            return res.redirect('/orders/batch-pick');
        }

        // Artikel konsolidieren
        const consolidatedItems = consolidateItems(batchOrders);

        // Aktueller Artikel
        const currentItem = consolidatedItems[itemIndex] || null;

        // Batch-Informationen
        const batch = {
            id: batchId,
            type: batchOrders[0].batchType,
            totalOrders: batchOrders.length,
            totalItems: consolidatedItems.length,
            currentItemIndex: itemIndex,
            items: consolidatedItems,
            startTime: batchOrders[0].batchStartTime
        };

        // Fortschritt berechnen
        const progress = Math.round((itemIndex / consolidatedItems.length) * 100);

        res.render('orders/batch-picking-process', {
            title: `Batch-Picking: ${batchId}`,
            user: req.user,
            batch,
            currentItem,
            progress
        });

    } catch (error) {
        console.error('Fehler beim Laden des Batch-Picking-Prozesses:', error);
        req.flash('error_msg', 'Fehler beim Laden des Batch-Picking-Prozesses');
        res.redirect('/orders/batch-pick');
    }
});

// Batch-Pick bestätigen
router.post('/batch/:batchId/pick', ensureAuthenticated, async (req, res) => {
    try {
        const { batchId } = req.params;
        const { quantity, itemIndex } = req.body;

        // Batch-Aufträge laden
        const batchOrders = await Order.find({ batchId });
        const consolidatedItems = consolidateItems(batchOrders);
        const currentItem = consolidatedItems[itemIndex];

        if (!currentItem) {
            return res.status(400).json({
                success: false,
                error: 'Artikel nicht gefunden'
            });
        }

        // Menge auf die Aufträge verteilen
        let remainingQuantity = quantity;

        for (const orderInfo of currentItem.orderBreakdown) {
            if (remainingQuantity <= 0) break;

            const order = await Order.findById(orderInfo.orderId);
            const item = order.items.find(i =>
                i.sku === currentItem.sku ||
                i.articleNumber === currentItem.articleNumber
            );

            if (item) {
                const pickQuantity = Math.min(remainingQuantity, orderInfo.quantity);
                item.quantityPicked = (item.quantityPicked || 0) + pickQuantity;
                item.pickingStatus = item.quantityPicked >= item.quantity ? 'complete' : 'partial';
                item.pickedBy = req.user._id;
                item.pickedAt = new Date();

                remainingQuantity -= pickQuantity;
                await order.save();
            }
        }

        // Prüfen ob Batch abgeschlossen
        const isComplete = itemIndex >= consolidatedItems.length - 1;

        res.json({
            success: true,
            isComplete,
            nextItem: itemIndex + 1
        });

    } catch (error) {
        console.error('Fehler beim Batch-Pick:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Batch-Pick'
        });
    }
});

// Batch abschließen
router.post('/batch/:batchId/complete', ensureAuthenticated, async (req, res) => {
    try {
        const { batchId } = req.params;

        // Batch-Aufträge aktualisieren
        const batchOrders = await Order.find({ batchId });
        const startTime = batchOrders[0]?.batchStartTime || new Date();
        const duration = Date.now() - startTime;

        // Alle Aufträge auf "packed" setzen
        await Order.updateMany(
            { batchId },
            {
                $set: {
                    status: 'packed',
                    batchEndTime: new Date()
                },
                $unset: {
                    batchId: 1
                }
            }
        );

        // Performance-Daten
        const itemCount = batchOrders.reduce((sum, o) => sum + o.items.length, 0);
        const performance = {
            duration,
            itemCount,
            orderCount: batchOrders.length,
            itemsPerMinute: Math.round((itemCount / duration) * 60000)
        };

        res.json({
            success: true,
            performance,
            redirect: '/orders/batch-pick'
        });

    } catch (error) {
        console.error('Fehler beim Abschließen des Batches:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Abschließen des Batches'
        });
    }
});

// Schnellstart mit automatischer Verpackungsmethode
router.post('/:id/auto-pack', ensureAuthenticated, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Auftrag nicht gefunden'
            });
        }

        // Automatische Verpackungsmethode basierend auf Artikelanzahl
        let packagingMethod = 'package'; // Standard

        if (order.items.length === 1 && order.items[0].quantity <= 5) {
            packagingMethod = 'package';
        } else if (order.items.some(item => item.quantity > 20)) {
            packagingMethod = 'pallet';
        } else if (order.items.every(item => item.sku === order.items[0].sku)) {
            packagingMethod = 'homogeneous';
        } else {
            packagingMethod = 'mixed';
        }

        // Status aktualisieren
        order.packagingMethod = packagingMethod;
        order.status = 'in_progress';
        order.assignedTo = req.user._id;
        order.updatedBy = req.user._id;
        order.updatedAt = new Date();

        // Alle Items als "in_progress" markieren
        order.items.forEach(item => {
            if (item.pickingStatus === 'pending') {
                item.pickingStatus = 'in_progress';
            }
        });

        await order.save();

        res.json({
            success: true,
            packagingMethod,
            orderId: order._id
        });

    } catch (error) {
        console.error('Fehler beim Auto-Pack:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim automatischen Starten'
        });
    }
});

// Hilfsfunktionen
function createBatch(type, name, orders, icon, color) {
    const consolidatedItems = consolidateItems(orders);
    const estimatedTime = Math.ceil(consolidatedItems.reduce((sum, item) =>
        sum + (item.totalQuantity * 0.5), 0
    ));

    return {
        type,
        name,
        icon,
        color,
        orders,
        consolidatedItems,
        estimatedTime
    };
}

function consolidateItems(orders) {
    const itemMap = new Map();

    orders.forEach(order => {
        order.items.forEach(item => {
            const key = item.sku || item.articleNumber;

            if (itemMap.has(key)) {
                const existing = itemMap.get(key);
                existing.totalQuantity += item.quantity;
                existing.orderBreakdown.push({
                    orderId: order._id,
                    deliveryNote: order.deliveryNoteNumber,
                    customer: order.customer?.name,
                    quantity: item.quantity
                });
            } else {
                itemMap.set(key, {
                    sku: item.sku,
                    articleNumber: item.articleNumber,
                    description: item.description || item.productName,
                    location: item.storageLocation || 'Unbekannt',
                    unit: item.unit || 'Stk',
                    totalQuantity: item.quantity,
                    barcode: item.barcode,
                    ean: item.ean,
                    weight: item.weight,
                    orderBreakdown: [{
                        orderId: order._id,
                        deliveryNote: order.deliveryNoteNumber,
                        customer: order.customer?.name,
                        quantity: item.quantity
                    }]
                });
            }
        });
    });

    // Nach Lagerplatz sortieren
    return Array.from(itemMap.values()).sort((a, b) =>
        a.location.localeCompare(b.location)
    );
}

function calculateBatchStats(batch) {
    return {
        type: batch.type,
        orderCount: batch.orders.length,
        itemCount: batch.consolidatedItems.length,
        totalQuantity: batch.consolidatedItems.reduce((sum, item) => sum + item.totalQuantity, 0),
        estimatedTime: batch.estimatedTime,
        uniqueLocations: [...new Set(batch.consolidatedItems.map(i => i.location))].length
    };
}

// API-Endpunkte
router.get('/api/projects', ensureAuthenticated, async (req, res) => {
    try {
        const projects = await Order.getProjectSummary();
        res.json(projects);
    } catch (error) {
        console.error('API-Fehler:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Projekte' });
    }
});

module.exports = router;