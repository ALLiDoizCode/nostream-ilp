# Dashboard Usage Guide

## Overview

The Nostream-ILP Dashboard provides real-time monitoring of your relay and payment infrastructure. It displays key metrics for Nostr events, ILP payments, and system health.

## Accessing the Dashboard

**URL:** `https://relay.example.com/dashboard`

**Authentication:** HTTP Basic Auth
- Username: `admin` (default, configurable via `DASHBOARD_USERNAME`)
- Password: Set via `DASHBOARD_PASSWORD` environment variable (REQUIRED)

**Security Requirements:**
- Dashboard MUST be accessed over HTTPS in production
- Set a strong password for `DASHBOARD_PASSWORD`
- Consider IP whitelisting for additional security

## Dashboard Sections

### 1. Relay Status

Displays Nostr relay metrics:
- **Total Events**: Number of events stored in the database
- **Events (24h)**: Events received in the last 24 hours
- **Active Subscriptions**: Current active REQ subscriptions
- **Connected Clients**: Current WebSocket connections

### 2. Payment Status

Displays Interledger payment balances:
- **BTC Balance**: Bitcoin balance (in satoshis, displayed as BTC)
- **BASE Balance**: Base L2 balance (in wei, displayed as BASE)
- **AKT Balance**: Akash balance (in uakt, displayed as AKT)
- **XRP Balance**: XRP balance (in drops, displayed as XRP)

**Note:** Active channels and routing stats coming in Epic 2

### 3. System Health

Displays overall system health and individual service status:
- **Overall Status**: `HEALTHY`, `DEGRADED`, or `UNHEALTHY`
- **Service Health**:
  - Nostream: Relay service status
  - Dassie RPC: ILP payment node connection
  - PostgreSQL: Event database
  - Redis: Subscription cache

## Update Mechanism

- **Polling Interval**: Dashboard polls `/dashboard/metrics` every 5 seconds
- **Auto-refresh**: Last updated timestamp shows when data was last fetched
- **Connection Indicator**: Green dot = connected, Red dot (pulsing) = disconnected

## Mobile Access

The dashboard is fully responsive and works on:
- Desktop (full 3-column grid layout)
- Tablet (single-column layout at <768px)
- Mobile (optimized layout at <480px)

## Troubleshooting

### Dashboard Won't Load
- Verify `DASHBOARD_PASSWORD` is set in environment
- Check relay is accessible via HTTPS
- Check browser console for errors

### Metrics Not Updating
- Check connection status indicator (should be green)
- Verify Dassie RPC is running and accessible
- Check `/healthz` endpoint for system health

### Authentication Fails
- Verify `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` are correctly set
- Clear browser's saved credentials and re-enter
- Check for rate limiting (100 requests/minute limit)

## Security Best Practices

1. **Use HTTPS**: Never access dashboard over HTTP in production
2. **Strong Password**: Use a long, random password for `DASHBOARD_PASSWORD`
3. **Restrict Access**: Use firewall rules or reverse proxy to limit dashboard access
4. **Monitor Access**: Check logs for unauthorized access attempts
5. **Rotate Credentials**: Periodically change dashboard password

## Configuration

Edit `.env` file:

```bash
# Dashboard Authentication (Story 1.8)
DASHBOARD_USERNAME=admin          # Optional, default: admin
DASHBOARD_PASSWORD=your_password  # REQUIRED
```

Restart relay after configuration changes:

```bash
docker-compose restart
```

## Future Enhancements (Epic 2+)

- WebSocket real-time updates (replacing HTTP polling)
- Routing stats and channel monitoring
- Revenue tracking by event kind
- Historical charts and trends
- Export metrics to CSV/JSON
- Integration with Grafana/Prometheus
