# Built SPA route smoke

After `npm run build`, run:

```sh
npm run smoke:spa
```

The smoke starts Vite preview on loopback with a strict port, waits up to 12 seconds for readiness, requests `/login` and `/download`, and fetches the real hashed JavaScript entry referenced by the built `dist/index.html`. The preview process is stopped in a `finally` path, including route, asset, timeout, and port-conflict failures.

A pass proves only that the built frontend shell and entry bundle are delivered over local HTTP for those routes. It does not test browser rendering, authentication, backend connectivity, database/provider/native integrations, permissions, or production deployment and must not be treated as product readiness evidence.
