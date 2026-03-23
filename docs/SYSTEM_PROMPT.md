# RydeWorks — System Prompt (AI Context Document)

This document describes the RydeWorks platform in precise technical and operational terms. Use it to ground AI-assisted development, debugging, and feature work.

---

## What RydeWorks Is

RydeWorks is a multi-tenant SaaS dispatch platform for community transportation programs. It is built for organizations like PERC (People Empowering & Restoring Communities) that operate van fleets to move low-income or program-enrolled riders to work, medical appointments, and other destinations.

The platform handles:
- Trip booking and dispatch management
- Driver assignment and real-time status tracking
- Rider management and payment collection
- Grant tracking and operational reporting
- Partner organization van bookings
- SMS notifications to riders

The current production tenant is PERC, operating the Zak Transportation Initiative in the St. Petersburg / Pinellas County, FL area.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 18 |
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| SMS | Twilio |
| Email | Nodemailer (Gmail SMTP via App Password) |
| Payments | Stripe |
| Geocoding | Nominatim (OpenStreetMap) |
| Hosting | Railway |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Domain | rydeworks.com (landing), app.rydeworks.com (dispatch app) |

---

## Project Structure

```
/server
  index.js              — Express app, middleware, route mounting, seed, billing scheduler
  billing.js            — Weekly Friday Stripe billing runner; free-ride code expiry
  sms.js                — Twilio SMS helper (sendSms)
  seed-fleet.js         — One-time fleet seed utility
  update-fare-zones.js  — One-time fare zone migration utility
  /middleware
    auth.js             — authenticate, requireRole, superAdminOnly, sameOrganization
  /models
    Organization.js     — Multi-tenant org (home bases, fare zones, partner rates, branding)
    User.js             — Staff accounts (super_admin / admin / dispatcher / driver roles)
    Rider.js            — Passengers (separate from User accounts)
    Trip.js             — Trips with multi-stop schema
    Vehicle.js          — Fleet vehicles
    Grant.js            — Grant funding sources with budget tracking
    Partner.js          — Partner organizations (van bookings)
    AccessCode.js       — Registration codes and free-ride coupons
    RiderSubscription.js— Self-pay rider billing subscriptions (Stripe, ACH, Venmo, etc.)
  /routes
    auth.js             — Login, logout, password reset, /me
    admin.js            — User/vehicle/org/grant/partner management (admin + dispatcher)
    trips.js            — Trip CRUD, rider CRUD, fare calculation, status updates, SMS
    reports.js          — Summary and CSV export reports (admin + dispatcher)
    superAdmin.js       — Cross-org management (super_admin only)
    book.js             — Public self-booking flow, Stripe subscription setup

/client/public
  app.html              — Main dispatch app shell (served to all non-special routes)
  driver.html           — Driver view (trip status updates)
  book.html             — Public rider self-booking page
  landing.html          — Marketing landing page (rydeworks.com and /enroll)
  login.html            — Login page
  super-admin.html      — Super-admin dashboard
  reset-password.html   — Password reset page
  redirect.html         — Smart redirect for app.rydeworks.com root
  privacy.html          — Privacy policy
  /js                   — Client-side JavaScript modules
  /css                  — Stylesheets
  /img                  — Images

/docs
  SYSTEM_PROMPT.md      — This file
  USER_MANUAL.md        — End-user operational guide
```

---

## Routing Logic (server/index.js)

| Path | Behavior |
|---|---|
| `GET /` on rydeworks.com | Serves landing.html |
| `GET /` on app.rydeworks.com | Serves redirect.html |
| `GET /enroll` | Serves landing.html |
| `GET /book` | Serves book.html (self-booking, any subdomain) |
| `GET /privacy` | Serves privacy.html |
| `GET /reset-password` | Serves reset-password.html |
| `GET /*` (catch-all) | Serves app.html (dispatch app) |
| `POST /api/demo-request` | Logs demo requests; emails Rich Alvarez |
| `GET /api/health` | Health check |
| `GET /api/config` | Returns Mapbox token for client |

CORS allows `*.rydeworks.com` and localhost only.
Rate limit: 200 requests per 15-minute window per IP.

---

## Authentication & Authorization

