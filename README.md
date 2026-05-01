# Inventory & Catalog Service (v3)

NestJS microservice for the real estate platform — Inventory & Catalog bounded context.
Implements the 6-step acquisition flow + selling status updates + defect reports.

---

## Tech Stack

- **Framework**: NestJS (Node.js)
- **Database**: Supabase (PostgreSQL via TypeORM)
- **Messaging**: Confluent Cloud Kafka (`@confluentinc/kafka-javascript`)
- **Hosting**: Render

---

## Setup

```bash
npm install
# Place client.properties at project root
cp .env.example .env
# Fill in Supabase credentials
npm run start:dev
```

---

## The 6-Step Acquisition Flow

This is the full FE-driven workflow. Each step has a list endpoint (for FE to populate the dropdown) and a write endpoint.

### Step 1 — Property Surveyed (consumed from CEO)

**Inbound**: Kafka topic `ceo.property.surveyed` → status becomes `SURVEYED`

**FE list helper**: `GET /api/v1/properties/surveyed` → returns properties to inspect

### Step 2 — Inspection (Row 2)

**Endpoint**: `POST /api/v1/properties/:id/examination`

```json
{
  "structurePassed": true,
  "waterAndRoofPassed": true,
  "electricityPassed": true,
  "generalConditionPassed": true,
  "inspectedBy": "inspector-001",
  "remarks": "Optional notes"
}
```

→ Publishes `inventory.property.examined` to CEO. Status becomes `EXAMINED`.

### Step 3 — Property Bought (consumed from Payment)

**Inbound**: Kafka topic `payment.propertybought.completed` → status becomes `BOUGHT`

**FE list helper**: `GET /api/v1/properties/bought` → returns properties needing details

### Step 4 — Property Details Form (Row 4)

**Endpoint**: `POST /api/v1/properties`

```json
{
  "propertyId": "PROP-001",
  "propertyName": "Detached House — Sukhumvit 77",
  "unitNumber": "Optional",
  "fullAddress": "77/3 Sukhumvit Rd, Phra Khanong, Bangkok",
  "propertyType": "Detached House",
  "originalPurchasePrice": 5000000,
  "targetSellingPrice": 6500000,
  "propertyCondition": "Good",
  "totalSquareFootage": 250,
  "roomCount": 4,
  "registeredBy": "staff-001"
}
```

→ Publishes `inventory.property.registered` to Sales. Status becomes `REGISTERED`.

**FE list helper for next step**: `GET /api/v1/properties/registered`

### Step 5 — Price Negotiation (Row 5)

**Endpoint**: `PUT /api/v1/properties/:id/price`

```json
{
  "agreedPrice": 6300000,
  "currency": "THB",
  "settledBy": "staff-001"
}
```

→ Publishes `inventory.price.settled` to Marketing & CEO. Status becomes `PRICE_SETTLED`.

**FE list helper for next step**: `GET /api/v1/properties/price-settled`

### Step 6 — Finalize & Submit (Row 6)

**Endpoint**: `POST /api/v1/properties/:id/finalize`

```json
{
  "confirmedBy": "staff-001"
}
```

→ Publishes `inventory.property.finalized` to Sales. Status becomes `AVAILABLE` (ready to sell).

---

## Selling Flow (Kafka inbound)

| Topic | Effect |
|---|---|
| `sale.quotationcreated.complete` | Status → `QUOTATION_IN_PROGRESS` |
| `sale.reservationcreated.complete` | Status → `RESERVED` |
| `sale.booked.complete` | Status → `BOOKED` |
| `payment.secondpayment.completed` | Status → `SOLD` |

---

## Defect Report (Flow 4)

**Endpoint**: `POST /api/v1/defects`

```json
{
  "propertyId": "PROP-001",
  "customerId": "CUST-001",
  "description": "Leak in master bathroom"
}
```

→ Publishes `inventory.defect.received` to Post-Sale.

---

## REST GET Endpoints (Outbound queries)

| Endpoint | Called By |
|---|---|
| `GET /api/v1/properties` | Sales |
| `GET /api/v1/properties?status=AVAILABLE` | Sales |
| `GET /api/v1/properties/:id` | All teams |
| `GET /api/v1/properties/:id/status` | Sales |
| `GET /api/v1/properties/:id/price` | Marketing, CEO |
| `GET /api/v1/properties/:id/inspection` | CEO |
| `GET /api/v1/properties/:id/history` | Post-Sale |

---

## Kafka Topic Summary

### Published (5 topics)

| Topic | Trigger | Consumer(s) |
|---|---|---|
| `inventory.property.examined` | POST examination | CEO |
| `inventory.property.registered` | POST property details | Sales |
| `inventory.price.settled` | PUT price | Marketing, CEO |
| `inventory.property.finalized` | POST finalize | Sales |
| `inventory.defect.received` | POST defect | Post-Sale |

### Consumed (6 topics)

| Topic | Provider | Effect |
|---|---|---|
| `ceo.property.surveyed` | CEO | Status → SURVEYED |
| `payment.propertybought.completed` | Payment | Status → BOUGHT |
| `payment.secondpayment.completed` | Payment | Status → SOLD |
| `sale.quotationcreated.complete` | Sales | Status → QUOTATION_IN_PROGRESS |
| `sale.reservationcreated.complete` | Sales | Status → RESERVED |
| `sale.booked.complete` | Sales | Status → BOOKED |

---

## Property Status Lifecycle

```
SURVEYED              ← from CEO Kafka event
   ↓ POST /examination
EXAMINED              → publishes inventory.property.examined
   ↓ (Payment confirms purchase)
BOUGHT                ← from Payment Kafka event
   ↓ POST /properties
REGISTERED            → publishes inventory.property.registered
   ↓ PUT /price
PRICE_SETTLED         → publishes inventory.price.settled
   ↓ POST /finalize
AVAILABLE             → publishes inventory.property.finalized
   ↓ Sales creates quotation
QUOTATION_IN_PROGRESS ← from Sales Kafka event
   ↓ Sales reservation
RESERVED              ← from Sales Kafka event
   ↓ Sales booking
BOOKED                ← from Sales Kafka event
   ↓ Second payment
SOLD                  ← from Payment Kafka event
```

---

## Outstanding Questions for Other Teams

- Confirm exact topic name from CEO: `ceo.property.surveyed`
- Confirm Marketing's expected topic name (currently `inventory.price.settled`)
- Confirm payload shape from Payment for `payment.secondpayment.completed`
