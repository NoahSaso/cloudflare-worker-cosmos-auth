# cloudflare-worker-jwt-auth

Authentication for Cloudflare Workers using KV and JWTs.

Uses the [jose](https://github.com/panva/jose) library's implementation of JWTs.

## Development

```sh
wrangler dev
# OR
npm run start
```

### Configuration

Create KV namespaces for production and development:

```
wrangler kv:namespace create AUTH
wrangler kv:namespace create AUTH --preview
```

Add the bindings to `wrangler.toml`:

```toml
kv-namespaces = [
  { binding = "AUTH", id = "AUTH_ID", preview_id = "AUTH_PREVIEW_ID" }
]
```

## Deploy

```sh
wrangler publish
# OR
npm run deploy
```