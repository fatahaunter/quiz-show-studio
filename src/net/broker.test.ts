import { describe, expect, it } from 'vitest';
import { formatBroker, parseBroker } from './broker';
import { normalizeSite } from './site';

describe('connection settings', () => {
  it('parses host:port with an optional secure flag', () => {
    expect(parseBroker('192.168.1.20:9000')).toEqual({ host: '192.168.1.20', port: 9000, secure: false });
    expect(parseBroker(' my-pc.local:443:s ')).toEqual({ host: 'my-pc.local', port: 443, secure: true });
    expect(formatBroker({ host: 'a.b', port: 1234, secure: true })).toBe('a.b:1234:s');
  });
  it('rejects junk, bad ports and URLs', () => {
    for (const bad of ['', 'localhost', 'host:99999', 'host:0', 'http://host:9000', 'ho st:9000', 'host:9000:x', 'a@b:90']) expect(parseBroker(bad)).toBeNull();
  });
  it('accepts only http(s) site addresses and strips query and hash', () => {
    expect(normalizeSite('https://example.com/quiz/#/join/ABCDE?x=1')).toBe('https://example.com/quiz/');
    expect(normalizeSite('javascript:alert(1)')).toBeNull();
    expect(normalizeSite('ftp://x')).toBeNull();
    expect(normalizeSite('not a url')).toBeNull();
  });
});
