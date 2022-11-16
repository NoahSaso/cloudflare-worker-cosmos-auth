# cloudflare-worker-cosmos-auth

Authentication for Cloudflare Workers using a [Cosmos](https://cosmos.network)
wallet signature.

This is a base template you should modify to fit your needs.

## API

### Setup

These steps are already done in this template. Right now, a simple `GET /ping` route is
used. Replace this with your own routes.

1. Setup an unauthorized route to retrieve the `nonce` for a given `publicKey`:

```ts
import { handleNonce } from './routes/nonce'

router.get('/nonce/:publicKey', handleNonce)
```

2. Add the auth middleware to the routes you want protected:

```ts
import { authMiddleware } from './auth'

router.all('*', authMiddleware)

// Add authorized routes below.
```

### Usage

1. Retrieve the current `nonce` for your public key via a `GET` request to your
   nonce-getting route. The response will be a JSON object with the `nonce`
   field set to a number.

2. Sign the entire `data` object for your authorized route with your Cosmos
   wallet, inserting the `nonce` value retrieved from step (1). The `data`
   object schema is described in the tables below.

3. Send a `POST` request to your authorized route, with a body that looks like:

```json
{
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

### Request body

| Field       | Type     | Description                                                                                                                                                                                            |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`      | `object` | The data you want to send to your authorized route. This must contain the `auth` object described below. This should also contain the other properties your route expects, formatted however you like. |
| `signature` | `string` | The signature from a Cosmos wallet signing the `data` object. The method to compute this signature is described below.                                                                                 |

### Auth object

The `signature` field of the request body must contain the string signature
returned from signing the entire `data` field with a Cosmos wallet.

The `data.auth` object of the request body must contain the following fields:

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
