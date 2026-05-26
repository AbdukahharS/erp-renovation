import { Link, useRouterState } from "@tanstack/react-router";
import { BellIcon, HomeIcon, type LucideIcon, UserIcon, WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { to: string; label: string; icon: LucideIcon };

const masterTabs: Tab[] = [
	{ to: "/master", label: "Home", icon: HomeIcon },
	{ to: "/master/finance", label: "Wallet", icon: WalletIcon },
	{ to: "/notifications", label: "Inbox", icon: BellIcon },
	{ to: "/master/profile", label: "Profile", icon: UserIcon },
];

const inspectorTabs: Tab[] = [
	{ to: "/inspector", label: "Home", icon: HomeIcon },
	{ to: "/notifications", label: "Inbox", icon: BellIcon },
	{ to: "/inspector/profile", label: "Profile", icon: UserIcon },
];

export function FieldTabs({ variant }: { variant: "master" | "inspector" }) {
	const { location } = useRouterState();
	const path = location.pathname;
	const tabs = variant === "master" ? masterTabs : inspectorTabs;
	return (
		<nav
			aria-label="Primary"
			className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
		>
			<ul className="mx-auto grid max-w-md grid-cols-4 [&:has(:nth-child(3):last-child)]:grid-cols-3">
				{tabs.map((t) => {
					const active = path === t.to || path.startsWith(`${t.to}/`);
					const Icon = t.icon;
					return (
						<li key={t.to}>
							<Link
								to={t.to}
								className={cn(
									"flex flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
									active ? "text-primary" : "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="size-5" />
								<span>{t.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
