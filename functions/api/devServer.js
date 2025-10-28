'use strict'

// Lightweight local dev server that mimics Catalyst Advanced I/O
// It serves the exported Express app at root so requests include /server/api/* paths.

const path = require('path')
try { require('dotenv').config({ path: path.join(__dirname, '.env') }) } catch {}
const express = require('express')

// Import the Advanced I/O app (Express) defined in index.js
const app = require('./index.js')
const root = express()

// Mount the app at root so it receives the original /server/api/* path
root.use(app)

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const server = root.listen(PORT, () => {
  console.log(`AdvancedIO (local) listening on http://localhost:${PORT}/server/api/`)
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
