# Setting Up a Stable Dev Tunnel (Cloudflare Tunnel)

This guide gives you a **permanent** public HTTPS URL pointing at your local
mailops server (`:3001`), so `TRACK_API_URL` and `PUBSUB_AUDIENCE` never need to
change again — set it up once and reuse the same hostname across laptop reboots,
network changes, and IP changes.

This replaces the old ngrok flow, whose free-tier URL changed on every restart
and forced you to re-point Google Pub/Sub each time.

> **Prerequisite:** a domain you control **on Cloudflare DNS** (the dev domain is
> separate from `coldjot.com`). Cloudflare Tunnel's public hostname can only
> route a Cloudflare-managed zone. Verify with:
>
> ```bash
> dig +short NS <your-domain>
> # expect: a list of *.ns.cloudflare.com nameservers
> ```
>
> If it's not on Cloudflare, add the zone in the Cloudflare dashboard first
> (full-setup nameserver delegation is the smooth path).

---

## 1. Install and authenticate `cloudflared`

```bash
# macOS (Homebrew)
brew install cloudflared
cloudflared --version

# log in — opens a browser; pick the account + zone
cloudflared tunnel login
# → writes ~/.cloudflared/cert.pem (origin cert authorizing tunnel + DNS management)
```

## 2. Create a named tunnel

A **named** tunnel has a permanent ID — that's the whole point. The hostname you
map to it later never changes.

```bash
cloudflared tunnel create coldjot-dev          # prints a TUNNEL_ID (UUID)
cloudflared tunnel list                         # confirm it exists
```

> **Use a named tunnel, not `cloudflared tunnel --url`.** The quick form hands
> you a random `*.trycloudflare.com` URL that changes every run — same pain as
> ngrok's free tier. Always `tunnel create` + `route dns`.

## 3. Route a public hostname to the tunnel

Pick the dev hostname (e.g. `dev.<your-domain>`) and create the DNS record that
points it at the tunnel:

```bash
cloudflared tunnel route dns coldjot-dev dev.<your-domain>
# Creates a CNAME: dev.<your-domain> → <TUNNEL_ID>.cfargotunnel.com
# (proxied through Cloudflare = orange cloud by default)

dig +short dev.<your-domain>
# expect: a couple of Cloudflare anycast IPs (e.g. 104.x / 188.x)
```

**This hostname is your stable URL.** It becomes `TRACK_API_URL` and the base of
`PUBSUB_AUDIENCE`.

## 4. Configure ingress

Create `~/.cloudflared/config.yml`. This tells `cloudflared` how to route
inbound requests:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Route the dev hostname to local mailops (Express on :3001)
  - hostname: dev.<your-domain>
    service: http://localhost:3001
  # Catch-all rule (required) — 404 anything else
  - service: http_status:404
```

Validate it before running:

```bash
cloudflared tunnel ingress validate    # → "OK"
```

## 5. Run + verify

Start mailops first (in one terminal), then the tunnel (in another):

```bash
# Terminal 1: start mailops (from the repo root)
turbo run dev          # or whatever brings up mailops on :3001

# Terminal 2: run the tunnel
cloudflared tunnel run coldjot-dev
```

Now hit it from the public internet (a recipient mail client or Google is "the
public internet"):

```bash
# tracking pixel endpoint — should return mailops's response, NOT a Cloudflare error
curl -I "https://dev.<your-domain>/api/track/foo.png"
# expect: HTTP/2 200 from mailops (content-type image/gif or similar)

# pubsub endpoint — Google POSTs here. An unauthenticated GET should hit
# your JWT guard (401 = good, it reached mailops; not a connection error)
curl -i "https://dev.<your-domain>/api/pubsub"
# expect: 401 (missing Bearer token) — this is GOOD; the request reached mailops
```

If you see a Cloudflare 1xxx error page, the tunnel isn't running or the ingress
`service:` URL is wrong. If `curl` hangs, Cloudflare can't reach `cloudflared`
(check `cloudflared tunnel list` shows the tunnel as connected).

## 6. Make it persistent

So it survives reboot:

```bash
# install as a launchd service (macOS) — auto-starts on login
sudo cloudflared service install

# confirm
sudo launchctl list | grep cloudflared

# logs (if something's off)
tail -f /Library/Logs/com.cloudflare.cloudflared.{out,err}.log
```

> **Restart test (the actual goal):** reboot the laptop, log back in, start
> mailops, and re-run the `curl` from step 5. The hostname must be unchanged and
> the request must still reach mailops. If yes, the "set once, never again"
> promise holds.

## 7. Wire it into mailops env

Create `apps/mailops/env/.env.local` (gitignored — won't be committed). The
loader (`config/env.ts`) reads `.env.local` **after** `.env.${APP_ENV}`, so it
overrides per-machine without touching shared files:

```bash
# apps/mailops/env/.env.local  (gitignored)
TRACK_API_URL=https://dev.<your-domain>
PUBSUB_AUDIENCE=https://dev.<your-domain>/api/pubsub
```

Restart mailops. Outgoing emails now carry tracking links pointing at the stable
hostname, and Google Pub/Sub pushes arrive over the same tunnel.

---

## Why both `TRACK_API_URL` and `PUBSUB_AUDIENCE` use this URL

| Var | What it's for | Why it needs a public URL |
|---|---|---|
| `TRACK_API_URL` | Base URL baked into every outgoing email — the tracking pixel `<img>` and every wrapped click-redirect link | The recipient's mail client must be able to fetch it over the internet |
| `PUBSUB_AUDIENCE` | (a) the push endpoint registered with Google Pub/Sub, and (b) the JWT `aud` claim mailops verifies incoming pushes against | Google must POST to it, and the registered endpoint must match the JWT aud **exactly** |

Because `PUBSUB_AUDIENCE` is **triply coupled** (GCP subscription + push endpoint
+ JWT aud), a stable URL is what removes the drift. And because mailops
reconciles the push endpoint on boot (it calls `modifyPushConfig` if the env
value differs from what Google has), changing the URL just means editing env +
rebooting — no GCP Console visit.

See [`gmail-notifications-setup.md`](./gmail-notifications-setup.md) for the
full Pub/Sub setup (service account, topic, subscription, Gmail watch).

---

## Troubleshooting

- **`tunnel route dns` fails** → the zone isn't on Cloudflare. Add it first
  (full-setup nameserver delegation), then retry.
- **`dig <hostname>` returns nothing** → DNS hasn't propagated or the route
  command targeted the wrong zone. Re-run `cloudflared tunnel route dns`.
- **502 / Cloudflare error page on `curl`** → mailops isn't running on `:3001`,
  or `config.yml`'s `service:` points at the wrong port. Check both.
- **401 on `/api/pubsub`** → that's actually correct — it means the request
  reached mailops and hit the JWT guard. Google's real pushes carry a valid JWT.
- **Tunnel not auto-starting after reboot** → confirm
  `sudo launchctl list | grep cloudflared` shows the service; if not,
  re-run `sudo cloudflared service install`.
