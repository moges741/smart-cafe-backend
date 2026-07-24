import { setDefaultResultOrder } from 'node:dns';

// Resend uses native fetch; on some networks IPv6 resolution fails while IPv4 works.
setDefaultResultOrder('ipv4first');
