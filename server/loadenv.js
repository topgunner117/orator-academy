// Load server/.env regardless of the current working directory, so it works whether the server
// is started from the repo root (`npm start` → node server/server.js) or from server/ (npm run
// dev). On Railway there's no .env file — env vars are injected — so this is simply a no-op there.
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') })
