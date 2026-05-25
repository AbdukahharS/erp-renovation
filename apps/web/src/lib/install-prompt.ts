interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (e) => {
		e.preventDefault();
		deferred = e as BeforeInstallPromptEvent;
		for (const fn of listeners) fn(true);
	});
	window.addEventListener("appinstalled", () => {
		deferred = null;
		for (const fn of listeners) fn(false);
	});
}

export function isInstallAvailable(): boolean {
	return deferred !== null;
}

export function onInstallAvailableChange(fn: (available: boolean) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
	if (!deferred) return "unavailable";
	await deferred.prompt();
	const choice = await deferred.userChoice;
	deferred = null;
	for (const fn of listeners) fn(false);
	return choice.outcome;
}
