# Modish7 — Salon-Exclusive Professional Haircare

Modish7 is a modern, high-performance web platform and partner portal tailored for verified salons and salon professionals.

## Key Features

- **Salon-Exclusive Landing Page**: Immersive full-screen hero video header, dynamic marquee ticker, interactive offer calculator, curated product gallery, and salon partnership enquiry forms.
- **Dedicated Product Catalog**:
  - Shea Butter Moisture Shampoo & Conditioner
  - MKS eco Color Edge Leave-In Detangler
  - Shea Butter Hydrating Conditioner
  - Scalp Pure Anti-Dandruff Professional Shampoo
- **Partner & Customer Authentication**:
  - Secure registration & login for verified salon businesses.
  - JWT session token authentication with bcrypt password encryption.
  - Google OAuth / Sign-in integration flow.
  - Password reset with email verification tokens.
- **Account & Order Management Portal**:
  - Live orders dashboard and real-time status tracking (`PENDING_REVIEW`, `APPROVED`, `SHIPPED`, `DELIVERED`).
  - Salon profile with GSTIN, business verification, and address management.
  - Integrated payment order creation (Razorpay / sandbox simulator) and PDF invoice generation.
- **Backend Architecture**:
  - Zero-dependency Node.js HTTP server + Vite dev middleware.
  - Built-in SQLite database engine (`node:sqlite`) with auto-initialization.
  - Optional PostgreSQL / Supabase migration schema included.

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- npm

### Installation

```bash
npm install
```

### Development Server

Start Vite with built-in API proxy middleware:

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

Build static assets to `dist/`:

```bash
npm run build
```

Run production HTTP server:

```bash
npm start
```

## Environment Variables

Copy `.env.example` to `.env` to configure live credentials:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Web server port | `5173` |
| `JWT_SECRET` | Secret key for signing session tokens | Built-in fallback |
| `RAZORPAY_KEY_ID` | Razorpay API key ID | Sandbox fallback |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | Sandbox fallback |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Optional |

## Project Structure

```text
├── account.html        # Salon partner account portal
├── index.html          # Salon-exclusive landing page
├── login.html          # Partner login page
├── register.html       # Partner onboarding registration page
├── public/             # High-resolution video, images, favicon
├── server/             # API routes, auth, database, payment helpers
├── src/                # Styles (CSS) and frontend client scripts
├── supabase/           # PostgreSQL / Supabase schema migrations
├── vite.config.js      # Vite build configuration and dev middleware
└── server.js           # Production Node.js server
```
