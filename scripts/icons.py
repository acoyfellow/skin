import base64, struct, zlib, math

def png(size):
    rows = []
    cx = cy = size / 2
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx, dy = (x + 0.5 - cx) / size, (y + 0.5 - cy) / size
            body = (dx / 0.30) ** 2 + (dy / 0.40) ** 2 <= 1
            eye = any(((x + 0.5) / size - ex) ** 2 + ((y + 0.5) / size - 0.36) ** 2 <= 0.045 ** 2 for ex in (0.42, 0.58))
            if body and not eye:
                row += bytes((124, 58, 237, 255))
            else:
                row += bytes((23, 23, 23, 255))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")

out = ["export const ICON_192 = \"" + base64.b64encode(png(192)).decode() + "\";", "", "export const ICON_512 = \"" + base64.b64encode(png(512)).decode() + "\";", ""]
open("kernel/icons.gen.ts", "w").write("\n".join(out))
print("icons written")
