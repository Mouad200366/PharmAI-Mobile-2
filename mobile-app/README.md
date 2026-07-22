# PharmAI Mobile (Expo)

React Native / Expo patient app for PharmAI, talking to the **same Django
backend** as the web frontend — no new backend needed.

## What's scaffolded here

- **Navigation** (`src/navigation/`) — mirrors the web app's route split:
  - `RootNavigator` — waits for auth state to hydrate from SecureStore, then
    mounts either `AuthStack` or `MainStack` (equivalent of web's
    `RequireAuth` / `RequireGuest`).
  - `AuthStack` — Landing, Login, Register, VerifyOTP, ForgotPassword.
  - `AppTabs` — bottom tab bar: Dashboard, Search, Orders, Notifications,
    Profile (mirrors `DashboardLayout`'s sidebar; "Saved Addresses" moved
    under Profile to keep the tab bar to 5 items).
  - `MainStack` — wraps `AppTabs` and pushes Cart / Checkout / OrderDetail /
    Addresses on top, same as those routes living inside the web dashboard
    shell.
- **API client** (`src/api/`) — direct port of the web app's `api/` folder
  (`auth.ts`, `users.ts`, `addresses.ts`, `catalog.ts`, `orders.ts`,
  `notifications.ts`, `errors.ts`). Same endpoints, same payload/response
  types. `client.ts` swaps `localStorage` for `expo-secure-store` and adds
  the same silent-refresh-then-logout interceptor logic.
- **Stores** (`src/store/`) — `authStore` (Zustand, hydrated async from
  SecureStore) and `cartStore` (Zustand + AsyncStorage persistence via
  `zustand/middleware`'s `persist`), functionally identical to the web
  versions.
- **Screens** — all screens are placeholder stubs right now
  (`ScreenPlaceholder`) just so navigation compiles end-to-end. We'll build
  these out one by one next.

## Setup

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `a` / `i` for an emulator.

### Pointing at your backend

Edit `app.json` → `expo.extra`:

```json
"extra": {
  "apiBaseUrl": "http://192.168.1.23:8000/api/v1",
  "wsBaseUrl": "ws://192.168.1.23:8000/ws"
}
```

`127.0.0.1` only works in a web preview — on a physical device or emulator
it points at the device itself, not your dev machine. Use your machine's
LAN IP (same Wi-Fi as the phone/emulator), or run `expo start --tunnel`.

If you're running the Django dev server, make sure it's reachable on your
LAN: `python manage.py runserver 0.0.0.0:8000`.

## Deferred / to revisit

- **Push notifications** (FCM/APNs via Expo push) — not wired up yet. The
  backend already has in-app notifications over WebSocket; native push for
  background/killed-app delivery is a backend + mobile addition we'll do
  after the core screens are working.
- **WebSocket client** for live order tracking/chat — not built yet, will
  follow the same auth pattern (`?token=<jwt>` query string) as the web
  app's socket connections.
- **Image picking** for prescription photos / avatar upload — will use
  `expo-image-picker`; `usersApi.uploadAvatar()` is already shaped to take
  a local URI instead of a browser `File`.

## Folder structure

```
App.tsx
src/
  api/            REST client + one module per backend resource
  store/          authStore, cartStore, tokenStorage (SecureStore wrapper)
  navigation/     RootNavigator, AuthStack, AppTabs, MainStack, types
  screens/
    auth/         Landing, Login, Register, VerifyOTP, ForgotPassword
    patient/      Dashboard, Search, Cart, Checkout, MyOrders, OrderDetail,
                   Profile, Addresses, Notifications
  components/ui/  Icon (MaterialIcons wrapper), ScreenPlaceholder
  config/         env.ts (reads apiBaseUrl/wsBaseUrl from app.json)
```
