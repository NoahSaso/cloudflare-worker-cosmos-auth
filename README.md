# cloudflare-worker-cosmos-auth

[Cloudflare Workers](https://workers.cloudflare.com/) template to authenticate
requests via a [Cosmos](https://cosmos.network) wallet signature. This lets you
protect requests and associate data with a user's wallet identity.

For example, this would let you build a Cloudflare worker to associate a name
and NFT profile photo with a user's Cosmos wallet/identity and allow
authenticated updates, like [DAO DAO's pfpk
worker](https://github.com/DA0-DA0/pfpk).

This is a base template you should modify to fit your needs.

## API

This relies on [itty-router](https://github.com/kwhitley/itty-router), a
lightweight router built for Cloudflare Workers. However, you can compose the
provided functions however you'd like. This template just provides a very
simple setup that will fully work in production.

A `nonce` is used to prevent replay attacks. It is an incrementing integer,
starting from 0, that is stored in a KV store. The nonce must be publicly
retrievable (i.e. accessible without authentication) before each request and
will only be valid in the following authenticated request. This mechanism
prevents [replay attacks](https://en.wikipedia.org/wiki/Replay_attack). After
each authenticated request, the nonce is automatically incremented. This occurs
after the [authentication middleware](./src/auth.ts) succeeds, so even if the
route fails due to custom logic after the middleware executes, the nonce will
still be incremented. For this reason, the nonce should always be retrieved
immediately before making another authenticated request.

### Setup

1. Set up an unauthorized route to retrieve the `nonce` for a given `publicKey`,
   formatted as a hex string:

```ts
import { handleNonce } from './routes/nonce'

router.get('/nonce/:publicKey', handleNonce)
```

2. Add the auth middleware to the routes you want protected:

```ts
import { authMiddleware } from './auth'
import { handlePing } from './routes/ping'

// Protect one route with the auth middleware.
router.post('/ping', authMiddleware, handlePing)

// OR:

// Protect all remaining routes with the auth middleware.
router.all('*', authMiddleware)
// Add authorized routes below.
```

These steps are already done in this template. Right now, a simple `GET /ping` route is
used. Replace this with your own routes.

### Client usage

1. Retrieve the current `nonce` for a public key via your nonce-retrieval route
   (e.g. `GET /nonce/:publicKey` from the setup above). The response will be a
   JSON object with the `nonce` field set to a number:

```json
{
  "nonce": 0
}
```

2. Create and sign a `data` object for your authorized route with your Cosmos
   wallet. The `data` object contains the `auth` object described in the table
   below and any other data you want to send to the route. The `auth` object
   must use the `nonce` retrieved in step (1).

3. Send a `POST` request to your authorized route, with a body that looks like:

```json
{
  // The data object you created and signed in step (2).
  "data": {
    // The custom fields you want to use in your authorized route, if any.
    "my_custom_field": "my_custom_value",

    // The data.auth object described in the tables below with the nonce retrieved in step (1).
    "auth": {
      ...
    }
  },
  // The signature retrieved in step (2).
  "signature": "..."
}
```

### Auth object

This is the `auth` object that must be included in the `data` object sent to an
authorized route. It must contain the following fields:

| Field               | Type     | Description                                                                                                                                                                                                                         |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | `string` | The string used in the `type` field of the `signDoc` message. This displays in the wallet when making the signature, so you might want to customize it with a relevant label the user will understand. For example, "Verification". |
| `nonce`             | `number` | The unique value used to prevent replay attacks. This is a value stored on the server that gets incremented after each successful signature verification, starting at 0. The client should query for the nonce before each request. |
| `chainId`           | `string` | The chain ID of the blockchain used in the wallet during signing. Some wallets require a chain ID to be present when signing arbitrary data.                                                                                        |
| `chainFeeDenom`     | `string` | The native fee denom of the blockchain used in the wallet during signing. Some wallets require a denom to be present when signing arbitrary data.                                                                                   |
| `chainBech32Prefix` | `string` | The Bech32 prefix for the blockchain used in the wallet during signing. This is used to compute the signing address from the public key and serves as an extra check that the provided information is accurate.                     |
| `publicKey`         | `string` | The hex representation of the Cosmos public key used to create the signature.                                                                                                                                                       |

### Signature

The signature can be derived by the client via `OfflineAminoSigner`'s
`signAmino` function with the `signDoc` argument generated using `makeSignDoc`
from the [`@cosmjs/amino`](https://www.npmjs.com/package/@cosmjs/amino) package.
This can be seen in the signature verification code located in
[src/utils.ts](./src/auth.ts#L36) around line 36.

### Request body

An authorized request must have a JSON body with at least the following fields:

| Field       | Type     | Description                                                                                                                                                                                            |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`      | `object` | The data you want to send to your authorized route. This must contain the `auth` object described below. This should also contain the other properties your route expects, formatted however you like. |
| `signature` | `string` | The signature from a Cosmos wallet signing the `data` object. The method to compute this signature is described below.                                                                                 |

Example:

```json
{
  "data": {
    "my_custom_field": "my_custom_value",
    "auth": {
      "type": "Verify",
      "nonce": 1,
      "chainId": "juno-1",
      "chainFeeDenom": "ujuno",
      "chainBech32Prefix": "juno",
      "publicKey": "..."
    }
  },
  "signature": "..."
}
```

## Development

```sh
wrangler dev
# OR
npm run start
```

### Configuration

Create KV namespaces for production and development:

```
wrangler kv:namespace create NONCES
wrangler kv:namespace create NONCES --preview
```

Add the bindings to `wrangler.toml`:

```toml
kv-namespaces = [
  { binding = "NONCES", id = "NONCE_ID", preview_id = "NONCE_PREVIEW_ID" }
]
```

## Deploy

```sh
wrangler publish
# OR
npm run deploy
```
