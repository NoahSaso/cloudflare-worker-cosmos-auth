import { serializeSignDoc, makeSignDoc } from '@cosmjs/amino'
import {
  secp256k1PublicKeyToBech32Address,
  verifySecp256k1Signature,
} from './crypto'
import { AuthorizedRequest, Env, RequestBody } from './types'
import { objectMatchesStructure, respondError } from './utils'

// Get nonce for publicKey.
export const getNonce = async (
  { NONCES }: Env,
  publicKey: string
): Promise<number> => {
  const nonce = await NONCES.get(publicKey)
  const nonceValue = nonce ? parseInt(nonce) : 0
  return isNaN(nonceValue) ? 0 : nonceValue
}

// Set nonce for publicKey.
export const setNonce = async (
  { NONCES }: Env,
  publicKey: string,
  nonce: number
): Promise<void> => await NONCES.put(publicKey, nonce.toString())

// Verify signature.
export const verifySignature = async ({
  data,
  signature,
}: RequestBody): Promise<boolean> => {
  try {
    const signer = secp256k1PublicKeyToBech32Address(
      data.auth.publicKey,
      data.auth.chainBech32Prefix
    )
    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: data.auth.type,
            value: {
              signer,
              data: JSON.stringify(data, undefined, 2),
            },
          },
        ],
        {
          gas: '0',
          amount: [
            {
              denom: data.auth.chainFeeDenom,
              amount: '0',
            },
          ],
        },
        data.auth.chainId,
        '',
        0,
        0
      )
    )

    return await verifySecp256k1Signature(
      data.auth.publicKey,
      message,
      signature
    )
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}

// Validate nonce and signature from body or throw response to return.
export const validateBodyAndIncrementNonceOrThrowResponse = async (
  env: Env,
  body: RequestBody
): Promise<void> => {
  // Validate nonce.
  const nonce = await getNonce(env, body.data.auth.publicKey)
  if (nonce !== body.data.auth.nonce) {
    console.error(
      `Nonce mismatch. Expected: ${nonce}. Received: ${body.data.auth.nonce}`
    )
    throw respondError(401, 'Unauthorized. Invalid nonce.')
  }

  // Validate signature.
  if (!(await verifySignature(body))) {
    throw respondError(401, 'Unauthorized. Invalid signature.')
  }

  // If all is valid, increment nonce to prevent replay attacks.
  await setNonce(env, body.data.auth.publicKey, nonce + 1)
}

// Middleware to protect routes with the above function. If it does not return,
// the request is authorized. If successful, the `parsedBody` field will be set
// on the request object, accessible by successive middleware and route
// handlers.
export const authMiddleware = async (
  request: AuthorizedRequest,
  env: Env
): Promise<Response | void> => {
  try {
    const parsedBody: RequestBody = await request.json?.()

    if (
      // Validate body has at least the auth fields we need.
      !objectMatchesStructure(parsedBody, {
        data: {
          auth: {
            type: {},
            nonce: {},
            chainId: {},
            chainFeeDenom: {},
            chainBech32Prefix: {},
            publicKey: {},
          },
        },
        signature: {},
      })
    ) {
      return respondError(400, 'Invalid body')
    }

    await validateBodyAndIncrementNonceOrThrowResponse(env, parsedBody)

    // If all is valid, add parsed body to request and do not return to allow
    // continuing.
    request.parsedBody = parsedBody
  } catch (err) {
    if (err instanceof Response) {
      return err
    }

    // Rethrow err to be caught by global error handler.
    throw err
  }
}
