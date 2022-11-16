export interface Env {
  NONCES: KVNamespace
}

export interface Auth {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: string
}

export type RequestBody<
  D extends Record<string, unknown> = Record<string, never>
> = {
  data: {
    auth: Auth
  } & D
  signature: string
}

export interface AuthorizedRequest extends Request {
  parsedBody: RequestBody
}
