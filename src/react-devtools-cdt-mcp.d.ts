declare module "react-devtools-cdt-mcp/register";

declare module "react-devtools-cdt-mcp" {
	export function register(target?: object): {
		facade: unknown;
		unregister: () => void;
	};
}
