# RydeWorks Implementation Blueprint

## Goal for this week
Ship a stable, demo-ready RydeWorks build that can be shown to PERC leadership by Friday.

## Must-have demo flow
1. Sign in to RydeWorks Dispatch Center.
2. Book a trip for today.
3. Confirm the trip appears on the dispatcher dashboard.
4. Confirm the assigned driver sees the trip in the driver view.
5. Run the trip through status changes: En Route → Arrived → Rider Boarded → Dropped Off → Complete.
6. Verify the passenger receives the arrival text.
7. Export a report.

## Phase 1: Stabilize now
- Trip creation must save the correct local date, org, driver, and trip status.
- Dispatcher dashboard must show all trips, including unassigned trips, with assigned driver shown when present.
- Driver view must show only trips assigned to the logged-in driver.
- Reports must export without failing.
- Mobile UX fixes: replace slippery time picker, add back buttons, keep map return path obvious.

## Phase 2: Rider payment foundation
### Rider states
- sponsored_active
- sponsored_expiring
- self_pay_pending_setup
- self_pay_active
- self_pay_canceled

### Free ride logic
- Free ride code is remembered on the rider profile, not re-entered each trip.
- Valid for 30 days from issue date.
- Auto-applies to eligible bookings during that period.
- Seven-day and three-day expiration reminders should be sent.

### Ride Wallet logic
- Initial wallet funding after sponsorship ends: $100.
- Auto-reload threshold: below $20.
- Auto-reload amount: $100.
- Wallet deposits are non-refundable but remain usable for rides.
- Rider can cancel future reloads at any time.

## Phase 3: Dispatch automation
- Keep manual assignment as the default in the near term.
- Add recommended driver suggestions based on base, current route position, and availability.
- Later add route conflict warnings and suggested alternate pickup windows.

## Core data model
### Vehicles
- name / unit number
- assigned vehicle base
- capacity
- current driver
- current location
- availability status

### Riders
- rider ID
- contact info
- accessibility notes
- saved addresses
- free ride status and dates
- wallet balance
- payment method status

### Trips
- rider
- organization
- assigned driver
- assigned vehicle
- pickup and dropoff
- appointment time
- trip status
- fare zone and fare amount
- payment mode

## Branding standard
Use RydeWorks as the master platform brand. Client-specific branding should be layered later per tenant.

### Current brand direction
- Primary background: midnight navy
- Accent: teal
- Product label: RydeWorks
- Master shell: platform-branded, not PERC-branded

## Friday demo checklist
- [ ] GitHub updated with latest patch
- [ ] Railway deploy completed successfully
- [ ] Login tested
- [ ] Trip created and visible in dispatch
- [ ] Trip visible in driver app
- [ ] Arrival SMS tested
- [ ] Report export tested
- [ ] Booking page shows dispatch phone number
