DATE  : Aug 21, 2026
REPO NAME : Solar Calculator v2

- Built conversational quotation prototype (phase 0+1) at /lab/chat, isolated from the production app and reachable by URL only
- Created ChatQuote module (src/modules/ChatQuote) with aiClient, tools, sessionStore, chatService and chatRoutes
- Wired calculate_savings tool to existing solarCalculatorService so every figure comes from the live calculator, never from the language model
- Added fast-path bill parsing that calls the calculator directly without a model round-trip, cutting a bare bill amount from ~4.9s to ~10ms
- Connected chat to the hosted AI router (e-router) using existing AI_ROUTER_* environment variables, defaulting to gpt-5.6-luna
- Implemented SSE streaming turn endpoint with live status updates, plus chip-driven recalculation endpoint that bypasses the model
- Built savings card front end (public/templates/lab_chat.html, public/js/lab-chat.js, public/css/lab-chat.css) with the UIV2 visual language, dark mode and mobile full-bleed layout
- Added battery, max-discount and panel-count adjustment chips that recalculate in place
- Gated the whole prototype behind CHAT_LAB_ENABLED, mounted in eight lines of server.js with no changes to navigation or any existing page
- Documented the new environment flags in .env.example

=====================