All API routes (except `/api/book/*`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/demo-request`, `/api/health`, `/api/config`) require a Bearer JWT.

JWT expiry: 7 days (configurable via `JWT_EXPIRES_IN`).

### Roles (stored as an array on User)

| Role | Access |
|---|---|
| `super_admin` | All orgs, all routes, bypasses org scoping |
| `admin` | Full org management (users, vehicles, org settings, grants, partners) |
| `dispatcher` | Trip and rider management, reports |
| `driver` | Own assigned trips only (read + status updates) |

A user can hold multiple roles simultaneously. `super_admin` implicitly passes all role checks.

---

## Data Models

### Organization
- `slug` — unique URL identifier (e.g. `perc`)
- `homeBases[]` — named van dispatch locations with lat/lng
- `fareZones[]` — distance-banded flat fare rules (minMiles/maxMiles, roundTripFare, oneWayFare)
- `partnerRates[]` — block pricing for partner van bookings (half-day / full-day by zone)
- `selfPayConfig` — Square, Venmo, Cash App payment handles
- `riderSequence` — atomic counter for sequential rider IDs (e.g. PER-0001)
- `plan` — SaaS tier: trial / basic / professional / enterprise
- `settings.timezone` — default America/New_York
- `settings.smsNotifications` + `settings.twilioPhone` — org-level SMS toggle

### User (staff accounts)
- `roles[]` — super_admin / admin / dispatcher / driver
- `organization` — org reference (null for super_admin)
- `driverInfo` — license, assigned vehicle, availability, location, stats
- `mustChangePassword` — forces password change on first login
- `resetPasswordToken` / `resetPasswordExpires` — 1-hour reset window
- Password is bcrypt-hashed (salt rounds: 12) on save

### Rider (passengers — not User accounts)
- `riderId` — sequential human-readable ID: `{PREFIX}-{NNNN}` (e.g. `RWK-0001`)
- `organization` — org reference
- `homeAddress` + `homeAddressLat/Lng` — stored for fare calculation
- `commonDestinations[]` — saved addresses (label, address, lat, lng)
- `freeRideCode` — reference to AccessCode
- `notes` — driver-visible accessibility or preference notes
- `anonymousId` — legacy field (kept for grant reporting; no longer set on new riders)

### Trip
- `tripNumber` — auto-generated: `RWK-{YYYYMMDD}-{4CHAR}` (e.g. `RWK-20260323-A1B2`)
- `organization`, `driver`, `vehicle`, `homeBase`
- `tripDate` — date of service
- `stops[]` — ordered stop list (type: pickup or dropoff per rider)
  - Each stop: riderId, riderName, riderPhone, address, lat/lng, scheduledTime, appointmentTime, status
  - Stop statuses: `pending → en_route → arrived → aboard → completed / no_show / canceled`
- `status` — overall: `scheduled / in_progress / completed / canceled`
- `payment` — type (grant/self_pay/partner/free_ride/none), fare, isPaid, Stripe payment ID
- `optimizedRoute` — encoded polyline + waypoints from route optimization
- `driverLog` — start/end mileage, inspection, times
- `notes` — dispatcher notes

### Grant
- `totalAmount / usedAmount / remainingAmount` — budget tracking
- `startDate / endDate` — grant period
- `reportingNotes` — compliance notes

### Partner
- Organizations that book vans (block pricing)
- `billingRate`, `invoiceCycle` (per_trip / weekly / monthly)

### AccessCode
- `type` — `registration` (staff invite) or `free_ride` (rider coupon)
- Code format: `PERC-{6CHARS}` (registration) or `FREE-{6CHARS}` (free ride)
- Free ride codes expire 30 days from creation
- Tracks tripsAllowed, tripsUsed, fareValue used (for grant reporting)

### RiderSubscription (self-pay billing)
- `paymentMethodType` — card / ach / venmo / cashapp / payroll_deduction / phone
- Stripe: stripeCustomerId, stripePaymentMethodId
- `freeRideCode / codeExpiresAt / freeRideUsed` — free ride period tracking
- `weeklyBillingEnabled` — toggles auto-charge on Friday billing
- `payments[]` — full payment history with type (initial / replenishment / weekly / cancellation_fee / manual)
- `status` — active / cancelled / suspended / pending

---

## Fare Zone Logic

Zones are calculated using the Haversine formula (straight-line distance in miles) from the trip's `homeBase` lat/lng to the destination.

### PERC Fare Zones (current)

| Zone | Distance | Round-Trip | One-Way |
|---|---|---|---|
| Zone 1 | 0–6 mi | $18 | $9 |
| Zone 2 | 6–12 mi | $20 | $10 |
| Zone 3 | 12–18 mi | $22 | $11 |
| Zone 4 | >18 mi / north of Ulmerton | $25 | $13 |
| Out-of-county | Case-by-case | $32–$40 | $16–$20 |

### PERC Partner Rates (block booking)

| Block | Zone 1-2 | Zone 3 | Zone 4 | Out-of-county |
|---|---|---|---|---|
| Half-day (4 hr) | $320 | $360 | $420 | $480–$560 |
| Full-day (8 hr) | $600 | $680 | $780 | $880–$1,040 |

### PERC Home Bases
- PERC St. Pete: 1523 16th St S, St. Petersburg, FL 33705 (27.7542, -82.6537)
- PERC Clearwater: 12810 US Hwy 19 N, Clearwater, FL 33764 (27.8924, -82.7265)

---

## API Route Summary

### Auth (`/api/auth`)
- `POST /login` — returns JWT + user object
- `GET /me` — returns current user (authenticated)
- `POST /set-first-password` — first-login forced password change
- `POST /change-password` — authenticated password change
- `POST /forgot-password` — sends reset email (or SMS fallback)
- `POST /reset-password` — validates token, sets new password
- `POST /logout` — logs out (client drops token)

### Admin (`/api/admin`) — requires admin or dispatcher
- `GET /users` — list org users (add `?all=true` for inactive)
- `POST /users` — create staff user (auto-generates email + temp password)
- `PUT /users/:id` — update user
- `GET /vehicles` — list vehicles
- `POST /vehicles` — create vehicle
- `PUT /vehicles/:id` — update vehicle
- Org settings, grant, partner, and access code management endpoints

### Trips (`/api/trips`) — authenticated
- `GET /riders` — search riders (admin/dispatcher)
- `POST /riders` — create rider (admin/dispatcher); auto-assigns sequential riderId
- `PUT /riders/:id` — update rider
- `GET /` — list trips (filtered by date, driver, status)
- `POST /` — create trip
- `PUT /:id` — update trip (assignment, status, payment, stops)
- `POST /:id/stops/:stopIndex/status` — update individual stop status; triggers SMS if rider boarding/arrived

### Reports (`/api/reports`) — requires admin or dispatcher
- `GET /summary` — operational summary for date range
- `GET /export` — CSV export

### Super Admin (`/api/super-admin`) — super_admin only
- `GET /orgs` — list all organizations
- `POST /orgs` — create new org (new SaaS customer)
- `PUT /orgs/:id` — update org
- `POST /orgs/:id/suspend` — suspend org + deactivate all users

### Book (`/api/book`) — public (no auth required)
- `GET /org-config` — org branding for booking page (resolved by subdomain or `?org=`)
- `GET /stripe-key` — Stripe publishable key
- Subscription setup, payment intent, and booking endpoints

---

## Background Jobs

### Weekly Billing (every Friday at 6 AM Eastern)
- Checked via `setInterval` every 5 minutes
- Finds all `RiderSubscription` records with `status: active`, `weeklyBillingEnabled: true`, `freeRideUsed: true`, and a valid Stripe payment method
- Sums completed trip fares for each rider for the past 7 days
- Charges via Stripe PaymentIntent
- Records payment in subscription history

### Free Ride Code Expiry (every 5-minute interval)
- Marks AccessCodes as `expired` if `freeRide.expiresAt` has passed
- Idempotent — safe to run repeatedly

---

## SMS Notifications

Sent via Twilio. Triggered on trip stop status changes (e.g., driver arrived at pickup). Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` environment variables.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | JWT expiry (default: 7d) |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (production hides error details) |
| `SUPER_ADMIN_EMAIL` | Super admin email (seed) |
| `SUPER_ADMIN_PASSWORD` | Super admin password (seed) |
| `NOTIFY_EMAIL_USER` | Gmail address for outbound email |
| `NOTIFY_EMAIL_PASS` | Gmail App Password |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sending number |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (sent to client) |
| `MAPBOX_TOKEN` | Mapbox token (sent to client via /api/config) |

---

## Seed Data (auto-created on first startup)

- **PERC organization** with fare zones, partner rates, and two home bases
- **Van 1** (PERC St. Pete base) and **Van 2** (PERC Clearwater base) — Chevrolet Express, capacity 7
- **Super admin** (Rich Alvarez) — created only if `SUPER_ADMIN_PASSWORD` is set
- **Initial team**: Matt Lopez (admin/dispatcher/driver), Angela Tutko (driver/dispatcher), Gary Webb (driver), Bruce Street (driver) — default password `ChangeMe123!`

---

## Branding

- Platform brand: **RydeWorks**
- Current client app label: Zak Transportation Initiative (PERC tenant)
- Primary background: midnight navy (`#0A1628`)
- Accent: teal (`#00D4C8`)
- SaaS model: platform-branded shell; client branding layered per tenant

---

## Key Business Rules

1. Riders are tracked separately from staff User accounts. A rider profile is a passenger record, not a login.
2. Sequential rider IDs (`RWK-0001`) are assigned atomically using `Organization.riderSequence` (MongoDB `$inc`).
3. Trip numbers are auto-generated on save: `RWK-{YYYYMMDD}-{4CHAR UUID fragment}`.
4. Fare zones use straight-line (Haversine) distance from the home base for the trip, not driving distance.
5. Free ride codes are valid for 30 days and are stored on the rider profile, not re-entered per trip.
6. Weekly billing only auto-charges riders whose free ride period has ended (`freeRideUsed: true`).
7. Passwords are bcrypt-hashed with 12 salt rounds. Plain-text passwords are never stored.
8. All date filtering uses Eastern time (America/New_York), with DST offset detection.
9. CORS is restricted to `*.rydeworks.com` and localhost.
10. Super admin (`super_admin` role) bypasses all org-scoping and role checks.

---

## UI / Frontend Notes

### Time Inputs (Schedule Trip form)
- All time fields (appointment time, pickup time, return pickup time) use `type="text"` inputs in **12-hour format** (H:MM) with an adjacent AM/PM toggle button.
- Helper functions: `getTime24h(inputId, amPmId)` converts display → 24h HH:MM for server submission; `setTime12h(inputId, amPmId, time24h)` sets display from a 24h string.
- `onApptTimeChange(idx)` only auto-calculates pickup time when `distMiles > 0` (i.e., after a destination has been geocoded and fare calculated). It does **not** fire when no destination is entered.
- Edit-trip modal stop times and recurring-trip form still use native `<input type="time">`.

### User Management
- Staff accounts are created by admins with auto-generated email (`firstnamelastinitial[@rydeworks.com]` or org subdomain) and a temp password in the format `Ride-NNNN-Work`.
- `mustChangePassword: true` is set on creation and after admin-triggered reset; forces redirect to `/reset-password.html?firstLogin=1` on next login.
- `POST /api/auth/set-first-password` handles first-login password change (no current password required, uses JWT auth).
- `POST /api/admin/users/:id/reset-password` generates a new temp password and sets `mustChangePassword: true`.

### Reports
- **Operational report**: includes on-time pickup and drop-off percentages (internal use).
- **Grant report**: does NOT include on-time percentages (kept internal); shows total trips, unique riders, miles, potential revenue, grant-funded vs free-ride trip breakdown, zip breakdown, and weekly chart.

### Landing Page (`landing.html`)
- Logo in nav and footer uses `/img/rydeworks-mark.svg` (the same double-chevron SVG used in the dispatch app sidebar).
- "RydeWorks" brand name displays with a ™ superscript wherever the logo appears.
- "Rider Portal" footer link opens `/book` in a new browser tab (`target="_blank"`).

---

## Change Log (recent)

| Date | Change |
|---|---|
| 2026-03-23 | Added AM/PM toggle to all schedule-trip time inputs; blocked pickup-time auto-calc when no destination set |
| 2026-03-23 | Removed on-time % from grant report (kept on ops report only) |
| 2026-03-23 | Landing page: switched logo to rydeworks-mark.svg, added ™ mark, rider portal opens new tab |
| 2026-03-23 | User management: auto-generated emails + temp passwords, mustChangePassword flow |
| 2026-03-23 | Dispatcher app: vehicle home-base dropdown, destination autofill, free-ride auto-detect |
| 2026-03-23 | Reports: fixed populate path (stops.riderId), grant report includes free-ride trips + breakdowns |
