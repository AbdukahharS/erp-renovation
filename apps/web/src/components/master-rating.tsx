import { CheckCircle2Icon, GaugeIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MasterRatingPayload = {
	acceptedCount: number;
	rejectedCount: number;
	avgDurationRatio: string | null;
	score: number | null;
	acceptanceRate: number | null;
	speedScore: number | null;
	defectScore: number | null;
} | null;

type Tier = "great" | "good" | "watch" | "unrated";

function tierOf(score: number | null | undefined): Tier {
	if (score == null) return "unrated";
	if (score >= 80) return "great";
	if (score >= 60) return "good";
	return "watch";
}

const TIER_RING: Record<Tier, string> = {
	great: "text-emerald-600",
	good: "text-amber-600",
	watch: "text-rose-600",
	unrated: "text-muted-foreground",
};

const TIER_TRACK: Record<Tier, string> = {
	great: "bg-emerald-100",
	good: "bg-amber-100",
	watch: "bg-rose-100",
	unrated: "bg-muted",
};

const TIER_FILL: Record<Tier, string> = {
	great: "bg-emerald-500",
	good: "bg-amber-500",
	watch: "bg-rose-500",
	unrated: "bg-muted-foreground/40",
};

/**
 * Compact score chip with a conic-gradient ring. Used in the roster table.
 * Wrap in a tooltip provider above so the breakdown surfaces on hover.
 */
export function RatingBadge({ rating }: { rating: MasterRatingPayload }) {
	const { t } = useTranslation();
	const tier = tierOf(rating?.score);
	const score = rating?.score ?? null;
	const angle = score != null ? (score / 100) * 360 : 0;

	const ring = (
		<div className="inline-flex items-center gap-2">
			<div
				className={cn("relative size-9 shrink-0 rounded-full", TIER_TRACK[tier])}
				style={
					score != null
						? {
								background: `conic-gradient(currentColor ${angle}deg, transparent ${angle}deg)`,
							}
						: undefined
				}
			>
				<div className={cn("absolute inset-0 rounded-full", TIER_RING[tier])} aria-hidden />
				<div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-background text-[11px] font-semibold tabular-nums">
					{score != null ? score : "–"}
				</div>
			</div>
			<div className="flex flex-col gap-0.5">
				<div className="flex items-center gap-1 text-[11px] font-medium tabular-nums">
					<CheckCircle2Icon className="size-3 text-emerald-600" />
					<span>{rating?.acceptedCount ?? 0}</span>
					<XCircleIcon className="ml-1 size-3 text-rose-600" />
					<span>{rating?.rejectedCount ?? 0}</span>
				</div>
				<div className="text-[10px] text-muted-foreground">{t(`rating.tier.${tier}`)}</div>
			</div>
		</div>
	);

	if (!rating) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger className="cursor-help">{ring}</TooltipTrigger>
					<TooltipContent>{t("rating.noActivityTooltip")}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger className="cursor-help">{ring}</TooltipTrigger>
				<TooltipContent className="max-w-[260px]">
					<div className="space-y-1.5">
						<div className="text-[11px] font-semibold">
							{t("rating.scoreLabel")} {score ?? "–"} / 100
						</div>
						<MiniRow
							label={t("rating.speed")}
							value={rating.speedScore}
							hint={
								rating.avgDurationRatio
									? t("rating.speedHint", {
											ratio: Number(rating.avgDurationRatio).toFixed(2),
										})
									: t("rating.speedHintNone")
							}
						/>
						<MiniRow
							label={t("rating.defect")}
							value={rating.defectScore}
							hint={t("rating.defectHint", {
								accepted: rating.acceptedCount,
								rejected: rating.rejectedCount,
							})}
						/>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function MiniRow({ label, value, hint }: { label: string; value: number | null; hint: string }) {
	const pct = value != null ? Math.round(value * 100) : null;
	return (
		<div className="space-y-0.5">
			<div className="flex items-center justify-between gap-2 text-[10px]">
				<span>{label}</span>
				<span className="tabular-nums">{pct != null ? `${pct}%` : "—"}</span>
			</div>
			<div className="h-1 w-full overflow-hidden rounded-full bg-background/20">
				<div className="h-full rounded-full bg-background/80" style={{ width: `${pct ?? 0}%` }} />
			</div>
			<div className="text-[10px] opacity-70">{hint}</div>
		</div>
	);
}

/**
 * Full breakdown card for the master detail / self-profile views.
 * Shows the score gauge, both component bars, and supporting counters.
 */
export function RatingBreakdownCard({ rating }: { rating: MasterRatingPayload }) {
	const { t } = useTranslation();
	const tier = tierOf(rating?.score);
	const score = rating?.score ?? null;
	const angle = score != null ? (score / 100) * 360 : 0;

	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<GaugeIcon className={cn("size-4", TIER_RING[tier])} />
					<h3 className="text-sm font-semibold">{t("rating.title")}</h3>
				</div>
				<span
					className={cn(
						"rounded-full px-2 py-0.5 text-[10px] font-medium",
						TIER_TRACK[tier],
						TIER_RING[tier],
					)}
				>
					{t(`rating.tier.${tier}`)}
				</span>
			</div>

			<div className="flex items-center gap-5">
				<div
					className={cn("relative size-20 shrink-0 rounded-full", TIER_TRACK[tier])}
					style={
						score != null
							? {
									background: `conic-gradient(currentColor ${angle}deg, transparent ${angle}deg)`,
								}
							: undefined
					}
				>
					<div className={cn("absolute inset-0 rounded-full", TIER_RING[tier])} aria-hidden />
					<div className="absolute inset-[5px] flex flex-col items-center justify-center rounded-full bg-background">
						<span className="text-2xl font-semibold tabular-nums leading-none">
							{score != null ? score : "–"}
						</span>
						<span className="text-[9px] uppercase tracking-wide text-muted-foreground">
							{t("rating.outOf100")}
						</span>
					</div>
				</div>

				<div className="flex-1 space-y-2">
					<BreakdownRow
						label={t("rating.speed")}
						value={rating?.speedScore ?? null}
						tier={tier}
						hint={
							rating?.avgDurationRatio
								? t("rating.speedHint", {
										ratio: Number(rating.avgDurationRatio).toFixed(2),
									})
								: t("rating.speedHintNone")
						}
					/>
					<BreakdownRow
						label={t("rating.defect")}
						value={rating?.defectScore ?? null}
						tier={tier}
						hint={t("rating.defectHint", {
							accepted: rating?.acceptedCount ?? 0,
							rejected: rating?.rejectedCount ?? 0,
						})}
					/>
				</div>
			</div>

			<div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-xs">
				<Stat
					icon={<CheckCircle2Icon className="size-3.5 text-emerald-600" />}
					label={t("rating.accepted")}
					value={rating?.acceptedCount ?? 0}
				/>
				<Stat
					icon={<XCircleIcon className="size-3.5 text-rose-600" />}
					label={t("rating.rejected")}
					value={rating?.rejectedCount ?? 0}
				/>
				<Stat
					icon={<ShieldAlertIcon className="size-3.5 text-amber-600" />}
					label={t("rating.avgRatio")}
					value={rating?.avgDurationRatio ? Number(rating.avgDurationRatio).toFixed(2) : "—"}
				/>
			</div>

			{!rating && (
				<p className="mt-3 text-xs text-muted-foreground">{t("rating.noActivityTooltip")}</p>
			)}
		</div>
	);
}

function BreakdownRow({
	label,
	value,
	tier,
	hint,
}: {
	label: string;
	value: number | null;
	tier: Tier;
	hint: string;
}) {
	const pct = value != null ? Math.round(value * 100) : null;
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-xs">
				<span className="font-medium">{label}</span>
				<span className="tabular-nums text-muted-foreground">{pct != null ? `${pct}%` : "—"}</span>
			</div>
			<div className={cn("h-1.5 w-full overflow-hidden rounded-full", TIER_TRACK[tier])}>
				<div
					className={cn("h-full rounded-full transition-all", TIER_FILL[tier])}
					style={{ width: `${pct ?? 0}%` }}
				/>
			</div>
			<div className="text-[10px] text-muted-foreground">{hint}</div>
		</div>
	);
}

function Stat({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: number | string;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
				{icon}
				<span>{label}</span>
			</div>
			<div className="text-sm font-semibold tabular-nums">{value}</div>
		</div>
	);
}
