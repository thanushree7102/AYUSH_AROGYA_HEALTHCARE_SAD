# Four-app AYUSH shared startup

1. Keep all four project folders as siblings under the same workspace folder.
2. All `.env` files use `DATA_ROOT=../../AYUSH_SHARED_DATA`.
3. Keep `AYUSH_SECRET` blank in all four apps. Ayurveda creates `AYUSH_SHARED_DATA/ayush.secret`; all other apps read that same file.
4. Start Ayurveda first. It hosts the shared Patient Identity, Clinical, Longitudinal, Event Bus and Integrations services.
5. Start Yoga, then Unani, then Siddha. They start only their own domain service, gateway and frontend.
6. `npm run dev` automatically creates the shared SQLite files before services start. To create them without starting the app, run `npm run prepare:data`.

The shared SQLite files are under `AYUSH_SHARED_DATA` (not each app's `shared-platform/database` folder). The database schemas are initialized by each backend service on startup.
