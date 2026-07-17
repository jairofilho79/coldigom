import { describe, expect, it } from 'vitest';
import { parseDriveUrl } from '../driveParse';
import { decryptSecret, encryptSecret } from '../driveCrypto';

describe('parseDriveUrl', () => {
  it('parses folder links', () => {
    expect(
      parseDriveUrl('https://drive.google.com/drive/folders/abc123XYZ_-?usp=sharing')
    ).toEqual({ id: 'abc123XYZ_-', kind: 'folder' });
  });

  it('parses file links', () => {
    expect(
      parseDriveUrl('https://drive.google.com/file/d/fileId99/view?usp=drive_link')
    ).toEqual({ id: 'fileId99', kind: 'file' });
  });

  it('parses open?id=', () => {
    expect(parseDriveUrl('https://drive.google.com/open?id=openId55')).toEqual({
      id: 'openId55',
      kind: 'file',
    });
  });

  it('rejects non-google hosts', () => {
    expect(() => parseDriveUrl('https://example.com/folders/x')).toThrow(/not a Google Drive/i);
  });
});

describe('driveCrypto', () => {
  it('round-trips secrets', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const enc = await encryptSecret(secret, 'refresh-token-value');
    expect(enc).toContain(':');
    expect(await decryptSecret(secret, enc)).toBe('refresh-token-value');
  });
});
