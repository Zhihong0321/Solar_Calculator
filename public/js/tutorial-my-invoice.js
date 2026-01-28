function startTutorial() {
    // Try to find the first invoice row in either the follow-up or normal list
    // We look for div.flex which is the top-level container of each invoice item
    const firstRow = document.querySelector('#followUpInvoices > div.flex, #invoices > div.flex');

    if (!firstRow) {
        // If no invoices, maybe highlight the "New Quotation" button instead
        const newQuotationBtn = document.querySelector('a[href="/select-package"]');
        if (newQuotationBtn) {
            const driver = window.driver.js.driver;
            const driverObj = driver({
                steps: [
                    {
                        element: newQuotationBtn,
                        popover: {
                            title: 'No Quotations Found',
                            description: 'It looks like you don\'t have any quotations yet. Click here to create your first one!',
                            side: "top",
                            align: 'center'
                        }
                    }
                ]
            });
            driverObj.drive();
            return;
        }
        alert("Please create at least one quotation to see the full tutorial.");
        return;
    }

    const driver = window.driver.js.driver;
    const steps = [];

    // Step 1: The entire card
    steps.push({
        element: firstRow,
        popover: {
            title: 'Quotation Card',
            description: 'Each row represents a unique quotation. You can see the #number, status, and financial progress bar at a glance.',
            side: "bottom",
            align: 'start'
        }
    });

    // Step 2: Open Office button
    const officeBtn = firstRow.querySelector('a[href*="invoice-office"]');
    if (officeBtn) {
        steps.push({
            element: officeBtn,
            popover: {
                title: 'The Office',
                description: 'Click "Open Office" to see the full document breakdown, update payments, and manage snapshots.',
                side: "bottom",
                align: 'start'
            }
        });
    }

    // Step 3: Chat button
    const chatBtn = firstRow.querySelector('a[href*="invoice-chat"]');
    if (chatBtn) {
        steps.push({
            element: chatBtn,
            popover: {
                title: 'Communication',
                description: 'Open the chat to send messages or upload attachments specifically for this quotation.',
                side: "bottom",
                align: 'start'
            }
        });
    }

    // Step 4: Share button
    const shareBtn = firstRow.querySelector('a[title="View Public Link"]') || firstRow.querySelector('a[href*="share"]');
    if (shareBtn) {
        steps.push({
            element: shareBtn,
            popover: {
                title: 'Public Sharing',
                description: 'Click this icon to view the proposal link that you can share with your customer.',
                side: "left",
                align: 'start'
            }
        });
    }

    const driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: '#000000',
        overlayOpacity: 0.75,
        steps: steps
    });

    driverObj.drive();
}