import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PropertyFinanceSummary } from "@repo/validators";

const styles = StyleSheet.create({
	page: { padding: 36, fontSize: 11, fontFamily: "Helvetica" },
	h1: { fontSize: 18, marginBottom: 16, fontFamily: "Helvetica-Bold" },
	h2: { fontSize: 13, marginTop: 16, marginBottom: 8, fontFamily: "Helvetica-Bold" },
	row: { flexDirection: "row", paddingVertical: 4, borderBottom: "1pt solid #ddd" },
	rowHeader: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold" },
	label: { flex: 1 },
	value: { width: 120, textAlign: "right" },
	muted: { color: "#666", fontSize: 9 },
	totalRow: {
		flexDirection: "row",
		paddingVertical: 6,
		marginTop: 4,
		borderTop: "1pt solid #000",
		fontFamily: "Helvetica-Bold",
	},
});

function fmt(amount: string | number): string {
	const n = typeof amount === "number" ? amount : Number(amount);
	return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Defect = { subStageName: string; rejectionCount: number };

function HandoverCertificate({
	property,
	summary,
	closedBy,
	closedAt,
}: {
	property: { id: string; name: string; address: string };
	summary: PropertyFinanceSummary;
	closedBy: string;
	closedAt: Date;
}) {
	return (
		<Document>
			<Page size="A4" style={styles.page}>
				<Text style={styles.h1}>Property Handover Certificate</Text>
				<View style={styles.row}>
					<Text style={styles.label}>Property</Text>
					<Text style={styles.value}>{property.name}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Address</Text>
					<Text style={styles.value}>{property.address}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Area</Text>
					<Text style={styles.value}>{Number(summary.areaSqm).toFixed(2)} m²</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Planned cost</Text>
					<Text style={styles.value}>{fmt(summary.plannedTotal)}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Closed by</Text>
					<Text style={styles.value}>{closedBy}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Closed at</Text>
					<Text style={styles.value}>{closedAt.toISOString().slice(0, 19).replace("T", " ")}</Text>
				</View>
				<Text style={[styles.h2, { marginTop: 28 }]}>Declaration</Text>
				<Text>
					The renovation work on the property identified above has been completed in accordance with
					the contracted scope and accepted by the technical supervisor against the agreed
					checklist. All stages have passed quality acceptance and the property is hereby delivered
					to the client.
				</Text>
			</Page>
		</Document>
	);
}

function FinalReport({
	property,
	summary,
	defects,
	closedAt,
}: {
	property: { id: string; name: string; address: string };
	summary: PropertyFinanceSummary;
	defects: Defect[];
	closedAt: Date;
}) {
	return (
		<Document>
			<Page size="A4" style={styles.page}>
				<Text style={styles.h1}>Final Financial Report</Text>
				<Text>{property.name}</Text>
				<Text style={styles.muted}>{property.address}</Text>
				<Text style={styles.muted}>
					Closed {closedAt.toISOString().slice(0, 10)} • Status {summary.status}
				</Text>

				<Text style={styles.h2}>Plan vs Actual</Text>
				<View style={styles.rowHeader}>
					<Text style={styles.label}>Line</Text>
					<Text style={styles.value}>Amount</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>
						Planned total ({Number(summary.areaSqm).toFixed(2)} m² × {fmt(summary.plannedUnitCost)}
						/m²)
					</Text>
					<Text style={styles.value}>{fmt(summary.plannedTotal)}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Wages credited</Text>
					<Text style={styles.value}>{fmt(summary.accruedWages)}</Text>
				</View>
				{summary.costsByCategory.map((c) => (
					<View key={c.category} style={styles.row}>
						<Text style={styles.label}>{c.category.replace("_", " ").toLowerCase()}</Text>
						<Text style={styles.value}>{fmt(c.total)}</Text>
					</View>
				))}
				<View style={styles.row}>
					<Text style={styles.label}>Fines (offset)</Text>
					<Text style={styles.value}>{fmt(summary.finesTotal)}</Text>
				</View>
				<View style={styles.totalRow}>
					<Text style={styles.label}>Actual total</Text>
					<Text style={styles.value}>{fmt(summary.actualTotal)}</Text>
				</View>
				<View style={styles.totalRow}>
					<Text style={styles.label}>Net profit</Text>
					<Text style={styles.value}>{fmt(summary.netProfit)}</Text>
				</View>

				<Text style={styles.h2}>Defect summary</Text>
				{defects.length === 0 ? (
					<Text style={styles.muted}>No rejections recorded.</Text>
				) : (
					<>
						<View style={styles.rowHeader}>
							<Text style={styles.label}>Sub-stage</Text>
							<Text style={styles.value}>Rejections</Text>
						</View>
						{defects.map((d) => (
							<View key={d.subStageName} style={styles.row}>
								<Text style={styles.label}>{d.subStageName}</Text>
								<Text style={styles.value}>{d.rejectionCount}</Text>
							</View>
						))}
					</>
				)}
			</Page>
		</Document>
	);
}

export async function renderHandoverCertificate(args: {
	property: { id: string; name: string; address: string };
	summary: PropertyFinanceSummary;
	closedBy: string;
	closedAt: Date;
}): Promise<Buffer> {
	return await renderToBuffer(<HandoverCertificate {...args} />);
}

export async function renderFinalReport(args: {
	property: { id: string; name: string; address: string };
	summary: PropertyFinanceSummary;
	defects: Defect[];
	closedAt: Date;
}): Promise<Buffer> {
	return await renderToBuffer(<FinalReport {...args} />);
}
