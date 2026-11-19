# ☕ Smart Cafe & Restaurant Management Engine

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-Upstash-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io" />
  <img src="https://img.shields.io/badge/Chapa_Payment-27AE60?style=for-the-badge&logo=cashapp&logoColor=white" alt="Chapa" />
</p>

---

## 🌟 Executive Summary & Value Proposition

**Smart Cafe Engine** is an enterprise-ready, multi-branch hospitality backend engineered to unify every touchpoint of modern restaurant & cafe operations into one high-throughput, real-time platform:

* **🚀 100% Real-Time Synchronized Kitchen, Barista & POS Orchestration**: Instant bi-directional dispatch powered by Socket.IO rooms with zero polling delays.
* **🤖 Voice & AI-Powered Conversational Ordering**: Powered by LLaMA 3.1 & Redis session persistence for seamless conversational food recommendations and natural language orders.
* **🛡️ Dual-Mode Robust Security Architecture**: Seamless JWT authentication supporting both cross-domain `HttpOnly` cookie tokens and `Bearer` headers for native mobile, desktop, and privacy browsers (Brave Shields, Safari ITP).
* **🏢 True Multi-Branch Scalability**: Dynamic branch context routing, localized inventory isolation, and role-based staff isolation.
* **💳 Automated Payment Reconciliation**: Seamless local & global payment provider integration with Chapa (Telebirr, CBE Birr, cards) featuring automated webhook signature verification.

---

## 🗺️ Architectural Ecosystem & Complete System Flow

```mermaid
flowchart TD
    subgraph Clients[" Omnichannel Client Layer "]
        CUST["📱 Customer Web & Mobile (PWA)"]
        POS["💻 Cashier POS Terminal"]
        KDS["🍳 Kitchen & Barista Station (KDS)"]
        ADMIN["📊 Executive & Operations Portal"]
    end

    subgraph Gateway[" API Gateway & Security "]
        CORS["CORS & Origin Guard"]
        AUTH_GUARD["Dual-Mode Auth Guard\n(Bearer Token + HttpOnly Cookies)"]
        SWAGGER["Interactive Swagger Docs (/api/docs)"]
    end

    subgraph CoreEngine[" NestJS Core Micro-Services Engine "]
        AUTH_SRV["Auth & Multi-Role RBAC\n(Customer, Cashier, Waiter, Kitchen, Barista, Admin)"]
        ORDER_SRV["Order Lifecycle & State Machine"]
        INV_SRV["Branch Inventory & Stock Movements"]
        PAY_SRV["Payment Gateway & Webhook Manager (Chapa)"]
        AI_SRV["AI Assistant (LLaMA 3.1 + Redis Memory)"]
    end

    subgraph RealTime[" Real-Time Event Dispatch "]
        SOCKET["Socket.IO Gateway\n(Room-based: kitchen.join, order.join)"]
    end

    subgraph DataPersistence[" Enterprise Storage & Cloud "]
        PRISMA["Prisma ORM & Connection Pooling"]
        NEON["Neon Serverless PostgreSQL (Pooler & Direct)"]
        UPSTASH["Upstash Redis (Session & AI Cache)"]
        CLOUDINARY["Cloudinary CDN (Optimized Media Assets)"]
        RESEND["Resend API (Transactional Notifications)"]
    end

    Clients --> Gateway
    Gateway --> CoreEngine
    CoreEngine <--> SOCKET
    SOCKET --> Clients
    CoreEngine --> DataPersistence
```

---

## 📸 Production API Showcase & Testing

### 1. Interactive Swagger Documentation (`/api/docs`)
Comprehensive, self-documenting RESTful interface with strict OpenAPI specification, bearer token authentication testing, and granular domain grouping.

<p align="center">
  <img src="docs/screenshots/swagger-api-docs.png" width="95%" alt="Smart Cafe Swagger Interactive Documentation" />
</p>

---

### 2. Multi-Role Staff Onboarding & Branch Scoping
Admin-controlled staff creation endpoint automatically generates scoped employee accounts (`cashier`, `waiter`, `kitchen`, `barista`, `manager`) tied directly to assigned physical branch locations.

<p align="center">
  <img src="docs/screenshots/postman-create-staff.png" width="95%" alt="Create Staff Postman Workflow" />
</p>

---

### 3. Dual-Mode High-Speed Authentication
Bulletproof authentication pipeline issuing concurrent `HttpOnly` security cookies and structured Bearer JSON responses to support cross-origin web apps, mobile apps, and privacy browsers without dropped sessions.

<p align="center">
  <img src="docs/screenshots/postman-auth-login.png" width="95%" alt="Authentication & Session Issuance" />
</p>

---

## ⚡ Core Business Modules & Operational Flows

