'use strict';

// Advanced I/O adapter (Express) that forwards all requests to our compiled TS handler
// Load .env only in local/dev; harmless in cloud if no file exists
try { require('dotenv').config() } catch {}
const express = require('express')
/** @type {{ handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => any }} */
// In production (Catalyst cloud), we bundle the compiled handler under ./handler
// In local dev, this path also works since it's part of the function folder
const { handler } = require('./handler/index.js')

const app = express()

// CORS driven by ALLOW_ORIGIN (comma-separated list) or defaults to *
app.use((req, res, next) => {
	const allowEnv = (process.env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean)
	const origin = req.headers.origin
	let allow = '*'
	const allowLocalhostAny = process.env.ALLOW_LOCALHOST_ANY === '1' || process.env.DEBUG_AUTH === '1'

	if (allowEnv.length === 1 && allowEnv[0] === '*') {
		allow = '*'
	} else if (origin && allowEnv.includes(origin)) {
		allow = origin
		res.header('Vary', 'Origin')
	} else if (origin && allowLocalhostAny && /^http:\/\/localhost:\d+$/i.test(origin)) {
		// Dev convenience: when enabled, allow any localhost port
		allow = origin
		res.header('Vary', 'Origin')
	} else if (allowEnv.length > 0) {
		// pick the first configured origin if current origin isn't in list
		allow = allowEnv[0]
	}
	res.header('Access-Control-Allow-Origin', allow)
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
		res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
		res.header('Access-Control-Max-Age', '600')
	if (process.env.DEBUG_AUTH === '1') {
		res.header('X-Debug-Auth', '1')
	}
	if (req.method === 'OPTIONS') return res.status(204).end()
	next()
})

// Normalize the Catalyst Advanced I/O base path (e.g., /server/api or /server/api/<functionName>)
app.use((req, res, next) => {
	const base = '/server/api'
	if (req.url && req.url.startsWith(base)) {
		const rest = req.url.slice(base.length) || ''
		// If rest already begins with '/api', don't double-prefix
		req.url = rest.startsWith('/api') ? rest : ('/api' + rest)
	}
	next()
})

// Forward everything to our handler (which routes /api/* internally)
app.all('*', (req, res) => handler(req, res))

// Support both CommonJS and ESM default import semantics
module.exports = app
module.exports.default = app
