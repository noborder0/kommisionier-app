// Lieferschein suchen
exports.searchOrder = async (req, res) => {
    try {
        const { deliveryNoteNumber } = req.body;

        // Prüfen, ob der Auftrag bereits in der lokalen DB existiert
        let order = await Order.findOne({ deliveryNoteNumber });

        if (!order) {
            // Bei Xentral API nach Lieferschein suchen
            const xentralDeliveryNote = await xentralService.findDeliveryNoteByNumber(deliveryNoteNumber);

            if (!xentralDeliveryNote) {
                req.flash('error_msg', 'Lieferschein nicht gefunden.');
                return res.redirect('/orders/search');
            }

            // Detaillierte Informationen zum Lieferschein abrufen
            const xentralDeliveryNoteDetails = await xentralService.getDeliveryNoteDetails(xentralDeliveryNote.id);

            // Neuen Auftrag in der lokalen DB anlegen
            order = new Order({
                xentralId: xentralDeliveryNote.id,
                deliveryNoteNumber: xentralDeliveryNote.number || xentralDeliveryNote.deliveryNoteNumber,
                orderNumber: xentralDeliveryNote.orderNumber,

                // Status-Mapping von Xentral zu internem Status
                status: xentralService.mapXentralToInternalStatus(xentralDeliveryNote.status),

                // Datumswerte - Anpassen Sie die Feldnamen nach Bedarf
                createdAt: new Date(xentralDeliveryNote.createdAt || Date.now()),
                deliveryDate: xentralDeliveryNote.deliveryDate ? new Date(xentralDeliveryNote.deliveryDate) : null,

                // Kundeninformationen - Anpassen Sie die Feldnamen entsprechend der API-Antwort
                customer: {
                    id: xentralDeliveryNoteDetails?.customer?.id || '',
                    name: xentralDeliveryNoteDetails?.customer?.name || '',
                    street: xentralDeliveryNoteDetails?.customer?.street || '',
                    zip: xentralDeliveryNoteDetails?.customer?.zipCode || '',
                    city: xentralDeliveryNoteDetails?.customer?.city || '',
                    country: xentralDeliveryNoteDetails?.customer?.country || '',
                    email: xentralDeliveryNoteDetails?.customer?.email || '',
                    phone: xentralDeliveryNoteDetails?.customer?.phone || ''
                },

                // Auftragspositionen/Lieferscheinpositionen
                items: (xentralDeliveryNoteDetails?.items || []).map(item => ({
                    articleId: item.articleId || item.id,
                    articleNumber: item.articleNumber || item.number,
                    description: item.description || item.name,
                    quantity: item.quantity,
                    unit: item.unit || 'Stk',
                    price: item.price,
                    position: item.position || 0,
                    warehouseId: item.warehouseId,
                    batch: item.batch || '',
                    expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
                })),

                // Zuordnung zum aktuellen Benutzer
                assignedTo: req.user._id,
                updatedBy: req.user._id
            });

            await order.save();
        }

        res.redirect(`/orders/${order._id}`);
    } catch (error) {
        console.error('Fehler bei der Auftragssuche:', error);
        req.flash('error_msg', `Fehler bei der Auftragssuche: ${error.message}`);
        res.redirect('/orders/search');
    }
};

// Alle Aufträge von Xentral laden oder aktualisieren
exports.syncAllOrders = async (req, res) => {
    try {
        // Alle Lieferscheine von Xentral abrufen
        const xentralResponse = await xentralService.listDeliveryNotes({ limit: 100 }); // Max. 100 Lieferscheine
        const xentralDeliveryNotes = xentralResponse.data || [];

        let importedCount = 0;
        let updatedCount = 0;

        // Jeden Lieferschein verarbeiten
        for (const xentralDeliveryNote of xentralDeliveryNotes) {
            // Prüfen, ob der Auftrag bereits existiert
            let order = await Order.findOne({ deliveryNoteNumber: xentralDeliveryNote.number || xentralDeliveryNote.deliveryNoteNumber });

            if (order) {
                // Auftrag aktualisieren
                order.status = xentralService.mapXentralToInternalStatus(xentralDeliveryNote.status);
                order.updatedAt = new Date();
                order.updatedBy = req.user._id;

                await order.save();
                updatedCount++;
            } else {
                try {
                    // Detaillierte Informationen abrufen und neuen Auftrag anlegen
                    const xentralDeliveryNoteDetails = await xentralService.getDeliveryNoteDetails(xentralDeliveryNote.id);

                    order = new Order({
                        xentralId: xentralDeliveryNote.id,
                        deliveryNoteNumber: xentralDeliveryNote.number || xentralDeliveryNote.deliveryNoteNumber,
                        orderNumber: xentralDeliveryNote.orderNumber,
                        status: xentralService.mapXentralToInternalStatus(xentralDeliveryNote.status),
                        createdAt: new Date(xentralDeliveryNote.createdAt || Date.now()),
                        deliveryDate: xentralDeliveryNote.deliveryDate ? new Date(xentralDeliveryNote.deliveryDate) : null,

                        // Kundeninformationen - Anpassen Sie die Feldnamen nach Bedarf
                        customer: {
                            id: xentralDeliveryNoteDetails?.customer?.id || '',
                            name: xentralDeliveryNoteDetails?.customer?.name || '',
                            street: xentralDeliveryNoteDetails?.customer?.street || '',
                            zip: xentralDeliveryNoteDetails?.customer?.zipCode || '',
                            city: xentralDeliveryNoteDetails?.customer?.city || '',
                            country: xentralDeliveryNoteDetails?.customer?.country || '',
                            email: xentralDeliveryNoteDetails?.customer?.email || '',
                            phone: xentralDeliveryNoteDetails?.customer?.phone || ''
                        },

                        // Auftragspositionen
                        items: (xentralDeliveryNoteDetails?.items || []).map(item => ({
                            articleId: item.articleId || item.id,
                            articleNumber: item.articleNumber || item.number,
                            description: item.description || item.name,
                            quantity: item.quantity,
                            unit: item.unit || 'Stk',
                            price: item.price,
                            position: item.position || 0,
                            warehouseId: item.warehouseId,
                            batch: item.batch || '',
                            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
                        })),

                        assignedTo: req.user._id,
                        updatedBy: req.user._id
                    });

                    await order.save();
                    importedCount++;
                } catch (detailError) {
                    console.error(`Fehler beim Abrufen der Details für Lieferschein ${xentralDeliveryNote.id}:`, detailError);
                    // Fahre mit dem nächsten Lieferschein fort
                    continue;
                }
            }
        }

        req.flash('success_msg', `Synchronisierung abgeschlossen. ${importedCount} neue Lieferscheine importiert, ${updatedCount} aktualisiert.`);
        res.redirect('/orders');
    } catch (error) {
        console.error('Fehler bei der Synchronisierung der Aufträge:', error);
        req.flash('error_msg', `Fehler bei der Synchronisierung: ${error.message}`);
        res.redirect('/orders');
    }
};