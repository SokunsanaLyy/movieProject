# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).


# How the backend work
### Note: 
Backend is done. To run both backend and the app at once from the root folder:
```bash
npm install
cd backend
npm install
cd ..
npm run dev:all
```
If you already installed dependencies and configured the backend environment, you can just run `npm run dev:all` from the root.

If you need to set up the backend first:
```bash
cd backend
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```
Otherwise you will have to run the frontend and backend one by one.

Located in folder named backend

- 'express' is for HTTP routing
- 'cors' so the frontend can request the backend
- 'dotenv' to load .env
- 'prisma' + '@prisma/client' for database access
- 'postgresql' via 'prisma' for database service on Render

## Backend flow

- 'server.js' starts 'Express' and 'Prisma'.
- Middleware:
  - 'cors()' enables cross-origin requests from Vite
  - 'express.json()' parses JSON bodies
- Auth:
  - '/api/auth/register' hashes passwords and creates a user
  - '/api/auth/login' verifies credentials and returns a JWT
- Protected routes:
  - require 'Authorization: Bearer < token >'
  - the token is validated before accessing 'watchlist/review' endpoints
- Data:
  - Media, User, Review, Watchlist are stored in SQLite (dev.db file)
  - Prisma handles schema + database queries