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
	const allowEnvRaw = (process.env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean)
	// Normalize configured origins by trimming trailing slashes
	const allowEnv = allowEnvRaw.map(s => s.replace(/\/+$/, ''))
	const origin = (req.headers.origin || '').replace(/\/+$/, '')
	let allow = '*'
	const allowLocalhostAny = process.env.ALLOW_LOCALHOST_ANY === '1' || process.env.DEBUG_AUTH === '1'

	if (allowEnv.length === 1 && allowEnv[0] === '*') {
		allow = '*'
	} else if (origin && allowEnv.includes(origin)) {
		// Exact match (ignoring trailing slash)
		allow = req.headers.origin
		res.header('Vary', 'Origin')
	} else if (origin && allowLocalhostAny && /^http:\/\/localhost:\d+$/i.test(origin)) {
		// Dev convenience: when enabled, allow any localhost port
		allow = req.headers.origin
		res.header('Vary', 'Origin')
	} else if (allowEnv.length > 0 && origin) {
		// If origin doesn't match exactly (e.g., trailing slash configured), prefer reflecting the request origin
		// only when the hostname matches one of the configured hosts.
		try {
			const o = new URL(req.headers.origin)
			const ok = allowEnv.some(a => {
				try {
					const u = new URL(a)
					return u.protocol === o.protocol && u.hostname === o.hostname && (u.port || '') === (o.port || '')
				} catch { return false }
			})
			if (ok) {
				allow = req.headers.origin
				res.header('Vary', 'Origin')
			} else {
				allow = allowEnv[0]
			}
		} catch {
			allow = allowEnv[0]
		}
	} else if (allowEnv.length > 0) {
		allow = allowEnv[0]
	}
	res.header('Access-Control-Allow-Origin', allow)
	// Reflect requested headers when present, otherwise provide a safe allowlist including our custom key header
	const reqAllowHeaders = req.headers['access-control-request-headers']
	const allowHeaders = reqAllowHeaders ? String(reqAllowHeaders) : 'Content-Type, Authorization, X-Access-Key'
	res.header('Access-Control-Allow-Headers', allowHeaders)
	res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
		res.header('Access-Control-Max-Age', '600')
	if (process.env.DEBUG_AUTH === '1') {
		res.header('X-Debug-Auth', '1')
	}
	if (req.method === 'OPTIONS') return res.status(204).end()
	next()
})

	// Minimal ping for diagnostics (bypasses handler)
	app.get('/ping', (req, res) => {
		res.status(200).json({ pong: true, time: new Date().toISOString() })
	})

// Lightweight shared-key gate to prevent public data access (optional)
// Set ACCESS_KEY in Catalyst env vars to enable. You can also set ALLOW_PUBLIC_HEALTH=1 to allow /api/health without key.
app.use((req, res, next) => {
	if (req.method === 'OPTIONS') return next()
	const requiredKey = process.env.ACCESS_KEY
	if (!requiredKey) return next()
	// Normalize path similar to router below to decide what to protect
	const normalize = (u) => {
		let s = u || '/'
		if (s.startsWith('/server/api/api')) s = s.replace('/server/api', '')
		else if (s === '/server/api' || s.startsWith('/server/api/')) s = s.replace('/server/api', '/api')
		else if (!s.startsWith('/api') && s !== '/ping') s = (s.startsWith('/') ? ('/api' + s) : ('/api/' + s))
		return s
	}
	const path = normalize(req.url)
	const allowPublicHealth = process.env.ALLOW_PUBLIC_HEALTH === '1'
	const isProtected = path.startsWith('/api/') && !(allowPublicHealth && path === '/api/health')
	if (!isProtected) return next()

	// Read key from header or cookie
	const hdr = req.headers['x-access-key']
	let cookieKey
	const cookie = req.headers['cookie']
	if (cookie) {
		try {
			const parts = cookie.split(';').map(s => s.trim())
			for (const p of parts) {
				const [k, v] = p.split('=')
				if (k === 'access_key') { cookieKey = decodeURIComponent(v || '') }
			}
		} catch {}
	}
	// Also allow access_key via query string to avoid CORS preflight when needed
	let queryKey
	try {
		const u = new URL(req.protocol + '://' + (req.headers.host || 'localhost') + req.url)
		queryKey = u.searchParams.get('access_key') || undefined
	} catch {}
	const provided = (hdr || cookieKey || queryKey || '').trim()
	if (!provided || provided !== String(requiredKey)) {
		res.status(401).json({ code: 'unauthorized', message: 'Access key required' })
		return
	}
	return next()
})

// Path normalization: map /server/api/* to /api/* for compatibility with Zoho requests
app.all('*', (req, res) => {
	// Normalize Catalyst URL paths:
	// - /server/api/api/items -> /api/items (double /api from some proxies)
	// - /server/api/items     -> /api/items (Vite dev proxy case)
	// - /server/api           -> /api
	if (req.url.startsWith('/server/api/api')) {
		req.url = req.url.replace('/server/api', '')
	} else if (req.url === '/server/api' || req.url.startsWith('/server/api/')) {
		req.url = req.url.replace('/server/api', '/api')
	} else if (!req.url.startsWith('/api') && req.url !== '/ping') {
		// When the app is mounted under /server/api by the emulator, Express strips the mountpath
		// and we may receive paths like /health, /items, /metrics/stockouts. Prefix /api/ in those cases.
		if (req.url.startsWith('/')) {
			req.url = '/api' + req.url
		} else {
			req.url = '/api/' + req.url
		}
	}
	handler(req, res)
})

// Support both CommonJS and ESM default import semantics
module.exports = app
module.exports.default = app
