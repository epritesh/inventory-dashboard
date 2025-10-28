import http from 'node:http'
import { handler } from './index'

const port = Number(process.env.PORT || 9000)

const server = http.createServer(async (req, res) => {
  // Very small adapter so our handler can run locally without Express
  await Promise.resolve(handler(req as any, res as any))
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Functions dev server listening on http://localhost:${port}`)
})
