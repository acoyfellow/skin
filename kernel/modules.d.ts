declare module "*.css" {
	const content: string;
	export default content;
}

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
}

declare module "*.png" {
	const content: ArrayBuffer;
	export default content;
}

declare module "*.ico" {
	const content: ArrayBuffer;
	export default content;
}

declare module "*.jpg" {
	const content: ArrayBuffer;
	export default content;
}

declare module "*.webp" {
	const content: ArrayBuffer;
	export default content;
}
