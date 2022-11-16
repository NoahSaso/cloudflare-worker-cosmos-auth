import { createCors } from 'itty-cors'
import { Router } from 'itty-router'

import { handlePing } from './routes/ping'
import { Env } from './types'
import { authMiddleware } from './auth'
import { handleNonce } from './routes/nonce'
import { respondError } from './utils'

// Create CORS handlers.
const { preflight, corsify } = createCors({
  methods: ['GET', 'POST'],
  origins: ['*'],
  maxAge: 3600,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
})

const router = Router()

// Handle CORS preflight OPTIONS request.
router.options('*', preflight)

// Get nonce for publicKey.
router.get('/nonce/:publicKey', handleNonce)

// Ping to test auth.
router.post('/ping', authMiddleware, handlePing)

// 404
router.all('*', () => respondError(404, 'Not found'))

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .handle(request, env)
      .catch((err) => {
        console.error('Error handling request', request.url, err)
        return respondError(
          500,
          `Internal server error. ${
            err instanceof Error ? err.message : `${err}`
          }`
        )
      })
      .then(corsify)
  },
}
