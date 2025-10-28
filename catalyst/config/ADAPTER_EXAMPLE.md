# Adapter examples for Catalyst functions

Use these examples to wire the generated Catalyst function to the compiled handler in `catalyst/functions/dist/index.js`.

## Advanced I/O (Express)

Create or replace `functions/api/index.js` with:

```js
const express = require('express')
const { handler } = require('../../catalyst/functions/dist/index.js')
const app = express()

app.all('*', (req, res) => handler(req, res))

module.exports = app
```

## Basic I/O (single handler)

Create or replace `functions/api/index.js` with:

```js
const { handler } = require('../../catalyst/functions/dist/index.js')
module.exports = (req, res) => handler(req, res)
```
