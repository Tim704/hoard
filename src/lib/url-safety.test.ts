import { describe, expect, it } from 'vitest';

import { isAllowedPushUrl, pushUrlProblem } from './url-safety';

describe('pushUrlProblem', () => {
  it('accepts public https URLs', () => {
    for (const u of [
      'https://ntfy.sh/my-topic',
      'https://discord.com/api/webhooks/1/abc',
      'https://ntfy.example.org:8443/topic',
      'https://8.8.8.8/x',
      'https://[2606:4700::1111]/x',
      'https://100.128.0.1/x', // just outside CGNAT
      'https://172.32.0.1/x', // just outside 172.16/12
    ]) {
      expect(pushUrlProblem(u), u).toBeNull();
    }
  });

  it('rejects non-https and junk', () => {
    expect(pushUrlProblem('http://ntfy.sh/x')).toBe('Only https:// URLs are accepted.');
    expect(pushUrlProblem('ntfy.sh/x')).toBe('Enter a full URL.');
    expect(pushUrlProblem('javascript:alert(1)')).toBe('Only https:// URLs are accepted.');
    expect(pushUrlProblem('https://user:pw@ntfy.sh/x')).not.toBeNull();
  });

  it('rejects localhost and private, loopback and link-local IP literals', () => {
    for (const u of [
      'https://localhost/x',
      'https://LOCALHOST./x',
      'https://foo.localhost/x',
      'https://127.0.0.1/x',
      'https://127.1/x', // shorthand → 127.0.0.1
      'https://2130706433/x', // decimal → 127.0.0.1
      'https://0x7f000001/x',
      'https://0.0.0.0/x',
      'https://10.1.2.3/x',
      'https://172.16.0.1/x',
      'https://172.31.255.255/x',
      'https://192.168.1.10:8080/x',
      'https://169.254.169.254/latest',
      'https://100.64.0.1/x', // Tailscale / CGNAT
      'https://100.127.255.255/x',
      'https://[::1]/x',
      'https://[::]/x',
      'https://[fd12:3456::1]/x',
      'https://[fe80::1]/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://[::ffff:c0a8:101]/x', // 192.168.1.1
    ]) {
      expect(pushUrlProblem(u), u).toBe('Local and private network addresses are not accepted.');
    }
  });

  it('isAllowedPushUrl handles null', () => {
    expect(isAllowedPushUrl(null)).toBe(false);
    expect(isAllowedPushUrl('https://ntfy.sh/x')).toBe(true);
  });
});
