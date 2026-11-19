# Deploying Shop-SC to AWS EC2

One EC2 instance runs everything with Docker Compose:

```
Internet ──443──▶ Caddy (auto HTTPS) ──┬─ /api/*, /uploads/* ─▶ Express backend ─▶ PostgreSQL
                                        └─ everything else ─────▶ Next.js frontend
```

Only ports 80/443 are public. Postgres, uploads and Caddy's certificates live in Docker volumes.
Pushing to `main` runs tests, builds both images, and (once enabled) redeploys over SSH.

Time: about 45 minutes. Cost: one t3.micro + its public IP (see step 1).

---

## 1. Billing safety first (10 min)

1. Sign in as the root user and turn on **MFA** (IAM → Security credentials).
2. **Billing → Free Tier**: check which plan you're on.
   - Account created **on/after 15 Jul 2025**: credit-based Free plan ($100–$200 credits, 6 months).
   - Older account: legacy Free Tier; if the account is over 12 months old, expect roughly $8–10/month
     for a t3.micro running 24/7, plus about $3.60/month for its public IPv4 address.
3. **Billing → Budgets → Create budget → Zero spend budget** (alerts on the first cent), *and* a
   **Monthly cost budget of $5** with email alerts at 50 / 80 / 100 %.
4. Optional CloudWatch alarm: **Billing preferences → Receive CloudWatch billing alerts**, then in
   **us-east-1** create an alarm on `EstimatedCharges > 5 USD`.

## 2. Launch the instance (10 min)

EC2 console, region **us-west-2 (Oregon)** → **Launch instance**:

| Setting | Value |
|---|---|
| Name | `shopsc` |
| AMI | **Ubuntu Server 24.04 LTS** (x86_64) |
| Type | **t3.micro** (free-tier eligible; t3.small builds faster if you have credits) |
| Key pair | Create new → `shopsc-key` (.pem) — keep it safe |
| Security group | Allow **SSH (22) from My IP**, **HTTP (80) from anywhere**, **HTTPS (443) from anywhere** |
| Storage | 20 GB gp3 |

Then **Elastic IPs → Allocate → Associate** with the instance so the address (and your demo link)
never changes. An Elastic IP that isn't attached to a running instance is billed, so release it if you
tear down.

## 3. Get the code onto the server (5 min)

```bash
chmod 400 shopsc-key.pem
ssh -i shopsc-key.pem ubuntu@<ELASTIC_IP>

# on the server — the repo is private, so give the server a read-only deploy key:
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

GitHub → your repo → **Settings → Deploy keys → Add deploy key** → paste it (leave "write" unchecked).

```bash
git clone git@github.com:<your-github-user>/ShopSC-Final.git ~/shopsc
```

## 4. Install and start (≈10 min, mostly waiting)

```bash
cd ~/shopsc
./deploy/setup-ec2.sh
```

This installs Docker, adds swap, writes `.env.production` (random `JWT_SECRET` and DB password,
domain = `<ip-with-dashes>.sslip.io`), builds the images and starts everything. When it prints
**Done**, open `https://<ip-with-dashes>.sslip.io`. Caddy gets the HTTPS certificate on the first request.

Have your own domain? Point an A record at the Elastic IP and run `./deploy/setup-ec2.sh shop.yourdomain.com`
instead (or edit `DOMAIN` in `.env.production` and run `./deploy/deploy.sh`).

## 5. Optional features

Edit `~/shopsc/.env.production`, then `./deploy/deploy.sh`:

- `GROQ_API_KEY=...` — turns on the Tommy Trojan AI chatbot (free key at console.groq.com).
- `GOOGLE_CLIENT_ID=...` — real USC Google sign-in. In Google Cloud Console add
  `https://<your domain>` to the OAuth client's **Authorized JavaScript origins**.
- For a real USC-only launch set `DEMO_MODE=false` and `SEED_DEMO_DATA=false` (requires Google sign-in).

## 6. Turn on continuous deployment (5 min)

GitHub repo → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `EC2_HOST` | the Elastic IP |
| Secret | `EC2_USER` | `ubuntu` |
| Secret | `EC2_SSH_KEY` | full contents of `shopsc-key.pem` |
| Variable | `DOMAIN` | e.g. `54-12-34-56.sslip.io` |
| Variable | `DEPLOY_ENABLED` | `true` |

Every push to `main` now runs tests → builds images → SSHes in → `git reset --hard origin/main` →
`deploy/deploy.sh` → checks `https://$DOMAIN/api/health`.

## Day-to-day commands (on the server)

```bash
cd ~/shopsc
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C ps                       # status
$C logs -f backend          # follow API logs
./deploy/deploy.sh          # rebuild + restart after changes
$C exec postgres pg_dump -U shopsc shop_sc > backup-$(date +%F).sql   # DB backup
```

## Tearing it down

Terminate the instance, **release the Elastic IP**, delete the EBS volume if it remains, and keep the
budget alerts on.

## Known limitations (good interview talking points)

- **Demo mode bypasses USC verification by design** so recruiters can try the app; every visitor still
  gets a real anonymous Semaphore identity and a zero-knowledge proof generated in their browser.
- The Semaphore login trusts the client-supplied `stableId`; binding it to the proof (or using the
  JWT-circuit login path) is the next hardening step.
- Single instance, single AZ, Postgres in a container: fine for a demo. Next steps would be RDS,
  S3 for uploads and nightly `pg_dump` to S3.
