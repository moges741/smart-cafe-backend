import { setDefaultResultOrder } from 'node:dns';

// Prefer IPv4 for outbound HTTP (Resend API). Some networks fail on IPv6 routes.
setDefaultResultOrder('ipv4first');