### 1. 🍽️ Smart Order Lifecycle & Real-Time Stations (KDS)
* **Creation**: Customers place orders online or via waiters on floor tablets.
* **Real-time Routing**: Orders immediately emit to station-specific Socket.IO rooms (`kitchen.join`, `barista.join`).
* **State Machine**: Transparent order progression:
  $$\text{PENDING} \longrightarrow \text{CONFIRMED} \longrightarrow \text{PREPARING} \longrightarrow \text{READY} \longrightarrow \text{COMPLETED}$$
* **Instant Customer Tracking**: Customers receive real-time preparation status updates on their mobile tracking page without refreshing.

### 2. 💳 Payment Processing & Automated Settlement
* Integrates directly with **Chapa Payment Gateway** supporting Mobile Money (Telebirr, CBE Birr) and Credit/Debit Cards.
* **Cryptographic Webhook Handlers**: HMAC SHA-256 signature verification validates authentic provider transactions before updating orders to `PAID`.
* Cash payments supported via dedicated Cashier POS confirmation interfaces.

### 3. 📦 Multi-Branch Inventory & Recipe Tracking
* **Automatic Stock Deduction**: As orders transition to preparation, ingredient and product quantities decrement automatically.
* **Low-Stock Alerts**: Alerts notify branch managers when essential cafe supplies drop below reorder thresholds.
* **Movement Auditing**: Complete historical trail of all stock additions, waste write-offs, and transfers between branches.

### 4. 🤖 AI Conversational Barista
* Powered by **LLaMA 3.1** via Groq API.
* Context-aware food and beverage recommendations tailored to dietary preferences, customer mood, and popular branch specials.
* Redis-backed conversation memory preserves chat continuity across customer sessions.

---

## 🛠️ Technology Stack

| Domain | Technology / Service |
| :--- | :--- |
| **Framework** | [NestJS 11](https://nestjs.com/) (Modular Architecture) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **ORM** | [Prisma 7.8](https://www.prisma.io/) with `@prisma/adapter-pg` |
| **Database** | [Neon Serverless PostgreSQL](https://neon.tech/) with pooled connections |
| **In-Memory Store** | [Upstash Redis](https://upstash.com/) (Serverless Key-Value & AI Memory) |
| **Real-Time** | [Socket.IO](https://socket.io/) (Bi-directional WebSocket rooms) |
| **Payment Gateway** | [Chapa API](https://chapa.co/) |
| **AI Inference** | [Groq Cloud](https://groq.com/) (LLaMA 3.1 8B Instant) |
| **Transactional Email** | [Resend](https://resend.com/) |
| **Media & Images** | [Cloudinary](https://cloudinary.com/) Cloud Storage |

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Moges741/smart-cafe-be.git
cd smart-cafe-be
pnpm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:pass@ep-name-pooler.c-12.us-east-1.aws.neon.tech/smartcafe?sslmode=verify-full&connect_timeout=15"
DIRECT_URL="postgresql://user:pass@ep-name.c-12.us-east-1.aws.neon.tech/smartcafe?sslmode=require"

# Server Configuration
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Security & JWT
JWT_SECRET=your_ultra_secure_jwt_secret_key
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your_ultra_secure_refresh_key
JWT_REFRESH_EXPIRES_IN=30d

# Redis (Upstash)
REDIS_URL="rediss://default:token@pumped-seasnail-78505.upstash.io:6379"

# Payment (Chapa)
CHAPA_SECRET_KEY=CHASECK_TEST-xxxx
CHAPA_BASE_URL=https://api.chapa.co/v1
CHAPA_WEBHOOK_SECRET=your_webhook_secret

# AI (Groq)
GROQ_API_KEY=gsk_xxxx
GROQ_MODEL=llama-3.1-8b-instant

# Cloudinary Media
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Email (Resend)
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### 3. Database Migration & Prisma Generation
```bash
# Push schema changes to Neon PostgreSQL
pnpm prisma db push

# Generate type-safe Prisma client
pnpm prisma generate
```

### 4. Run the Engine
```bash
# Start development server with hot-reload
pnpm run start:dev

# Build for production
pnpm run build

# Start production server
pnpm run start:prod
```

### 5. Access Interactive Documentation
Once the server is running, navigate to:
```
http://localhost:4000/api/docs
```

---

## 🔒 Security Best Practices Implemented

* **Strict Input Validation**: Global `ValidationPipe` with automatic whitelist and non-whitelisted property rejection (`forbidNonWhitelisted: true`).
* **Cryptographic Passwords**: Strong `bcrypt` password hashing with dynamic work factors.
* **Role-Based Access Control (RBAC)**: Custom `@Roles()` decorator and `RolesGuard` protecting endpoints based on system privileges.
* **Connection Resilience**: Pool keep-alive timers with cold-start tolerance for Neon Serverless instances.
* **Cross-Site Protection**: Configurable CORS supporting production frontends (`come-mrcafe.vercel.app`), local development origins, and credential transmission.

---

<p align="center">
  <sub>Built with care for modern restaurants, cafes, and hospitality businesses.</sub>
</p>
