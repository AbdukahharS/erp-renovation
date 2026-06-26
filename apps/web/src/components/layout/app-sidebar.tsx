import { Link, useRouterState } from "@tanstack/react-router";
import { LogOutIcon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { type SessionMe, signOut } from "@/lib/auth";

export type NavItem = { labelKey: string; to: string; icon: LucideIcon };
export type NavGroup = { labelKey: string; items: NavItem[] };

export function AppSidebar({
	brand,
	subtitle,
	groups,
	me,
}: {
	brand: string;
	subtitle?: string;
	groups: NavGroup[];
	me: SessionMe | null;
}) {
	const { t } = useTranslation();
	const { location } = useRouterState();
	const path = location.pathname;
	const initials =
		me?.user?.name
			?.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase())
			.join("") ||
		me?.user?.email?.[0]?.toUpperCase() ||
		"?";

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1">
					<img src="/logo.png" alt={brand} className="size-8 shrink-0 object-contain" />
					<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
						<span className="font-semibold truncate">{brand}</span>
						{subtitle ? (
							<span className="text-xs text-muted-foreground truncate">{subtitle}</span>
						) : null}
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				{groups.map((g) => (
					<SidebarGroup key={g.labelKey}>
						<SidebarGroupLabel>{t(g.labelKey)}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{g.items.map((item) => {
									const active =
										path === item.to || (item.to !== "/" && path.startsWith(`${item.to}/`));
									const Icon = item.icon;
									const label = t(item.labelKey);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												isActive={active}
												tooltip={label}
												render={<Link to={item.to} />}
											>
												<Icon className="size-4" />
												<span>{label}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-1.5" />
						}
					>
						<Avatar className="size-7">
							<AvatarFallback className="text-xs">{initials}</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
							<span className="font-medium truncate">{me?.user?.name ?? t("auth.guest")}</span>
							<span className="text-xs text-muted-foreground truncate">
								{me?.user?.email ?? ""}
							</span>
						</div>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" align="end" className="w-56">
						<DropdownMenuGroup>
							<DropdownMenuLabel>{me?.user?.email ?? t("auth.account")}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={async () => {
									await signOut();
									window.location.href = "/login";
								}}
							>
								<LogOutIcon className="mr-2 size-4" />
								{t("auth.signOut")}
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
