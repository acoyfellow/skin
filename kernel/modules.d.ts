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
