# Deploy

Live at https://pif.5-161-180-197.nip.io on the openbrain server.

- Service: `pif.service` (copy in this folder), runs `node server.js` from `/home/ken/pif` as `ken`.
- Settings: `/etc/pif.env` (not in git). Holds the port, database path, public address, the admin key and the demo key (`PIF_DEMO_KEY`).
- Database: `/var/lib/pif/pif.db`.
- Web: nginx site `/etc/nginx/sites-available/pif` proxies to `127.0.0.1:8095`. Certificate from certbot, renews on its own.

Ship a change:

```bash
cd ~/pif && npm test && sudo systemctl restart pif && curl -s https://pif.5-161-180-197.nip.io/healthz
```
