# ClipKeep fulfilment

Emails each ClipKeep Founding License buyer an expiring download link.

1. The buyer pays on the Stripe Payment Link.
2. Stripe sends `checkout.session.completed` to `https://downloads.soheililabs.com/stripe/webhook`.
3. The service verifies Stripe's signature and checks the sale came from the ClipKeep payment link and is paid. It then emails the buyer through Resend, and records the Checkout Session so a retried event doesn't send a second email.
4. The link, `/download?token=…`, is signed and works for `DOWNLOAD_LINK_DAYS`. It streams `DOWNLOAD_FILE`, and the file is never exposed at a public path.

The service has no dependencies: Node 20.6+ and the standard library only. It listens on `127.0.0.1:3202` behind nginx.
This directory is excluded from the soheililabs.com FTP deploy, and it runs on the VPS.

## Pre-orders

While there is no file at `DOWNLOAD_FILE`, ClipKeep is on pre-order. Each buyer gets a "pre-order confirmed" email, and the sale is recorded as `pending`. Once the signed build is in place, email every waiting buyer their download link:

    cd /opt/soheili-labs-website/services/clipkeep-fulfillment
    sudo -u clipkeep node --env-file=/etc/clipkeep-fulfillment.env send-pending.mjs          # dry run: lists who would be emailed
    sudo -u clipkeep node --env-file=/etc/clipkeep-fulfillment.env send-pending.mjs --send   # sends

After that, new buyers get the download straight away. It is safe to run again: buyers who were already sent a link are skipped.
Refund anyone who asks before their download arrives.

## Tests

    npm test

## First-time setup on the VPS

    # code and service account
    sudo git clone https://github.com/hsoheili/Soheili-Labs-Website.git /opt/soheili-labs-website
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin clipkeep

    # the file buyers download (signed and notarized build)
    sudo mkdir -p /srv/clipkeep && sudo cp ClipKeep.dmg /srv/clipkeep/ && sudo chmod 644 /srv/clipkeep/ClipKeep.dmg

    # settings
    sudo cp /opt/soheili-labs-website/services/clipkeep-fulfillment/deploy/clipkeep-fulfillment.env.example /etc/clipkeep-fulfillment.env
    sudo nano /etc/clipkeep-fulfillment.env
    sudo chown root:clipkeep /etc/clipkeep-fulfillment.env && sudo chmod 640 /etc/clipkeep-fulfillment.env

    # service
    sudo cp /opt/soheili-labs-website/services/clipkeep-fulfillment/deploy/clipkeep-fulfillment.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable --now clipkeep-fulfillment
    curl -s http://127.0.0.1:3202/health

    # nginx + HTTPS (after the DNS A record for downloads.soheililabs.com points at this server)
    sudo cp /opt/soheili-labs-website/services/clipkeep-fulfillment/deploy/nginx-downloads.soheililabs.com.conf /etc/nginx/sites-available/downloads.soheililabs.com
    sudo ln -s /etc/nginx/sites-available/downloads.soheililabs.com /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d downloads.soheililabs.com

## Updating

    cd /opt/soheili-labs-website && sudo git pull --ff-only && sudo systemctl restart clipkeep-fulfillment

To ship a new ClipKeep build, replace `/srv/clipkeep/ClipKeep.dmg`. Existing links serve the new file.

## Re-sending a link

Find the buyer's Checkout Session id (`cs_…`) in Stripe, then:

    cd /opt/soheili-labs-website/services/clipkeep-fulfillment
    sudo -u clipkeep node --env-file=/etc/clipkeep-fulfillment.env issue-link.mjs cs_live_...

Sales are recorded in `/var/lib/clipkeep-fulfillment/fulfilled-sessions.jsonl`.
