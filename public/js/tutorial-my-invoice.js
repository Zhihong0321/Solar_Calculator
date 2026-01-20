function startTutorial() {
    const invoicesContainer = document.getElementById('invoices');
    const firstRow = invoicesContainer ? invoicesContainer.querySelector('div.flex.items-stretch') : null;

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

    const driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: '#000000',
        overlayOpacity: 0.75,
        steps: [
            {
                element: firstRow,
                popover: {
                    title: 'Quotation Card',
                    description: 'Each row represents a unique quotation. You can see the #number, status, and financial progress bar at a glance.',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: firstRow.querySelector('a[href*="invoice-office"]'),
                popover: {
                    title: 'The Office',
                    description: 'Click "Open Office" to see the full document breakdown, update payments, and manage snapshots.',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: firstRow.querySelector('a[href*="invoice-chat"]'),
                popover: {
                    title: 'Communication',
                    description: 'Open the chat to send messages or upload attachments specifically for this quotation.',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: firstRow.querySelector('a[title="View Public Link"]') || firstRow.querySelector('a[href*="share"]'),
                popover: {
                    title: 'Public Sharing',
                    description: 'Click this icon to view the proposal link that you can share with your customer.',
                    side: "left",
                    align: 'start'
                }
            }
        ]
    });

    driverObj.drive();
}