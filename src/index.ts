import * as jose from 'jose'

export interface Env {
  // KV namespaces
  AUTH: KVNamespace
}

interface Account {
  salt: string
  hash: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    let response: Record<string, unknown> | undefined
    try {
      if (pathname === '/register') {
        response = await handleRegister(request, env)
      } else if (pathname === '/login') {
        response = await handleLogin(request, env)
      } else if (pathname === '/ping') {
        response = await handlePing(request, env)
      }
    } catch (err) {
      if (err instanceof Response) {
        return err
      }

      console.error(err)
      return new Response(
        `Internal server error: ${
          err instanceof Error ? err.message : `${err}`
        }`,
        { status: 500 }
      )
    }

    if (response) {
      return new Response(JSON.stringify(response), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      })
    } else {
      return new Response('Not found', { status: 404 })
    }
  },
}

// Account getter and setter.

const ACCOUNT_KEY_PREFIX = 'account:'

const getAccount = async (
  { AUTH }: Env,
  username: string
): Promise<Account | null> =>
  await AUTH.get<Account>(ACCOUNT_KEY_PREFIX + username, 'json')

const setAccount = async (
  { AUTH }: Env,
  username: string,
  account: Account
): Promise<void> =>
  await AUTH.put(ACCOUNT_KEY_PREFIX + username, JSON.stringify(account))

// Convert Uint8Array to hex string.
const uint8ArrayToHex = (array: Uint8Array): string =>
  Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

// Hash password with salt.
const computeHashWithSalt = async (
  password: string,
  salt: string
): Promise<string> =>
  uint8ArrayToHex(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(password + salt)
      )
    )
  )

// Get or create JWK key for JWT signing.
const JWK_KEY = 'jwk-key'
const getJwkKey = async ({ AUTH }: Env): Promise<Uint8Array | jose.KeyLike> => {
  // Check if key has already been created.
  const jwk = await AUTH.get<jose.JWK>(JWK_KEY, 'json')

  if (jwk) {
    // Import key if found.
    const key = await jose.importJWK(jwk, 'HS256')
    return key
  } else {
    // Generate new key if not found.
    const key = await jose.generateSecret('HS256', {
      extractable: true,
    })

    // Export and store key for future retrieval.
    const extractedKey = await jose.exportJWK(key)
    await AUTH.put(JWK_KEY, JSON.stringify(extractedKey))

    return key
  }
}

// Sign JWT token for username.
const getSignedJwtForUsername = async (
  env: Env,
  username: string
): Promise<string> =>
  // Sign JWT for 30 days.
  await new jose.SignJWT({ username })
    .setProtectedHeader({
      alg: 'HS256',
    })
    .setIssuedAt()
    .setExpirationTime('10s')
    .sign(await getJwkKey(env))

// Verify JWT token and get payload.
const verifySignedJwt = async (
  env: Env,
  token: string
): Promise<jose.JWTPayload> =>
  // Sign JWT for 30 days.
  (await jose.jwtVerify(token, await getJwkKey(env))).payload

// Verify JWT token and get username from its payload.
const getAuthorizedUsername = async (
  request: Request,
  env: Env
): Promise<string> => {
  const authorization = request.headers.get('Authorization')
  if (!authorization || authorization.indexOf('Bearer ') !== 0) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const token = authorization.replace('Bearer ', '')
  try {
    const payload = await verifySignedJwt(env, token)
    if (!('username' in payload) || typeof payload.username !== 'string') {
      throw new Error('Invalid token.')
    }

    return payload.username
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      throw new Response('Authorization expired', { status: 401 })
    }

    console.error(err)
    throw new Response(err instanceof Error ? err.message : `${err}`, {
      status: 401,
    })
  }
}

// Routes.

const handleRegister = async (
  request: Request,
  env: Env
): Promise<Record<string, unknown>> => {
  const body = await request.json()

  if (!body || !('username' in body) || !('password' in body)) {
    throw new Response('Bad request', { status: 400 })
  }

  const { username, password } = body as {
    username: string
    password: string
  }

  // Check if username already exists.
  const account = await getAccount(env, username)
  if (account) {
    return {
      error: 'Username taken.',
    }
  }

  // Generate random salt.
  const salt = uint8ArrayToHex(crypto.getRandomValues(new Uint8Array(64)))
  // Hash password with salt.
  const hash = await computeHashWithSalt(password, salt)

  // Store account.
  await setAccount(env, username, { salt, hash })

  // Get JWT token.
  const token = await getSignedJwtForUsername(env, username)

  return {
    token,
  }
}

const handleLogin = async (
  request: Request,
  env: Env
): Promise<Record<string, unknown>> => {
  const body = await request.json()

  if (!body || !('username' in body) || !('password' in body)) {
    throw new Response('Bad request', { status: 400 })
  }

  const { username, password } = body as {
    username: string
    password: string
  }

  // Get account.
  const account = await getAccount(env, username)

  // If account doesn't exist, error.
  if (!account) {
    return {
      error: 'Invalid credentials.',
    }
  }

  // If password doesn't match, error.
  const hash = await computeHashWithSalt(password, account.salt)
  if (hash !== account.hash) {
    return {
      error: 'Invalid credentials.',
    }
  }

  // Sign JWT for 30 days.
  const token = await getSignedJwtForUsername(env, username)

  return {
    token,
  }
}

const handlePing = async (
  request: Request,
  env: Env
): Promise<Record<string, unknown>> => {
  const username = await getAuthorizedUsername(request, env)
  return {
    username,
  }
}
