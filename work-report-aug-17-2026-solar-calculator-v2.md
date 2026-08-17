DATE  : Aug 17, 2026
REPO NAME : Solar Calculator v2

- Streamlined all-in-one in-form video attachment in Submit Support Ticket form (/submit-support-ticket)
- Executed PostgreSQL schema migration on prod_main adding video_url (text) column to support_ticket table
- Configured automated in-form video upload via Google Drive Service Account with high-speed R2 fallback
- Added support for recording and updating video_url in supportTicketService and supportTicketController
- Built integrated in-modal video player for Admin Support Dashboard (/support-tickets) with Google Drive preview iframe and direct video playback
- Upgraded My Tickets modal with embedded video viewer and full-screen external links
- Lifted payment proof upload file size limit from 2MB to 8MB in Submit Payment form (/submit-payment)
- Enhanced client-side image optimizer (image_optimizer.js) with 2.5K (2560px) max resolution, step-down downsampling for text sharpness, and orientation auto-correction

=====================
