import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const ASSETS = "kernel/assets";

const ICON = `${ASSETS}/icon-512.png`;

const HERO = `${ASSETS}/hero.png`;

const BACKGROUND = { r: 39, g: 45, b: 63, alpha: 1 };

export const SPLASH = [
	{ width: 1320, height: 2868, deviceWidth: 440, deviceHeight: 956, ratio: 3, name: "iPhone 16 Pro Max" },
	{ width: 1206, height: 2622, deviceWidth: 402, deviceHeight: 874, ratio: 3, name: "iPhone 16 Pro" },
	{ width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3, name: "iPhone 16 Plus, 15 Pro Max, 14 Pro Max" },
	{ width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3, name: "iPhone 16, 15, 15 Pro, 14 Pro" },
	{ width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3, name: "iPhone 14 Plus, 13 Pro Max, 12 Pro Max" },
	{ width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3, name: "iPhone 16e, 14, 13, 12" },
	{ width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3, name: "iPhone 13 mini, 12 mini, 11 Pro, XS, X" },
	{ width: 1242, height: 2688, deviceWidth: 414, deviceHeight: 896, ratio: 3, name: "iPhone 11 Pro Max, XS Max" },
	{ width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2, name: "iPhone 11, XR" },
	{ width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2, name: "iPhone SE, 8" },
	{ width: 2048, height: 2732, deviceWidth: 1024, deviceHeight: 1366, ratio: 2, name: "iPad Pro 12.9" },
	{ width: 1668, height: 2388, deviceWidth: 834, deviceHeight: 1194, ratio: 2, name: "iPad Pro 11, Air 11" },
	{ width: 1640, height: 2360, deviceWidth: 820, deviceHeight: 1180, ratio: 2, name: "iPad Air, iPad 10" },
];

const icon = (size) => sharp(ICON).resize(size, size, { kernel: "lanczos3" });

const padded = async (canvas, inner) =>
	sharp({ create: { width: canvas, height: canvas, channels: 4, background: BACKGROUND } })
		.composite([{ input: await icon(inner).png().toBuffer(), gravity: "center" }])
		.png({ compressionLevel: 9 });

const ico = (frames) => {
	const header = Buffer.alloc(6 + frames.length * 16);

	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(frames.length, 4);

	let offset = header.length;

	frames.forEach(({ size, data }, index) => {
		const entry = 6 + index * 16;

		header.writeUInt8(size >= 256 ? 0 : size, entry);
		header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(data.length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += data.length;
	});

	return Buffer.concat([header, ...frames.map((frame) => frame.data)]);
};

const splash = async ({ width, height }) => {
	const mark = Math.round(Math.min(width, height) * 0.28);
	const rounded = Buffer.from(`<svg width="${mark}" height="${mark}"><rect width="${mark}" height="${mark}" rx="${Math.round(mark * 0.22)}"/></svg>`);
	const art = await icon(mark).composite([{ input: rounded, blend: "dest-in" }]).png().toBuffer();

	return sharp({ create: { width, height, channels: 4, background: BACKGROUND } }).composite([{ input: art, gravity: "center" }]).png({ compressionLevel: 9, palette: true });
};

const out = (path, buffer) => {
	writeFileSync(path, buffer);
	console.log(`${path} ${Math.round(buffer.length / 1024)} KB`);
};

mkdirSync(`${ASSETS}/splash`, { recursive: true });

out(`${ASSETS}/apple-touch-icon.png`, await icon(180).flatten({ background: BACKGROUND }).png({ compressionLevel: 9 }).toBuffer());

out(`${ASSETS}/icon-32.png`, await icon(32).png().toBuffer());

out(`${ASSETS}/icon-64.png`, await icon(64).png().toBuffer());

out(`${ASSETS}/icon-maskable-512.png`, await (await padded(512, 410)).toBuffer());

out(`${ASSETS}/favicon.ico`, ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await icon(size).png().toBuffer() })))));

out(`${ASSETS}/hero-640.webp`, await sharp(HERO).resize(640, 640).webp({ quality: 82 }).toBuffer());

out(`${ASSETS}/hero-320.webp`, await sharp(HERO).resize(320, 320).webp({ quality: 82 }).toBuffer());

out(
	`${ASSETS}/og.jpg`,
	await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 245, g: 240, b: 255, alpha: 1 } } })
		.composite([{ input: await sharp(HERO).resize(630, 630).png().toBuffer(), gravity: "east" }, { input: await icon(220).png().toBuffer(), left: 120, top: 205 }])
		.flatten({ background: "#f5f0ff" })
		.jpeg({ quality: 84, mozjpeg: true })
		.toBuffer(),
);

for (const size of SPLASH) out(`${ASSETS}/splash/${size.width}x${size.height}.png`, await (await splash(size)).toBuffer());
