# RydeWorks User Manual

**Platform:** RydeWorks Dispatch Center
**Current Deployment:** Zak Transportation Initiative — PERC
**URL:** app.rydeworks.com

---

## Table of Contents

1. [Roles and Who Uses What](#roles-and-who-uses-what)
2. [Signing In](#signing-in)
3. [Dispatcher Dashboard](#dispatcher-dashboard)
4. [Booking a Trip](#booking-a-trip)
5. [Managing Riders](#managing-riders)
6. [Assigning a Driver and Vehicle](#assigning-a-driver-and-vehicle)
7. [Running a Trip (Driver View)](#running-a-trip-driver-view)
8. [Trip Status Flow](#trip-status-flow)
9. [SMS Notifications](#sms-notifications)
10. [Reports and Exports](#reports-and-exports)
11. [Managing Your Team](#managing-your-team)
12. [Managing Vehicles](#managing-vehicles)
13. [Grants and Partners](#grants-and-partners)
14. [Access Codes and Free Ride Coupons](#access-codes-and-free-ride-coupons)
15. [Rider Self-Booking Page](#rider-self-booking-page)
16. [Fare Zones and Pricing](#fare-zones-and-pricing)
17. [Password and Account Management](#password-and-account-management)
18. [Super Admin Panel](#super-admin-panel)
19. [Troubleshooting](#troubleshooting)

---

## Roles and Who Uses What

RydeWorks has four roles. A person can hold more than one.

| Role | What they can do |
|---|---|
| **Super Admin** | Everything — manages all organizations on the platform |
| **Admin** | Manages the org: users, vehicles, org settings, grants, partners, access codes |
| **Dispatcher** | Books trips, assigns drivers, views all trips, runs reports |
| **Driver** | Sees only their assigned trips; updates stop statuses on the road |

Most PERC dispatchers hold both the Dispatcher and Driver roles. Matt Lopez also holds Admin.

---

## Signing In

1. Go to **app.rydeworks.com**
2. Enter your email and password.
3. Click **Sign In**.

If this is your first time signing in with a temporary password, you will be prompted to set a new password immediately. Your new password must be at least 8 characters.

If you forget your password, click **Forgot Password** on the login page. A reset link will be sent to your email. The link expires in 1 hour.

---

## Dispatcher Dashboard

After signing in, dispatchers and admins land on the main dispatch dashboard. It shows:

- **All trips for the selected date** — including unassigned trips
- **Trip number** — format `RWK-YYYYMMDD-XXXX`
- **Rider name(s)** and pickup/dropoff addresses
- **Assigned driver and vehicle** (or blank if unassigned)
- **Trip status** — Scheduled, In Progress, Completed, Canceled
- **Payment type** — Grant, Self Pay, Partner, Free Ride, or None

Use the **date selector** to navigate between days. The dashboard defaults to today.

Click any trip row to open the trip detail panel, where you can update assignment, status, payment, and notes.

---

## Booking a Trip

1. From the dashboard, click **New Trip** (or the + button).
2. **Select the trip date.**
3. **Select or search for a rider.** Type a name, phone number, or rider ID to search existing riders. If the rider is new, click **Add New Rider** to create their profile first.
4. **Enter the pickup address.** Start typing — the address field will suggest matches. Confirm the address with the correct lat/lng so the fare zone can be calculated.
5. **Enter the dropoff address.** Same as above.
6. **Set the appointment time** — when the rider needs to arrive at their destination.
7. **Set the scheduled pickup time** — when the driver should pick up the rider.
8. **Select the home base** — PERC St. Pete or PERC Clearwater, depending on which van is being dispatched.
9. **Select payment type** — Grant, Self Pay, Partner, Free Ride, or None. If Grant, select the grant. If Partner, select the partner organization.
10. The **fare zone and estimated fare** will calculate automatically based on distance from the home base.
11. **Assign a driver and vehicle** (or leave blank to assign later).
12. Add any **dispatcher notes** if needed.
13. Click **Save Trip.**

The trip appears immediately on the dashboard. The assigned driver can see it in their driver view.

---

## Managing Riders

### Finding an Existing Rider
In the trip booking form or from the Riders section, search by:
- First or last name
- Phone number
- Rider ID (e.g. `RWK-0001`)

### Adding a New Rider
1. Click **Add New Rider** (available from the trip booking form or the Riders management page).
2. Enter first name, last name, phone number, and email (email is optional).
3. Enter their **home address** — this saves time on future bookings.
4. Add any **saved destinations** (label them: Work, Doctor, etc.) for quick entry later.
5. Add **driver notes** — accessibility needs, preferred pickup instructions, etc.
6. Click **Save.**

The rider is assigned a sequential ID (e.g. `RWK-0001`) automatically.

### Editing a Rider
Open the rider profile from the Riders section or from a trip. You can update any field and save. Changes apply to future trips; past trip records are not affected.

---

## Assigning a Driver and Vehicle

Assignments can be made during trip creation or after the fact from the trip detail panel.

1. Open the trip.
2. Click the **Driver** dropdown and select from active drivers.
3. Click the **Vehicle** dropdown and select from active vehicles.
4. Save the trip.

The driver will see the trip appear in their driver view immediately.

If no driver is assigned yet, the trip shows as **Unassigned** on the dashboard. Unassigned trips are visible to all dispatchers.

---

## Running a Trip (Driver View)

Drivers access the app at **app.rydeworks.com** using the same login. After signing in, drivers see only their assigned trips.

### Driver Trip View Shows:
- Today's trips in order by scheduled pickup time
- Each stop: rider name, address, scheduled time
- Current stop status
- Navigation button (opens the address in Google Maps or Apple Maps)

### Updating a Stop Status
Tap a stop to open it. Then tap the appropriate status button:

- **En Route** — driver is heading to the stop
- **Arrived** — driver has arrived at the pickup location
- **Rider Boarded** — rider is in the vehicle (triggers SMS to rider if configured)
- **Dropped Off** — rider has been dropped at destination
- **No Show** — rider was not present at pickup
- **Cancel Stop** — stop is being skipped

When all stops are completed, the overall trip status updates to **Completed** automatically.

---

## Trip Status Flow

### Overall Trip Statuses
```
Scheduled → In Progress → Completed
                        → Canceled
```

### Individual Stop Statuses
```
Pending → En Route → Arrived → Aboard → Completed
                             → No Show
                             → Canceled
```

A trip moves to **In Progress** when the driver marks the first stop as En Route. It moves to **Completed** when all stops are resolved (completed, no_show, or canceled).

---

## SMS Notifications

When a driver marks a pickup stop as **Arrived**, the system automatically sends an SMS to the rider's phone number if:
- The organization has SMS notifications enabled
- Twilio credentials are configured
- The rider has a phone number on file

The message tells the rider the driver has arrived and is waiting.

No action is required from the dispatcher or driver — the SMS sends automatically on the status change.

---

## Reports and Exports

### Viewing the Summary Report
1. Go to **Reports** in the navigation.
2. Select a **date range** (defaults to the current month).
3. The summary shows:
   - Total trips
   - Trips by status (completed, canceled, etc.)
   - Riders served
   - Fares collected by payment type
   - Grant utilization

### Exporting to CSV
1. Set your date range in the Reports section.
2. Click **Export CSV**.
3. The file downloads to your browser. Open it in Excel or Google Sheets.

The CSV contains one row per trip with: trip number, date, rider ID, pickup address, dropoff address, driver, vehicle, status, payment type, grant name, estimated fare, actual fare, and payment status.

---

## Managing Your Team

Admins can add, edit, and deactivate staff accounts.

### Adding a Team Member
1. Go to **Team** (or **Users**) in the admin section.
2. Click **Add User**.
3. Enter first name, last name, and optionally a phone number.
4. Select the email domain and the system will suggest an email (e.g. `mattl@perc.org`). You can override it.
5. Assign roles: Admin, Dispatcher, Driver (select all that apply).
6. Click **Save.**

A temporary password is auto-generated. The user must change it on first login.

### Editing a Team Member
Click on any team member to open their profile. You can update their name, phone, roles, and active status.

### Deactivating a User
Toggle the **Active** switch off on their profile. Deactivated users cannot log in. Their historical trip records are preserved.

---

## Managing Vehicles

Admins can manage the vehicle fleet.

### Adding a Vehicle
1. Go to **Fleet** in the admin section.
2. Click **Add Vehicle**.
3. Enter: name (e.g. Van 1), make, model, year, license plate, capacity (number of passengers), and home base.
4. Set the status: Available, In Use, or Out of Service.
5. Click **Save.**

### Editing a Vehicle
Click on a vehicle to open its profile. Update any field and save.

Current fleet:
- **Van 1** — Chevrolet Express, capacity 7, based at PERC St. Pete
- **Van 2** — Chevrolet Express, capacity 7, based at PERC Clearwater

---

## Grants and Partners

### Grants
Grants track funding sources for rider trips.

1. Go to **Grants** in the admin section.
2. Click **Add Grant**.
3. Enter: grant name, grantor (funding organization), total amount, start date, end date, and any reporting notes.
4. Save.

When booking a trip, select the grant as the payment type. The system tracks how much of the grant budget has been used vs. remaining.

### Partner Organizations
Partner organizations book the van + driver for block periods.

1. Go to **Partners** in the admin section.
2. Click **Add Partner**.
3. Enter: organization name, contact info, billing rate (if different from standard), and invoice cycle (per trip, weekly, or monthly).
4. Save.

When booking a partner trip, select the partner as the payment type. Pricing follows the partner block rate sheet.

---

## Access Codes and Free Ride Coupons

### Registration Codes
Registration codes (format: `PERC-XXXXXX`) are used to invite new staff users to self-register. Admins can generate a batch from the Access Codes section.

### Free Ride Coupons
Free ride codes (format: `FREE-XXXXXX`) are assigned to riders and give them one free trip within a 30-day window.

To issue a free ride coupon:
1. Go to **Access Codes** in the admin section.
2. Click **Generate Free Ride Code**.
3. Assign the code to a rider profile.
4. The code is stored on the rider profile and applies automatically to eligible bookings for 30 days.

Codes expire automatically after 30 days. The system runs expiry checks every 5 minutes.

---

## Rider Self-Booking Page

Riders can request trips themselves at **book.rydeworks.com** (or **perc.rydeworks.com/book**).

The booking page:
- Shows the organization's name and contact info
- Allows riders to request a pickup time, pickup address, and destination
- Collects payment method setup (card, Venmo, Cash App)
- Sends the request to the dispatch team

Self-booked trips appear in the dispatcher dashboard and must be confirmed and assigned like any other trip.

For riders without internet access, they can call the dispatch line: **(727) 313-1241**.

---

## Fare Zones and Pricing

Fares are calculated automatically when you enter a destination address during trip booking. The zone is determined by the straight-line distance from the selected home base.

### Individual Rider Fares (Flat Rate)

| Zone | Service Area | Round-Trip | One-Way |
|---|---|---|---|
| Zone 1 | Core South/Central St. Pete (0–6 mi) | $18 | $9 |
| Zone 2 | Greater St. Pete / South Pinellas (6–12 mi) | $20 | $10 |
| Zone 3 | Central Pinellas — Largo, Clearwater (12–18 mi) | $22 | $11 |
| Zone 4 | North Pinellas — north of Ulmerton (>18 mi) | $25 | $13 |
| Out-of-county | Hillsborough, Pasco, Hernando, Manatee, Sarasota | $32–$40 | Case-by-case |

### Partner Block Rates (Van + Driver)

| Booking | Zone 1-2 | Zone 3 | Zone 4 | Out-of-county |
|---|---|---|---|---|
| Half-day (up to 4 hours) | $320 | $360 | $420 | $480–$560 |
| Full-day (up to 8 hours) | $600 | $680 | $780 | $880–$1,040 |

Rates are flat — there is no per-mile charge. Zone is determined solely by destination area relative to the departure base.

---

## Password and Account Management

### Changing Your Own Password
1. Click your name or profile icon in the top corner of the app.
2. Select **Change Password**.
3. Enter your current password and your new password (minimum 8 characters).
4. Save.

### Resetting a Forgotten Password
1. On the login page, click **Forgot Password**.
2. Enter your email address.
3. Check your email for a reset link. The link expires in 1 hour.
4. Click the link, enter your new password, and save.

### First-Login Password Setup
If you received a temporary password from an admin, you will be prompted to set your own password immediately after your first login. You cannot use the app until this is done.

---

## Super Admin Panel

The Super Admin panel is accessible only to accounts with the `super_admin` role (currently Rich Alvarez).

Access it at: **app.rydeworks.com/super-admin**

### What You Can Do
- **View all organizations** on the platform
- **Create a new organization** (onboarding a new SaaS customer)
- **Edit any organization's** settings, branding, fare zones, and partner rates
- **Suspend an organization** — deactivates all users immediately (used for nonpayment)
- **Reinstate a suspended organization**

### Creating a New Organization
1. In the Super Admin panel, click **New Organization**.
2. Enter: organization name, slug (URL identifier), contact email and phone.
3. Set branding: app name, primary color, accent color.
4. Add home bases (van dispatch locations).
5. Configure fare zones and partner rates.
6. Set the SaaS plan tier: Trial, Basic, Professional, or Enterprise.
7. Save.

The new organization is live immediately. Create the first admin user from the Team section after switching org context.

---

## Troubleshooting

### "Invalid email or password"
- Double-check the email address. Emails are case-insensitive.
- If you just reset your password, make sure you are using the new one.
- If you still cannot log in, ask your admin to check whether your account is active.

### Trip not showing for the driver
- Confirm the trip has a driver assigned and is not in Canceled status.
- Check that the driver is logged into the correct account.
- Verify the trip date is correct — drivers see trips for today by default.

### SMS not sending
- Confirm the rider's phone number is saved on their profile.
- Contact your admin — SMS requires a Twilio integration that may need configuration.

### Fare zone shows as "Unknown" or $0
- This usually means the destination address did not resolve to a lat/lng coordinate.
- Re-enter the address and confirm it from the autocomplete suggestions.
- If the problem persists, enter the trip and manually set the fare.

### CSV export is blank or missing trips
- Check that the date range in the Reports section covers the trips you expect.
- Dates are interpreted in Eastern time — confirm the trips fall within the selected window.

### "Too many requests" error
- The system limits 200 API requests per 15-minute window per IP. This typically only occurs during automated testing or bulk operations. Wait 15 minutes and try again.

### Cannot access admin settings
- Admin settings require the Admin role. Contact Rich Alvarez or Matt Lopez to have your role updated.

---

## Quick Reference — Key Contacts

| Contact | Role | Phone / Email |
|---|---|---|
| Rich Alvarez | Platform owner / Super Admin | rich@alvarezassociatesfl.com / (727) 477-8909 |
| Dispatch line | Rider calls | (727) 313-1241 |

---

*RydeWorks is built and maintained by Alvarez & Associates. For platform support, contact rich@alvarezassociatesfl.com.*
